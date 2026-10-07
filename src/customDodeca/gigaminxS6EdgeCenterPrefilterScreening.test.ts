// GIGAMINX_S6_EDGE_CENTER_SUPPORT_PREFILTER_SCREENING_V1 -- research/
// prototype probe. Screens whether the S4/S5 Wing conjugation-support
// prefilter generalizes to EdgeBridge and CenterBridge (both pure
// permutation orbits, no orientation -- structurally simpler than Wing).
//
// Scope: instrumentation + opt-in `usePrefilter` params on
// findSafeEdgeBridgeApplication/findSafeCenterBridgeApplication (default
// false; production solveEdgeBridges/solveCenterBridges never pass them).
// No candidate/library/ordering/selection/support-definition/S1-compose/
// strict/lateral/regression/exact-finish/compound-finish/visited-state/
// other-phase/production-default changes. commit/push: none this sprint.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveWings, areCornersSolved, areWingsSolved, areInnerCornersSolved, areEdgeBridgesSolved, areCenterBridgesSolved, solveInnerCorners, __dev } from "./gigaminxSolver";

const {
  edgeBridgeKeyFor,
  countWrongEdgeBridges,
  edgeBridgeCommutators,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  findSafeEdgeBridgeApplication,
  centerBridgeKeyFor,
  countWrongCenterBridges,
  centerBridgeCommutators,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
  findSafeCenterBridgeApplication,
  positionSetupTables,
} = __dev as any;

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

type Orbit = "edgeBridge" | "centerBridge";

interface Adapter {
  name: Orbit;
  perm: (s: GigaminxState) => Int8Array;
  countWrong: (s: GigaminxState, positions: readonly number[]) => number;
  solved: (s: GigaminxState) => boolean;
  commutators: () => any[];
  tryExactFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  tryCompoundFinish: (commutators: any, current: GigaminxState, fixed: Set<number>, pieces: number[]) => any;
  findSafeApplication: (...args: any[]) => any;
}

const EDGE_BRIDGE: Adapter = {
  name: "edgeBridge",
  perm: (s) => s.edgeBridgePerm,
  countWrong: countWrongEdgeBridges,
  solved: areEdgeBridgesSolved,
  commutators: edgeBridgeCommutators,
  tryExactFinish: tryExactFinishEdgeBridges,
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
  findSafeApplication: findSafeEdgeBridgeApplication,
};
const CENTER_BRIDGE: Adapter = {
  name: "centerBridge",
  perm: (s) => s.centerBridgePerm,
  countWrong: countWrongCenterBridges,
  solved: areCenterBridgesSolved,
  commutators: centerBridgeCommutators,
  tryExactFinish: tryExactFinishCenterBridges,
  tryCompoundFinish: tryCompoundFinishCenterBridges,
  findSafeApplication: findSafeCenterBridgeApplication,
};

function stateSig(perm: Int8Array): string {
  return perm.join(",");
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
}
function newFunnel(): Funnel {
  return { generatedCandidates: 0, evaluatedCandidates: 0, fixedSafetyReject: 0, improvementReject: 0, visitedReject: 0, acceptedViaApplication: 0, composeExecuted: 0, composeSkipped: 0 };
}
interface CrossTab {
  noOverlapAndFixedReject: number;
  noOverlapAndNotFixedReject: number;
  overlapAndFixedReject: number;
  overlapAndNotFixedReject: number;
}
function newCrossTab(): CrossTab {
  return { noOverlapAndFixedReject: 0, noOverlapAndNotFixedReject: 0, overlapAndFixedReject: 0, overlapAndNotFixedReject: 0 };
}

