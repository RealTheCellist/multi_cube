// GIGAMINX_S14_STRICT_COST_DECOMPOSITION_V1 -- pure measurement, zero
// production changes, zero new exports. Reuses the onEval/onGenerate
// instrumentation hooks findSafeWingApplication/EdgeBridgeApplication/
// CenterBridgeApplication have carried since S2/S3/S4 (no-op by default at
// every production call site -- see the big comment above
// findSafeWingApplication) to decompose the STRICT tier's cost (threshold =
// wrongBefore-1, enforceFixed=true) specifically, across real 40-seed
// trajectories. Lateral/regressive (same function, different threshold/
// enforceFixed) are run normally but NOT instrumented -- out of this
// Sprint's scope.
import { describe, it } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, areWingsSolved, areEdgeBridgesSolved, areCenterBridgesSolved, __dev } from "./gigaminxSolver";

const {
  wingCommutators,
  findSafeWingApplication,
  tryExactFinishWings,
  tryCompoundFinishWings,
  edgeBridgeCommutators,
  findSafeEdgeBridgeApplication,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  centerBridgeCommutators,
  findSafeCenterBridgeApplication,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
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

type Orbit = "wing" | "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  size: number;
  perm: (s: GigaminxState) => Int8Array;
  isPieceSolved: (s: GigaminxState, pos: number) => boolean;
  stateSignature: (s: GigaminxState) => string;
  commutators: () => any[];
  findSafeApplication: (...args: any[]) => any;
  tryExactFinish: (...args: any[]) => any;
  tryCompoundFinish: (...args: any[]) => any;
  hasFineTiming: boolean; // only wing's onEval carries lookupMs/composeMs/checkMs
}
const WING: Adapter = {
  name: "wing",
  size: 60,
  perm: (s) => s.wingPerm,
  isPieceSolved: (s, p) => s.wingPerm[p] === p && s.wingOrient[p] === 0,
  stateSignature: (s) => `${s.wingPerm.join(",")}|${s.wingOrient.join(",")}`,
  commutators: wingCommutators,
  findSafeApplication: findSafeWingApplication,
  tryExactFinish: tryExactFinishWings,
  tryCompoundFinish: tryCompoundFinishWings,
  hasFineTiming: true,
};
const EDGE_BRIDGE: Adapter = {
  name: "edgeBridge",
  size: 60,
  perm: (s) => s.edgeBridgePerm,
  isPieceSolved: (s, p) => s.edgeBridgePerm[p] === p,
  stateSignature: (s) => s.edgeBridgePerm.join(","),
  commutators: edgeBridgeCommutators,
  findSafeApplication: findSafeEdgeBridgeApplication,
  tryExactFinish: tryExactFinishEdgeBridges,
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
  hasFineTiming: false,
};
const CENTER_BRIDGE: Adapter = {
  name: "centerBridge",
  size: 60,
  perm: (s) => s.centerBridgePerm,
  isPieceSolved: (s, p) => s.centerBridgePerm[p] === p,
  stateSignature: (s) => s.centerBridgePerm.join(","),
  commutators: centerBridgeCommutators,
  findSafeApplication: findSafeCenterBridgeApplication,
  tryExactFinish: tryExactFinishCenterBridges,
  tryCompoundFinish: tryCompoundFinishCenterBridges,
  hasFineTiming: false,
};

interface FunnelAgg {
  strictCalls: number; // number of findSafeApplication(strict) invocations (one per `tries` loop iteration, whether or not it found a move)
  strictCallsAccepted: number; // calls that returned non-null
  generated: number; // onGenerate count (C x anchor pairs considered)
  evaluated: number; // onEval count (setup found, reached scoring)
  outcomeCounts: Record<string, number>;
  lookupMsSum: number;
  composeMsSum: number;
  checkMsSum: number;
  lookupMsByOutcome: Record<string, number>;
  composeMsByOutcome: Record<string, number>;
  wallClockMsSum: number; // external Date.now() wrap around each strict call
}
function emptyFunnel(): FunnelAgg {
  return { strictCalls: 0, strictCallsAccepted: 0, generated: 0, evaluated: 0, outcomeCounts: {}, lookupMsSum: 0, composeMsSum: 0, checkMsSum: 0, lookupMsByOutcome: {}, composeMsByOutcome: {}, wallClockMsSum: 0 };
}

