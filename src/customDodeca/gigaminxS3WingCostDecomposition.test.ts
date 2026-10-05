// GIGAMINX_S3_WING_INTERNAL_COST_DECOMPOSITION_V1 -- research/prototype probe.
// Scope: instrumentation ONLY. Reuses the exact Policy-A (baseline) control
// flow from the S2 probe (gigaminxS2WingOrderingBench.test.ts), unchanged,
// and adds counters/timers around the REAL existing branches of
// findSafeWingApplication/solveWings -- no new branches, no semantics
// changes, no production-default changes. commit/push: none this sprint.
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
function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

interface TierStat {
  attempts: number;
  rejects: number;
  totalMs: number;
}
function newTier(): TierStat {
  return { attempts: 0, rejects: 0, totalMs: 0 };
}

interface RoundRecord {
  round: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  generated: number;
  evaluated: number;
  resolvedVia: "strict" | "lateral" | "regression" | "exactFinish" | "compoundFinish";
  firstAcceptedRank: number | null;
  strictAttempts: number;
  lateralAttempts: number;
  regressionAttempts: number;
  exactFinishAttempt: boolean;
  compoundFinishAttempt: boolean;
}

interface Funnel {
  generatedCandidates: number;
  evaluatedCandidates: number;
  fixedSafetyReject: number;
  improvementReject: number;
  visitedReject: number;
  acceptedViaApplication: number;
  lookupMsTotal: number;
  composeMsTotal: number;
  checkMsTotal: number;
}
function newFunnel(): Funnel {
  return { generatedCandidates: 0, evaluatedCandidates: 0, fixedSafetyReject: 0, improvementReject: 0, visitedReject: 0, acceptedViaApplication: 0, lookupMsTotal: 0, composeMsTotal: 0, checkMsTotal: 0 };
}

interface RunStats {
  funnel: Funnel;
  strict: TierStat;
  lateral: TierStat;
  regressionStages: TierStat[]; // one per REGRESSION_LADDER rung, as it actually exists (4 rungs)
  exactFinish: TierStat;
  compoundFinish: TierStat;
  rounds: RoundRecord[];
  wingTotalMs: number;
  bookkeepingMs: number; // residual: wingTotalMs - sum(all tier totalMs)
}