function runOrbitSolve(adapter: Adapter, state: GigaminxState, usePrefilter: boolean, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; rounds: number; funnel: Funnel; crossTab: CrossTab } {
  const commutators = adapter.commutators();
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
  const visited = new Set<string>([stateSig(adapter.perm(current))]);

  const funnel = newFunnel();
  const crossTab = newCrossTab();

  function onEval(enforceFixedFlag: boolean) {
    return (info: { outcome: string; prefilterOverlap: boolean; composeSkipped: boolean }) => {
      funnel.evaluatedCandidates++;
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

  function callFind(target: number, wrongAfterThreshold: number, enforceFixedFlag: boolean) {
    return adapter.findSafeApplication(commutators, current, fixed, target, wrongAfterThreshold, targetPositions, setupTables, enforceFixedFlag, visited, onEval(enforceFixedFlag), onGenerate, usePrefilter);
  }

  try {
    while (targetPositions.some((p) => adapter.perm(current)[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => adapter.perm(current)[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
      }
      if (!found) {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          strictFound = callFind(target, wrongBefore - 1, true);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: any = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = adapter.perm(current)[pos];
              lateralFound = callFind(target, wrongBefore, true);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? adapter.tryCompoundFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = adapter.perm(current)[pos];
                  regressiveFound = callFind(target, wrongBefore + step, false);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) throw new Error(`stuck (${wrongBefore} ${adapter.name} wrong)`);
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

      current = found.state;
      solution.push(...found.seq);
      visited.add(stateSig(adapter.perm(current)));
      fixed.clear();
      for (const p of targetPositions) if (adapter.perm(current)[p] === p) fixed.add(p);
    }
    return { moves: solution, succeeded: true, rounds: attempts, funnel, crossTab };
  } catch {
    return { moves: solution, succeeded: false, rounds: attempts, funnel, crossTab };
  }
}

const seeds = process.env.GIGA_SEEDS ? process.env.GIGA_SEEDS.split(",").map(Number) : [1, 2, 3];

describe("GIGAMINX_S6_EDGE_CENTER_SUPPORT_PREFILTER_SCREENING_V1", () => {
  for (const adapter of [EDGE_BRIDGE] as Adapter[]) {
    it(
      `${adapter.name}: Stage 1+2 correctness/hit-rate diagnostics (non-destructive) + Stage 3-5 performance/equivalence`,
      () => {
        const results: any[] = [];
        for (const seed of seeds) {
          // edgeBridge needs corners+wings+innerCorners already solved (same chain production uses).
          const rng = mulberry32(seed * 13 + 7);
          const scramble = randomGigaminxScramble(30, rng);
          const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
          const cornerResult = solveCorners(scrambled);
          expect(cornerResult.trace.succeeded).toBe(true);
          const afterCorners = applySeq(scrambled, cornerResult.moves);
          const wingResult = solveWings(afterCorners);
          expect(wingResult.trace.succeeded).toBe(true);
          const afterWings = applySeq(afterCorners, wingResult.moves);
          const innerResult = solveInnerCorners(afterWings);
          expect(innerResult.trace.succeeded).toBe(true);
          const start = applySeq(afterWings, innerResult.moves);

          // Stage 1+2: Policy A (usePrefilter=false), non-destructive, with crossTab diagnostics.
          const base = runOrbitSolve(adapter, start, false);
          expect(base.succeeded, `${adapter.name} seed ${seed}: Policy A failed`).toBe(true);
          const baseReplayed = applySeq(start, base.moves);
          expect(adapter.solved(baseReplayed), `${adapter.name} seed ${seed}: Policy A not solved after replay`).toBe(true);

          const ct = base.crossTab;
          const totalEnforced = ct.noOverlapAndFixedReject + ct.noOverlapAndNotFixedReject + ct.overlapAndFixedReject + ct.overlapAndNotFixedReject;

          // Stage 3-5: Policy B (usePrefilter=true), performance + trajectory equivalence.
          const t0 = Date.now();
          const policyB = runOrbitSolve(adapter, start, true);
          const bMs = Date.now() - t0;
          const t1 = Date.now();
          const policyA = runOrbitSolve(adapter, start, false);
          const aMs = Date.now() - t1;
          expect(policyB.succeeded, `${adapter.name} seed ${seed}: Policy B failed`).toBe(true);
          const bReplayed = applySeq(start, policyB.moves);
          expect(adapter.solved(bReplayed), `${adapter.name} seed ${seed}: Policy B not solved after replay`).toBe(true);
          expect(policyB.rounds, `${adapter.name} seed ${seed}: rounds diverged`).toBe(policyA.rounds);
          expect(policyB.moves.length, `${adapter.name} seed ${seed}: move length diverged`).toBe(policyA.moves.length);

          const row = {
            seed,
            totalEnforced,
            falseSafe: ct.noOverlapAndFixedReject,
            falseRejectIfConfirmed: ct.overlapAndNotFixedReject,
            overlapAndFixedReject: ct.overlapAndFixedReject,
            noOverlapAndNotFixedReject: ct.noOverlapAndNotFixedReject,
            aMs,
            bMs,
            speedup: aMs / bMs,
            composeExecutedB: policyB.funnel.composeExecuted,
            composeSkippedB: policyB.funnel.composeSkipped,
            evaluatedB: policyB.funnel.evaluatedCandidates,
            rounds: policyA.rounds,
            movesLength: policyA.moves.length,
          };
          results.push(row);
          console.log(
            `S6 orbit=${adapter.name} seed=${seed} totalEnforced=${totalEnforced} falseSafe=${row.falseSafe} falseRejectIfConfirmed=${row.falseRejectIfConfirmed} ` +
              `overlapRate=${((row.overlapAndFixedReject / totalEnforced) * 100).toFixed(3)}% aMs=${aMs} bMs=${bMs} speedup=${row.speedup.toFixed(2)}x ` +
              `composeExecutedB=${row.composeExecutedB} composeSkippedB=${row.composeSkippedB} evaluatedB=${row.evaluatedB} rounds=${row.rounds} moves=${row.movesLength}`,
          );
        }
        console.log(`S6_${adapter.name.toUpperCase()}_RESULTS_JSON=` + JSON.stringify(results));

        const totalFalseSafe = results.reduce((a, r) => a + r.falseSafe, 0);
        const totalFalseReject = results.reduce((a, r) => a + r.falseRejectIfConfirmed, 0);
        console.log(`S6_${adapter.name.toUpperCase()}_GATE_A totalFalseSafe=${totalFalseSafe} totalFalseRejectIfConfirmed=${totalFalseReject}`);
        expect(totalFalseSafe, `${adapter.name}: false-safe must be 0`).toBe(0);
      },
      7_000_000,
    );
  }

  it(
    "centerBridge: Stage 1+2 correctness/hit-rate diagnostics (non-destructive) + Stage 3-5 performance/equivalence",
    () => {
      const adapter = CENTER_BRIDGE;
      const results: any[] = [];
      for (const seed of seeds) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        expect(cornerResult.trace.succeeded).toBe(true);
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        const wingResult = solveWings(afterCorners);
        expect(wingResult.trace.succeeded).toBe(true);
        const afterWings = applySeq(afterCorners, wingResult.moves);
        const innerResult = solveInnerCorners(afterWings);
        expect(innerResult.trace.succeeded).toBe(true);
        const afterInner = applySeq(afterWings, innerResult.moves);
        const edgeBridgeResultBase = runOrbitSolve(EDGE_BRIDGE, afterInner, false);
        expect(edgeBridgeResultBase.succeeded).toBe(true);
        const start = applySeq(afterInner, edgeBridgeResultBase.moves);

        const base = runOrbitSolve(adapter, start, false);
        expect(base.succeeded, `centerBridge seed ${seed}: Policy A failed`).toBe(true);
        const baseReplayed = applySeq(start, base.moves);
        expect(adapter.solved(baseReplayed), `centerBridge seed ${seed}: Policy A not solved after replay`).toBe(true);

        const ct = base.crossTab;
        const totalEnforced = ct.noOverlapAndFixedReject + ct.noOverlapAndNotFixedReject + ct.overlapAndFixedReject + ct.overlapAndNotFixedReject;

        const t0 = Date.now();
        const policyB = runOrbitSolve(adapter, start, true);
        const bMs = Date.now() - t0;
        const t1 = Date.now();
        const policyA = runOrbitSolve(adapter, start, false);
        const aMs = Date.now() - t1;
        expect(policyB.succeeded, `centerBridge seed ${seed}: Policy B failed`).toBe(true);
        const bReplayed = applySeq(start, policyB.moves);
        expect(adapter.solved(bReplayed), `centerBridge seed ${seed}: Policy B not solved after replay`).toBe(true);
        expect(policyB.rounds, `centerBridge seed ${seed}: rounds diverged`).toBe(policyA.rounds);
        expect(policyB.moves.length, `centerBridge seed ${seed}: move length diverged`).toBe(policyA.moves.length);

        const row = {
          seed,
          totalEnforced,
          falseSafe: ct.noOverlapAndFixedReject,
          falseRejectIfConfirmed: ct.overlapAndNotFixedReject,
          overlapAndFixedReject: ct.overlapAndFixedReject,
          aMs,
          bMs,
          speedup: aMs / bMs,
          composeExecutedB: policyB.funnel.composeExecuted,
          composeSkippedB: policyB.funnel.composeSkipped,
          evaluatedB: policyB.funnel.evaluatedCandidates,
          rounds: policyA.rounds,
          movesLength: policyA.moves.length,
        };
        results.push(row);
        console.log(
          `S6 orbit=centerBridge seed=${seed} totalEnforced=${totalEnforced} falseSafe=${row.falseSafe} falseRejectIfConfirmed=${row.falseRejectIfConfirmed} ` +
            `overlapRate=${((row.overlapAndFixedReject / totalEnforced) * 100).toFixed(3)}% aMs=${aMs} bMs=${bMs} speedup=${row.speedup.toFixed(2)}x ` +
            `composeExecutedB=${row.composeExecutedB} composeSkippedB=${row.composeSkippedB} evaluatedB=${row.evaluatedB} rounds=${row.rounds} moves=${row.movesLength}`,
        );
      }
      console.log("S6_CENTERBRIDGE_RESULTS_JSON=" + JSON.stringify(results));
      const totalFalseSafe = results.reduce((a, r) => a + r.falseSafe, 0);
      const totalFalseReject = results.reduce((a, r) => a + r.falseRejectIfConfirmed, 0);
      console.log(`S6_CENTERBRIDGE_GATE_A totalFalseSafe=${totalFalseSafe} totalFalseRejectIfConfirmed=${totalFalseReject}`);
      expect(totalFalseSafe, "centerBridge: false-safe must be 0").toBe(0);
    },
    7_000_000,
  );
});