// Wing's findSafeApplication has an extra `candidatesOverride` parameter
// (between `visited` and `onEval`) that EdgeBridge/CenterBridge's do not --
// calling all three with one uniform positional argument list would shift
// onEval/onGenerate/usePrefilter by one slot for exactly one of the two
// shapes. This wrapper calls the right shape per adapter.
function callFindSafe(adapter: Adapter, commutators: any, current: GigaminxState, fixed: ReadonlySet<number>, target: number, threshold: number, remaining: readonly number[], setupTables: any, enforceFixed: boolean, visited: ReadonlySet<string>, onEval: any, onGenerate: any, usePrefilter: boolean | undefined): any {
  if (adapter.name === "wing") {
    return adapter.findSafeApplication(commutators, current, fixed, target, threshold, remaining, setupTables, enforceFixed, visited, undefined, onEval, onGenerate, usePrefilter);
  }
  return adapter.findSafeApplication(commutators, current, fixed, target, threshold, remaining, setupTables, enforceFixed, visited, onEval, onGenerate, usePrefilter);
}

function runOrbitWithStrictInstrumentation(adapter: Adapter, state: GigaminxState, funnel: FunnelAgg, instrument: boolean, usePrefilter = true, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean } {
  const commutators = adapter.commutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: adapter.size }, (_, i) => i);
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
  const visited = new Set<string>([adapter.stateSignature(current)]);

  const onGenerate = instrument ? () => { funnel.generated++; } : undefined;
  const onEval = instrument
    ? (info: any) => {
        funnel.evaluated++;
        funnel.outcomeCounts[info.outcome] = (funnel.outcomeCounts[info.outcome] ?? 0) + 1;
        if (adapter.hasFineTiming) {
          funnel.lookupMsSum += info.lookupMs ?? 0;
          funnel.composeMsSum += info.composeMs ?? 0;
          funnel.checkMsSum += info.checkMs ?? 0;
          funnel.lookupMsByOutcome[info.outcome] = (funnel.lookupMsByOutcome[info.outcome] ?? 0) + (info.lookupMs ?? 0);
          funnel.composeMsByOutcome[info.outcome] = (funnel.composeMsByOutcome[info.outcome] ?? 0) + (info.composeMs ?? 0);
        }
      }
    : undefined;

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error("exceeded maxAttempts");
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: any = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          const tA = Date.now();
          strictFound = callFindSafe(adapter, commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, onEval, onGenerate, usePrefilter);
          const ms = Date.now() - tA;
          if (instrument) {
            funnel.strictCalls++;
            funnel.wallClockMsSum += ms;
            if (strictFound) funnel.strictCallsAccepted++;
          }
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
              lateralFound = callFindSafe(adapter, commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, usePrefilter);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            let compoundFound: any = null;
            if (wrongBefore >= 2 && wrongBefore <= 15) {
              compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
            }
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
                  regressiveFound = callFindSafe(adapter, commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, usePrefilter);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) throw new Error("stuck");
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error("exhausted regression budget");
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }
      current = found.state;
      solution.push(...found.seq);
      visited.add(adapter.stateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (adapter.isPieceSolved(current, p)) fixed.add(p);
    }
    return { moves: solution, succeeded: true };
  } catch {
    return { moves: solution, succeeded: false };
  }
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function runTrajectories(instrument: boolean, usePrefilter = true) {
  const funnels: Record<Orbit, FunnelAgg> = { wing: emptyFunnel(), edgeBridge: emptyFunnel(), centerBridge: emptyFunnel() };
  let completed = 0;
  const totalMsList: number[] = [];
  for (const seed of SEEDS) {
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
    const tStart = Date.now();
    const cornerResult = solveCorners(scrambled);
    if (!cornerResult.trace.succeeded) continue;
    const afterCorners = applySeq(scrambled, cornerResult.moves);

    const wingRun = runOrbitWithStrictInstrumentation(WING, afterCorners, funnels.wing, instrument, usePrefilter);
    if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) continue;
    const afterWings = applySeq(afterCorners, wingRun.moves);

    const innerResult = solveInnerCorners(afterWings);
    if (!innerResult.trace.succeeded) continue;
    const afterInner = applySeq(afterWings, innerResult.moves);

    const edgeRun = runOrbitWithStrictInstrumentation(EDGE_BRIDGE, afterInner, funnels.edgeBridge, instrument, usePrefilter);
    if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) continue;
    const afterEdge = applySeq(afterInner, edgeRun.moves);

    const centerRun = runOrbitWithStrictInstrumentation(CENTER_BRIDGE, afterEdge, funnels.centerBridge, instrument, usePrefilter);
    if (!centerRun.succeeded || !areCenterBridgesSolved(applySeq(afterEdge, centerRun.moves))) continue;

    completed++;
    totalMsList.push(Date.now() - tStart);
  }
  return { funnels, completed, totalMsList };
}

