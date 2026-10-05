// GIGAMINX_S4_CONJUGATION_SUPPORT_PREFILTER_SCREENING_V1 -- research/prototype probe.
//
// Algebraic basis (derived from the actual composeSeqFirstThenSecond "pull"
// convention used throughout this codebase -- combined.XPerm[pos] =
// outer.XPerm[inner.XPerm[pos]]):
//
//   fullMove = compose(compose(S.move, C.move), Sinv.move)   [S first, C second, Sinv third]
//   fullMove.wingPerm[pos] = S.move.wingPerm[ C.move.wingPerm[ Sinv.move.wingPerm[pos] ] ]
//
// Let r = Sinv.move.wingPerm[pos]. Since Sinv is S's exact inverse,
// pos = S.move.wingPerm[r]. So:
//   fullMove.wingPerm[pos] != pos  <=>  S[C[r]] != S[r]  <=>  C[r] != r  <=>  r in C.support
// i.e. pos is a touched position of fullMove iff pos = S.move.wingPerm[r] for
// some r in C.support -- support(fullMove) = S(C.support), EXACTLY (conjugation
// preserves support size, relabeled through S). The same holds for the
// orientation-only sub-case (r with C.wingPerm[r]=r but C.wingOrient[r]!=0):
// algebra (worked through composeSeqFirstThenSecond's orientation rule and
// invertVirtualMove's self-inverse-mod-2 property) gives
// fullMove.wingOrient[S.move.wingPerm[r]] = C.wingOrient[r] exactly, so that
// position is touched too, same as C.support's own definition (perm-moved OR
// orientation-flipped).
//
// This probe tests, empirically, on the REAL Wing Phase 2 trajectory:
//   (a) RIGOROUS direction (proven above): no overlap => fixedPreserved
//       guaranteed TRUE. Checked as "false-safe must be 0".
//   (b) BOLD direction (the one that could actually eliminate ~99% of
//       composes, per S3's funnel data): overlap => fixedPreserved is
//       OFTEN false in practice, but not proven false for every possible
//       state (a moved-away position's content could coincidentally already
//       match) -- checked empirically as "false-reject must be 0" across the
//       full real trajectory of all 3 seeds before trusting the Stage 3
//       performance numbers at all.
//
// Scope: instrumentation + a single opt-in `usePrefilter` parameter on
// findSafeWingApplication (default false, so production solveWings is
// unaffected). No candidate set/ordering/acceptance-semantics/library/S1
// compose-method changes. commit/push: none this sprint.
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

interface TierStat {
  attempts: number;
  rejects: number;
  totalMs: number;
}
function newTier(): TierStat {
  return { attempts: 0, rejects: 0, totalMs: 0 };
}

interface CrossTab {
  noOverlapAndFixedReject: number; // false-safe -- MUST be 0
  noOverlapAndNotFixedReject: number; // expected (rare, rigorous-safe case)
  overlapAndFixedReject: number; // expected (common -- the hypothesized skip opportunity)
  overlapAndNotFixedReject: number; // false-reject-if-we-confirmed -- MUST be 0 for the bold hypothesis
}
function newCrossTab(): CrossTab {
  return { noOverlapAndFixedReject: 0, noOverlapAndNotFixedReject: 0, overlapAndFixedReject: 0, overlapAndNotFixedReject: 0 };
}

interface Funnel {
  generatedCandidates: number;
  evaluatedCandidates: number;
  fixedSafetyReject: number;
  improvementReject: number;
  visitedReject: number;
  acceptedViaApplication: number;
  composeExecuted: number;
  composeSkipped: number;
  lookupMsTotal: number;
  composeMsTotal: number;
  checkMsTotal: number;
}
function newFunnel(): Funnel {
  return { generatedCandidates: 0, evaluatedCandidates: 0, fixedSafetyReject: 0, improvementReject: 0, visitedReject: 0, acceptedViaApplication: 0, composeExecuted: 0, composeSkipped: 0, lookupMsTotal: 0, composeMsTotal: 0, checkMsTotal: 0 };
}

interface RunStats {
  funnel: Funnel;
  crossTab: CrossTab; // only tallied for enforceFixed=true calls (strict/lateral), where fixedPreserved is actually evaluated
  strict: TierStat;
  lateral: TierStat;
  regressionStages: TierStat[];
  exactFinish: TierStat;
  compoundFinish: TierStat;
  rounds: number;
  acceptedApplications: number;
  wingTotalMs: number;
}

