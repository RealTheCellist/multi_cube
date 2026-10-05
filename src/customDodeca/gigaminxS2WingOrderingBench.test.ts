// GIGAMINX_S2_CANDIDATE_ORDERING_SCREENING_V1 -- research/prototype probe.
// Scope: Wing Phase 2 candidate ORDER only. Candidate set, acceptance rule,
// exact/compound-finish, visited-state semantics, and the S1
// permutation-composition evaluation itself are all untouched -- this file
// reimplements solveWings' own control flow verbatim (same constants/tiers)
// so the three ordering policies can be swapped in without touching
// production solveWings/findSafeWingApplication call sites, which never
// pass the new optional candidatesOverride/onEval hooks and so run
// byte-identical to before this file existed.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, areCornersSolved, areWingsSolved, __dev } from "./gigaminxSolver";

const { wingKeyFor, countWrongWings, wingCommutators, tryExactFinishWings, tryCompoundFinishWings, findSafeWingApplication, positionSetupTables } = __dev as any;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function applySeq(state: GigaminxState, seq: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of seq) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}
function wingStateSig(state: GigaminxState): string {
  return `${state.wingPerm.join(",")}|${state.wingOrient.join(",")}`;
}
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

type Policy = "A_BASELINE" | "B_LENGTH_ASC" | "C_LENGTH_SCORE";

interface WingSolveStats {
  candidateEvaluations: number;
  acceptedRanks: number[];
  acceptedLens: number[];
  evalLens: number[];
  wingRounds: number;
  acceptedApplications: number;
  candidateEvalTimeMs: number;
  wingTotalMs: number;
}