describe("GIGAMINX_S14_STRICT_COST_DECOMPOSITION_V1", () => {
  it(
    "Stage 0+1+2+3: decompose strict-tier cost across wing/edgeBridge/centerBridge on 40 real full solves (instrumented vs clean overhead check)",
    () => {
      const clean = runTrajectories(false);
      const totalsClean = clean.totalMsList.sort((a, b) => a - b);
      console.log(`S14_CLEAN_BASELINE n=${totalsClean.length} totalMsSum=${totalsClean.reduce((a, b) => a + b, 0)}`);

      const inst = runTrajectories(true);
      const totalsInst = inst.totalMsList.sort((a, b) => a - b);
      console.log(`S14_INSTRUMENTED_BASELINE n=${totalsInst.length} totalMsSum=${totalsInst.reduce((a, b) => a + b, 0)}`);
      const overheadRatio = totalsInst.reduce((a, b) => a + b, 0) / Math.max(1, totalsClean.reduce((a, b) => a + b, 0));
      console.log(`S14_INSTRUMENTATION_OVERHEAD_RATIO ${overheadRatio.toFixed(3)} (instrumented/clean total time -- quantifies onEval/onGenerate observer overhead)`);

      for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
        const f = inst.funnels[orbitKey];
        const genPerCall = f.generated / Math.max(1, f.strictCalls);
        const evalPerCall = f.evaluated / Math.max(1, f.strictCalls);
        const hitRate = f.evaluated / Math.max(1, f.generated); // setup-table lookup hit rate
        console.log(
          `S14_FUNNEL orbit=${orbitKey} strictCalls=${f.strictCalls} accepted=${f.strictCallsAccepted} acceptRate=${((f.strictCallsAccepted / Math.max(1, f.strictCalls)) * 100).toFixed(1)}% ` +
            `generated=${f.generated} evaluated=${f.evaluated} genPerCall=${genPerCall.toFixed(1)} evalPerCall=${evalPerCall.toFixed(1)} lookupHitRate=${(hitRate * 100).toFixed(1)}% ` +
            `wallClockMsSum=${f.wallClockMsSum} msPerCall=${(f.wallClockMsSum / Math.max(1, f.strictCalls)).toFixed(3)} outcomeCounts=${JSON.stringify(f.outcomeCounts)}`,
        );
        if (adapterHasFineTiming(orbitKey)) {
          console.log(
            `S14_FINE_TIMING orbit=${orbitKey} lookupMsSum=${f.lookupMsSum.toFixed(1)} composeMsSum=${f.composeMsSum.toFixed(1)} checkMsSum=${f.checkMsSum.toFixed(1)} ` +
              `lookupPct=${((f.lookupMsSum / (f.lookupMsSum + f.composeMsSum + f.checkMsSum)) * 100).toFixed(1)}% composePct=${((f.composeMsSum / (f.lookupMsSum + f.composeMsSum + f.checkMsSum)) * 100).toFixed(1)}% checkPct=${((f.checkMsSum / (f.lookupMsSum + f.composeMsSum + f.checkMsSum)) * 100).toFixed(1)}%`,
          );
          console.log(`S14_FINE_TIMING_BY_OUTCOME orbit=${orbitKey} lookupMsByOutcome=${JSON.stringify(f.lookupMsByOutcome)} composeMsByOutcome=${JSON.stringify(f.composeMsByOutcome)}`);
        }
      }

      function adapterHasFineTiming(orbit: Orbit): boolean {
        return orbit === "wing";
      }
    },
    7_000_000,
  );

  it(
    "Methodology check: S9.1-S13's uniform 13-arg findSafeApplication call silently passed usePrefilter=undefined (not true) for edgeBridge/centerBridge (12-param signature, no candidatesOverride) -- quantify how much that inflated their strict/lateral/regressive cost",
    () => {
      const withPrefilter = runTrajectories(false, true);
      const withoutPrefilter = runTrajectories(false, false);
      const sum = (l: number[]) => l.reduce((a, b) => a + b, 0);
      console.log(`S14_PREFILTER_BUG_CHECK withPrefilterTotalMs=${sum(withPrefilter.totalMsList)} withoutPrefilterTotalMs=${sum(withoutPrefilter.totalMsList)} n=${withPrefilter.totalMsList.length}/${withoutPrefilter.totalMsList.length}`);
    },
    7_000_000,
  );
});