function runWingSolveS4(state: GigaminxState, usePrefilter: boolean, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; stats: RunStats } {
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
  const crossTab = newCrossTab();
  const strict = newTier();
  const lateral = newTier();
  const regressionStages = REGRESSION_LADDER.map(() => newTier());
  const exactFinish = newTier();
  const compoundFinish = newTier();
  let acceptedApplications = 0;
  const wingT0 = Date.now();

  function onEval(enforceFixedFlag: boolean) {
    return (info: {
      commutator: { seq: GigaminxTurn[] };
      anchor: number;
      setupSeqLen: number;
      localRank: number;
      outcome: "fixedReject" | "improvementReject" | "visitedReject" | "accepted";
      lookupMs: number;
      composeMs: number;
      checkMs: number;
      prefilterOverlap: boolean;
      composeSkipped: boolean;
    }) => {
      funnel.evaluatedCandidates++;
      funnel.lookupMsTotal += info.lookupMs;
      funnel.composeMsTotal += info.composeMs;
      funnel.checkMsTotal += info.checkMs;
      if (info.composeSkipped) funnel.composeSkipped++;
      else funnel.composeExecuted++;
      if (info.outcome === "fixedReject") funnel.fixedSafetyReject++;
      else if (info.outcome === "improvementReject") funnel.improvementReject++;
      else if (info.outcome === "visitedReject") funnel.visitedReject++;
      else funnel.acceptedViaApplication++;

      if (enforceFixedFlag) {
        const isFixedReject = info.outcome === "fixedReject";
        if (!info.prefilterOverlap && isFixedReject) crossTab.noOverlapAndFixedReject++;
        else if (!info.prefilterOverlap && !isFixedReject) crossTab.noOverlapAndNotFixedReject++;
        else if (info.prefilterOverlap && isFixedReject) crossTab.overlapAndFixedReject++;
        else crossTab.overlapAndNotFixedReject++;
      }
    };
  }
  function onGenerate() {
    funnel.generatedCandidates++;
  }

  function callFind(tier: TierStat, target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean): { found: { state: GigaminxState; seq: GigaminxTurn[] } | null } {
    tier.attempts++;
    const t0 = Date.now();
    const found = findSafeWingApplication(baseCommutators, current, fixed, target, wrongAfterThreshold, targetPositions, setupTables, enforceFixedFlag, visited, undefined, onEval(enforceFixedFlag), onGenerate, usePrefilter);
    tier.totalMs += Date.now() - t0;
    if (!found) tier.rejects++;
    return { found };
  }

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      let viaApplication = false;

      if (wrongBefore >= 2 && wrongBefore <= 16) {
        exactFinish.attempts++;
        const t0 = Date.now();
        found = tryExactFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
        exactFinish.totalMs += Date.now() - t0;
        if (!found) exactFinish.rejects++;
      }
      if (!found) {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          const r = callFind(strict, target, wrongBefore - 1, true);
          if (r.found) {
            strictFound = r.found;
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
              const r = callFind(lateral, target, wrongBefore, true);
              if (r.found) {
                lateralFound = r.found;
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
            let compoundFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
            if (wrongBefore >= 2 && wrongBefore <= 15) {
              compoundFinish.attempts++;
              const t0 = Date.now();
              compoundFound = tryCompoundFinishWings(baseCommutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
              compoundFinish.totalMs += Date.now() - t0;
              if (!compoundFound) compoundFinish.rejects++;
            }
            if (compoundFound) {
              found = compoundFound;
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
                  const r = callFind(regressionStages[stageIdx], target, wrongBefore + step, false);
                  if (r.found) {
                    regressiveFound = r.found;
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
      } else {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      }

      current = (found as { state: GigaminxState; seq: GigaminxTurn[] }).state;
      solution.push(...(found as { state: GigaminxState; seq: GigaminxTurn[] }).seq);
      visited.add(wingStateSig(current));
      if (viaApplication) acceptedApplications++;
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);
    }
    const wingTotalMs = Date.now() - wingT0;
    return { moves: solution, succeeded: true, stats: { funnel, crossTab, strict, lateral, regressionStages, exactFinish, compoundFinish, rounds: attempts, acceptedApplications, wingTotalMs } };
  } catch (err) {
    const wingTotalMs = Date.now() - wingT0;
    return { moves: solution, succeeded: false, stats: { funnel, crossTab, strict, lateral, regressionStages, exactFinish, compoundFinish, rounds: attempts, acceptedApplications, wingTotalMs } };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];

describe("GIGAMINX_S4_CONJUGATION_SUPPORT_PREFILTER_SCREENING_V1", () => {
  it(
    "Stage 0+1+2: Policy A baseline with prefilter diagnostics (non-destructive, usePrefilter=false)",
    () => {
      const perSeed: Record<number, any> = {};
      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const t0 = Date.now();
        const { moves, succeeded, stats } = runWingSolveS4(afterCorners, false);
        const totalMs = Date.now() - t0;
        expect(succeeded, `seed ${seed} Policy A: wing solve failed`).toBe(true);
        const replayed = applySeq(afterCorners, moves);
        expect(areCornersSolved(replayed)).toBe(true);
        expect(areWingsSolved(replayed)).toBe(true);

        const ct = stats.crossTab;
        const totalEnforced = ct.noOverlapAndFixedReject + ct.noOverlapAndNotFixedReject + ct.overlapAndFixedReject + ct.overlapAndNotFixedReject;
        perSeed[seed] = { totalMs, wingTotalMs: stats.wingTotalMs, rounds: stats.rounds, funnel: stats.funnel, crossTab: ct, totalEnforced, acceptedApplications: stats.acceptedApplications };

        console.log(
          `S4_STAGE0_1_2 seed=${seed} totalMs=${totalMs} rounds=${stats.rounds} eval=${stats.funnel.evaluatedCandidates} ` +
            `fixedRej=${stats.funnel.fixedSafetyReject} enforcedTotal=${totalEnforced} ` +
            `noOverlap&FixedReject(FALSE-SAFE)=${ct.noOverlapAndFixedReject} noOverlap&NotFixedReject=${ct.noOverlapAndNotFixedReject} ` +
            `overlap&FixedReject=${ct.overlapAndFixedReject} overlap&NotFixedReject(FALSE-REJECT-IF-CONFIRMED)=${ct.overlapAndNotFixedReject} ` +
            `overlapRate=${(((ct.overlapAndFixedReject + ct.overlapAndNotFixedReject) / totalEnforced) * 100).toFixed(3)}%`,
        );
      }
      console.log("S4_STAGE0_1_2_JSON=" + JSON.stringify(perSeed));

      // Gate A (correctness): across ALL enforceFixed=true evaluations in all 3 seeds,
      // zero false-safe (rigorous direction, proven -- must hold) and zero
      // false-reject-if-confirmed (bold direction -- empirical validation).
      let totalFalseSafe = 0;
      let totalFalseRejectIfConfirmed = 0;
      for (const seed of seeds) {
        totalFalseSafe += perSeed[seed].crossTab.noOverlapAndFixedReject;
        totalFalseRejectIfConfirmed += perSeed[seed].crossTab.overlapAndNotFixedReject;
      }
      console.log(`S4_GATE_A totalFalseSafe=${totalFalseSafe} totalFalseRejectIfConfirmed=${totalFalseRejectIfConfirmed}`);
      expect(totalFalseSafe, "Gate A: false-safe must be 0 (rigorous direction)").toBe(0);
      // NOTE: totalFalseRejectIfConfirmed is NOT asserted here -- it is the
      // empirical question Stage 1/2 exists to answer, reported in S4_GATE_A
      // above and in the final report, not silently enforced as a test gate.
    },
    7_000_000,
  );

  it(
    "Stage 3+4: Policy A vs Policy B (usePrefilter=true) performance + cost decomposition",
    () => {
      const perSeed: Record<number, any> = {};
      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const runs: Record<string, any> = {};
        for (const [label, usePrefilter] of [["A_BASELINE", false] as const, ["B_PREFILTER", true] as const]) {
          const t0 = Date.now();
          const { moves, succeeded, stats } = runWingSolveS4(afterCorners, usePrefilter);
          const totalMs = Date.now() - t0;
          expect(succeeded, `seed ${seed} ${label}: wing solve failed`).toBe(true);
          const replayed = applySeq(afterCorners, moves);
          expect(areCornersSolved(replayed), `seed ${seed} ${label}: corners not preserved`).toBe(true);
          expect(areWingsSolved(replayed), `seed ${seed} ${label}: wings not solved`).toBe(true);
          runs[label] = { totalMs, movesLength: moves.length, stats };
          console.log(
            `S4_STAGE3_4 seed=${seed} policy=${label} totalMs=${totalMs} wingMs=${stats.wingTotalMs} rounds=${stats.rounds} ` +
              `eval=${stats.funnel.evaluatedCandidates} composeExecuted=${stats.funnel.composeExecuted} composeSkipped=${stats.funnel.composeSkipped} ` +
              `lookupMs=${stats.funnel.lookupMsTotal.toFixed(1)} composeMs=${stats.funnel.composeMsTotal.toFixed(1)} checkMs=${stats.funnel.checkMsTotal.toFixed(1)} ` +
              `acceptedApplications=${stats.acceptedApplications} movesLength=${moves.length}`,
          );
        }
        perSeed[seed] = runs;

        // Stage 5: trajectory equivalence -- if the correctness gate holds,
        // Policy B must reach the SAME accepted-application count, round
        // count, and final move-sequence length as Policy A (iteration order
        // is unchanged; only compose-vs-skip differs per candidate).
        expect(runs.B_PREFILTER.stats.rounds, `seed ${seed}: rounds diverged`).toBe(runs.A_BASELINE.stats.rounds);
        expect(runs.B_PREFILTER.stats.acceptedApplications, `seed ${seed}: acceptedApplications diverged`).toBe(runs.A_BASELINE.stats.acceptedApplications);
        expect(runs.B_PREFILTER.movesLength, `seed ${seed}: final move sequence length diverged`).toBe(runs.A_BASELINE.movesLength);
      }
      console.log("S4_STAGE3_4_JSON=" + JSON.stringify(perSeed));

      const speedups = seeds.map((seed) => perSeed[seed].A_BASELINE.totalMs / perSeed[seed].B_PREFILTER.totalMs);
      console.log(`S4_SPEEDUPS=${speedups.map((s) => s.toFixed(2)).join(",")} mean=${mean(speedups).toFixed(2)}`);
    },
    7_000_000,
  );
});