function runInstrumentedWingSolve(state: GigaminxState, policy: Policy, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; stats: WingSolveStats } {
  const baseCommutators = wingCommutators() as { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
  const lengthAscOrder = [...baseCommutators].sort((a, b) => a.seq.length - b.seq.length);
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;

  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([wingStateSig(current)]);

  const stats: WingSolveStats = { candidateEvaluations: 0, acceptedRanks: [], acceptedLens: [], evalLens: [], wingRounds: 0, acceptedApplications: 0, candidateEvalTimeMs: 0, wingTotalMs: 0 };
  const wingT0 = Date.now();

  function orderForRound(wrongPositions: readonly number[]): { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[] {
    if (policy === "A_BASELINE") return baseCommutators;
    if (policy === "B_LENGTH_ASC") return lengthAscOrder;
    // C_LENGTH_SCORE: cheap per-round structural score, O(library size x support
    // size) -- no BFS/simulation/extra solver calls, only fields already on
    // each Commutator plus O(1) set-membership checks against this round's
    // own wrong/fixed sets. Lower score tried first: shorter sequences,
    // commutators whose support overlaps more wrong positions (more likely
    // to make real progress), and FEWER already-fixed positions (less likely
    // to trip enforceFixed or inflate wrongAfter). Weights (2, 3) are a
    // simple, documented choice, not a tuned optimum -- this sprint's
    // question is whether cheap ordering helps at all, not how to tune it.
    const wrongSet = new Set(wrongPositions);
    return baseCommutators
      .map((c) => {
        let wrongOverlap = 0;
        let fixedOverlap = 0;
        for (const p of c.support) {
          if (wrongSet.has(p)) wrongOverlap++;
          if (fixed.has(p)) fixedOverlap++;
        }
        return { c, score: c.seq.length - 2 * wrongOverlap + 3 * fixedOverlap };
      })
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c);
  }

  function callFind(order: { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[], target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean): { found: { state: GigaminxState; seq: GigaminxTurn[] } | null; rank: number; len: number } {
    let rank = 0;
    let len = 0;
    const t0 = Date.now();
    const found = findSafeWingApplication(
      baseCommutators,
      current,
      fixed,
      target,
      wrongAfterThreshold,
      targetPositions,
      setupTables,
      enforceFixedFlag,
      visited,
      order,
      (info: { commutator: { seq: GigaminxTurn[] }; anchor: number; setupSeqLen: number; localRank: number }) => {
        stats.candidateEvaluations++;
        const l = info.setupSeqLen * 2 + info.commutator.seq.length;
        stats.evalLens.push(l);
        rank = info.localRank;
        len = l;
      },
    );
    stats.candidateEvalTimeMs += Date.now() - t0;
    return { found, rank, len };
  }

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      const order = orderForRound(wrongPositions);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      let viaApplication = false;
      let acceptedRank = 0;
      let acceptedLen = 0;

      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = tryExactFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          const r = callFind(order, target, wrongBefore - 1, true);
          if (r.found) {
            strictFound = r.found;
            acceptedRank = r.rank;
            acceptedLen = r.len;
            viaApplication = true;
            break;
          }
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.wingPerm[pos];
              const r = callFind(order, target, wrongBefore, true);
              if (r.found) {
                lateralFound = r.found;
                acceptedRank = r.rank;
                acceptedLen = r.len;
                viaApplication = true;
                break;
              }
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.wingPerm[pos];
                  const r = callFind(order, target, wrongBefore + step, false);
                  if (r.found) {
                    regressiveFound = r.found;
                    acceptedRank = r.rank;
                    acceptedLen = r.len;
                    viaApplication = true;
                    break outerRegress;
                  }
                }
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} wings wrong)`);
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error(`exhausted ${maxConsecutiveRegressive}-round regression budget`);
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }

      current = (found as { state: GigaminxState; seq: GigaminxTurn[] }).state;
      solution.push(...(found as { state: GigaminxState; seq: GigaminxTurn[] }).seq);
      visited.add(wingStateSig(current));
      if (viaApplication) {
        stats.acceptedApplications++;
        stats.acceptedRanks.push(acceptedRank);
        stats.acceptedLens.push(acceptedLen);
      }
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);
    }
    stats.wingRounds = attempts;
    stats.wingTotalMs = Date.now() - wingT0;
    return { moves: solution, succeeded: true, stats };
  } catch (err) {
    stats.wingRounds = attempts;
    stats.wingTotalMs = Date.now() - wingT0;
    return { moves: solution, succeeded: false, stats };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];
const POLICIES: Policy[] = ["A_BASELINE", "B_LENGTH_ASC", "C_LENGTH_SCORE"];

describe("GIGAMINX_S2_CANDIDATE_ORDERING_SCREENING_V1: Wing Phase candidate ordering", () => {
  it(
    "runs Policy A/B/C on seeds, instrumented, with correctness gates",
    () => {
      const results: Record<string, any[]> = { A_BASELINE: [], B_LENGTH_ASC: [], C_LENGTH_SCORE: [] };

      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded, `seed ${seed}: corners failed`).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        expect(areCornersSolved(afterCorners)).toBe(true);

        for (const policy of POLICIES) {
          const t0 = Date.now();
          const { moves, succeeded, stats } = runInstrumentedWingSolve(afterCorners, policy);
          const totalMs = Date.now() - t0;
          expect(succeeded, `seed ${seed} policy ${policy}: wing solve failed`).toBe(true);

          // Gate A/B: REAL replay from the corners-solved state, not the virtual-composed state.
          const replayed = applySeq(afterCorners, moves);
          expect(areCornersSolved(replayed), `seed ${seed} policy ${policy}: corners not preserved after replay`).toBe(true);
          expect(areWingsSolved(replayed), `seed ${seed} policy ${policy}: wings not solved after replay`).toBe(true);

          const evalLensSorted = [...stats.evalLens].sort((a, b) => a - b);
          const row = {
            seed,
            policy,
            totalMs,
            candidateEvaluations: stats.candidateEvaluations,
            acceptedApplications: stats.acceptedApplications,
            wingRounds: stats.wingRounds,
            meanRank: mean(stats.acceptedRanks),
            medianRank: median(stats.acceptedRanks),
            meanCandLen: mean(stats.evalLens),
            minCandLen: evalLensSorted[0] ?? 0,
            medianCandLen: median(stats.evalLens),
            p90CandLen: quantile(evalLensSorted, 0.9),
            maxCandLen: evalLensSorted[evalLensSorted.length - 1] ?? 0,
            meanAcceptedLen: mean(stats.acceptedLens),
            candidateEvalTimeMs: stats.candidateEvalTimeMs,
            wingTimeMs: stats.wingTotalMs,
          };
          results[policy].push(row);
          console.log(`S2 seed=${seed} policy=${policy} totalMs=${totalMs} wingMs=${stats.wingTotalMs} candEvalMs=${stats.candidateEvalTimeMs} candEvals=${stats.candidateEvaluations} acceptedApps=${stats.acceptedApplications} rounds=${stats.wingRounds} meanRank=${row.meanRank.toFixed(1)} medianRank=${row.medianRank} meanCandLen=${row.meanCandLen.toFixed(1)} p90CandLen=${row.p90CandLen} meanAcceptedLen=${row.meanAcceptedLen.toFixed(1)}`);
        }
      }

      console.log("S2_RESULTS_JSON=" + JSON.stringify(results));
    },
    7_000_000,
  );
});