function runWingSolveS3(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; stats: RunStats } {
  const baseCommutators = wingCommutators() as { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
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

  const funnel = newFunnel();
  const strict = newTier();
  const lateral = newTier();
  const regressionStages = REGRESSION_LADDER.map(() => newTier());
  const exactFinish = newTier();
  const compoundFinish = newTier();
  const rounds: RoundRecord[] = [];
  const wingT0 = Date.now();

  function makeOnEval(perRound: { generated: number; evaluated: number }) {
    return (info: { commutator: { seq: GigaminxTurn[] }; anchor: number; setupSeqLen: number; localRank: number; outcome: "fixedReject" | "improvementReject" | "visitedReject" | "accepted"; lookupMs: number; composeMs: number; checkMs: number }) => {
      funnel.evaluatedCandidates++;
      perRound.evaluated++;
      funnel.lookupMsTotal += info.lookupMs;
      funnel.composeMsTotal += info.composeMs;
      funnel.checkMsTotal += info.checkMs;
      if (info.outcome === "fixedReject") funnel.fixedSafetyReject++;
      else if (info.outcome === "improvementReject") funnel.improvementReject++;
      else if (info.outcome === "visitedReject") funnel.visitedReject++;
      else funnel.acceptedViaApplication++;
    };
  }
  function makeOnGenerate(perRound: { generated: number; evaluated: number }) {
    return () => {
      funnel.generatedCandidates++;
      perRound.generated++;
    };
  }

  function callFind(tier: TierStat, perRound: { generated: number; evaluated: number }, target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean): { found: { state: GigaminxState; seq: GigaminxTurn[] } | null; rank: number } {
    tier.attempts++;
    let rank = 0;
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
      undefined,
      (info: { localRank: number; outcome: string }) => {
        makeOnEval(perRound)(info as any);
        if (info.outcome === "accepted") rank = info.localRank;
      },
      makeOnGenerate(perRound),
    );
    tier.totalMs += Date.now() - t0;
    if (!found) tier.rejects++;
    return { found, rank };
  }

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      const perRound = { generated: 0, evaluated: 0 };
      const roundRec: Partial<RoundRecord> = { round: attempts, wrongWingBefore: wrongBefore, strictAttempts: 0, lateralAttempts: 0, regressionAttempts: 0, exactFinishAttempt: false, compoundFinishAttempt: false, firstAcceptedRank: null };

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;

      if (wrongBefore >= 2 && wrongBefore <= 16) {
        roundRec.exactFinishAttempt = true;
        exactFinish.attempts++;
        const t0 = Date.now();
        found = tryExactFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
        exactFinish.totalMs += Date.now() - t0;
        if (!found) exactFinish.rejects++;
      }
      if (found) {
        roundRec.resolvedVia = "exactFinish";
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          roundRec.strictAttempts!++;
          const r = callFind(strict, perRound, target, wrongBefore - 1, true);
          if (r.found) {
            strictFound = r.found;
            roundRec.firstAcceptedRank = r.rank;
            break;
          }
        }
        if (strictFound) {
          found = strictFound;
          roundRec.resolvedVia = "strict";
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.wingPerm[pos];
              roundRec.lateralAttempts!++;
              const r = callFind(lateral, perRound, target, wrongBefore, true);
              if (r.found) {
                lateralFound = r.found;
                roundRec.firstAcceptedRank = r.rank;
                break;
              }
            }
          }
          if (lateralFound) {
            found = lateralFound;
            roundRec.resolvedVia = "lateral";
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            let compoundFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
            if (wrongBefore >= 2 && wrongBefore <= 15) {
              roundRec.compoundFinishAttempt = true;
              compoundFinish.attempts++;
              const t0 = Date.now();
              compoundFound = tryCompoundFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
              compoundFinish.totalMs += Date.now() - t0;
              if (!compoundFound) compoundFinish.rejects++;
            }
            if (compoundFound) {
              found = compoundFound;
              roundRec.resolvedVia = "compoundFinish";
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (let stageIdx = 0; stageIdx < REGRESSION_LADDER.length; stageIdx++) {
                const step = REGRESSION_LADDER[stageIdx];
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.wingPerm[pos];
                  roundRec.regressionAttempts!++;
                  const r = callFind(regressionStages[stageIdx], perRound, target, wrongBefore + step, false);
                  if (r.found) {
                    regressiveFound = r.found;
                    roundRec.firstAcceptedRank = r.rank;
                    break outerRegress;
                  }
                }
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} wings wrong)`);
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error(`exhausted ${maxConsecutiveRegressive}-round regression budget`);
              found = regressiveFound;
              roundRec.resolvedVia = "regression";
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
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);

      roundRec.wrongWingAfter = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0).length;
      roundRec.generated = perRound.generated;
      roundRec.evaluated = perRound.evaluated;
      rounds.push(roundRec as RoundRecord);
    }
    const wingTotalMs = Date.now() - wingT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return { moves: solution, succeeded: true, stats: { funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, rounds, wingTotalMs, bookkeepingMs: wingTotalMs - sumTierMs } };
  } catch (err) {
    const wingTotalMs = Date.now() - wingT0;
    const sumTierMs = strict.totalMs + lateral.totalMs + regressionStages.reduce((a, s) => a + s.totalMs, 0) + exactFinish.totalMs + compoundFinish.totalMs;
    return { moves: solution, succeeded: false, stats: { funnel, strict, lateral, regressionStages, exactFinish, compoundFinish, rounds, wingTotalMs, bookkeepingMs: wingTotalMs - sumTierMs } };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];

describe("GIGAMINX_S3_WING_INTERNAL_COST_DECOMPOSITION_V1", () => {
  it(
    "instruments Wing Phase candidate funnel + cost decomposition on Policy A baseline",
    () => {
      const perSeed: Record<number, any> = {};

      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded, `seed ${seed}: corners failed`).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        expect(areCornersSolved(afterCorners)).toBe(true);

        const t0 = Date.now();
        const { moves, succeeded, stats } = runWingSolveS3(afterCorners);
        const totalMs = Date.now() - t0;
        expect(succeeded, `seed ${seed}: wing solve failed`).toBe(true);

        const replayed = applySeq(afterCorners, moves);
        expect(areCornersSolved(replayed), `seed ${seed}: corners not preserved after replay`).toBe(true);
        expect(areWingsSolved(replayed), `seed ${seed}: wings not solved after replay`).toBe(true);

        const evalPerRound = stats.rounds.map((r) => r.evaluated);
        const acceptedRanks = stats.rounds.filter((r) => r.firstAcceptedRank !== null).map((r) => r.firstAcceptedRank as number);

        perSeed[seed] = {
          totalMs,
          wingTotalMs: stats.wingTotalMs,
          rounds: stats.rounds.length,
          accepted: stats.funnel.acceptedViaApplication + stats.rounds.filter((r) => r.resolvedVia === "exactFinish" || r.resolvedVia === "compoundFinish").length,
          generatedCandidates: stats.funnel.generatedCandidates,
          evaluatedCandidates: stats.funnel.evaluatedCandidates,
          fixedSafetyReject: stats.funnel.fixedSafetyReject,
          improvementReject: stats.funnel.improvementReject,
          visitedReject: stats.funnel.visitedReject,
          acceptedViaApplication: stats.funnel.acceptedViaApplication,
          lookupMsTotal: stats.funnel.lookupMsTotal,
          composeMsTotal: stats.funnel.composeMsTotal,
          checkMsTotal: stats.funnel.checkMsTotal,
          strict: stats.strict,
          lateral: stats.lateral,
          regressionStages: stats.regressionStages,
          exactFinish: stats.exactFinish,
          compoundFinish: stats.compoundFinish,
          bookkeepingMs: stats.bookkeepingMs,
          meanEvalPerRound: mean(evalPerRound),
          medianEvalPerRound: median(evalPerRound),
          p90EvalPerRound: quantile(evalPerRound, 0.9),
          meanAcceptedRank: mean(acceptedRanks),
          resolvedViaCounts: stats.rounds.reduce((acc: Record<string, number>, r) => {
            acc[r.resolvedVia] = (acc[r.resolvedVia] ?? 0) + 1;
            return acc;
          }, {}),
          rounds_detail: stats.rounds,
        };

        console.log(
          `S3 seed=${seed} totalMs=${totalMs} rounds=${stats.rounds.length} gen=${stats.funnel.generatedCandidates} eval=${stats.funnel.evaluatedCandidates} ` +
            `fixedRej=${stats.funnel.fixedSafetyReject} improveRej=${stats.funnel.improvementReject} visitedRej=${stats.funnel.visitedReject} acceptedApp=${stats.funnel.acceptedViaApplication} ` +
            `lookupMs=${stats.funnel.lookupMsTotal.toFixed(1)} composeMs=${stats.funnel.composeMsTotal.toFixed(1)} checkMs=${stats.funnel.checkMsTotal.toFixed(1)} ` +
            `strict(n=${stats.strict.attempts},ms=${stats.strict.totalMs}) lateral(n=${stats.lateral.attempts},ms=${stats.lateral.totalMs}) ` +
            `regression(${stats.regressionStages.map((s, i) => `s${i + 1}:n=${s.attempts},ms=${s.totalMs}`).join(" ")}) ` +
            `exactFinish(n=${stats.exactFinish.attempts},ms=${stats.exactFinish.totalMs}) compoundFinish(n=${stats.compoundFinish.attempts},ms=${stats.compoundFinish.totalMs}) ` +
            `bookkeepingMs=${stats.bookkeepingMs} meanEvalPerRound=${mean(evalPerRound).toFixed(1)} medianEvalPerRound=${median(evalPerRound)} p90EvalPerRound=${quantile(evalPerRound, 0.9)} meanAcceptedRank=${mean(acceptedRanks).toFixed(1)}`,
        );
      }

      console.log("S3_RESULTS_JSON=" + JSON.stringify(perSeed));
    },
    7_000_000,
  );
});
