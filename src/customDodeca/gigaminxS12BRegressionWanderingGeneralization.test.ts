// GIGAMINX_S12B_REGRESSION_WANDERING_GENERALIZATION -- pure measurement,
// zero algorithm changes. Question: does S12's seed=28 finding ("regression
// abandons a good state; strict/lateral can't recover it because `visited`
// blocks re-entry; only a visited-blind exact/compound call eventually
// stumbles back onto it, after dozens of wasted rounds") generalize across
// real trajectories, or was it a one-off?
//
// Also serves as a corrected S11 baseline re-measurement, since this run
// uses GIGA_SETUP_TABLES_CACHE in addition to the 5 commutator-library
// caches (S12 found S11's measurement lacked this, inflating seed=1's
// corners phase by ~20s of one-time setup-table build cost).
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
  commutators: () => { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
  findSafeApplication: (...args: any[]) => any;
  tryExactFinish: (...args: any[]) => any;
  tryCompoundFinish: (...args: any[]) => any;
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
};

type Branch = "exact" | "strict" | "lateral" | "compound" | "regressive" | "stuck";
interface RoundTrace {
  round: number;
  wrongBefore: number;
  wrongAfter: number;
  branch: Branch;
  totalMs: number;
  sig: string;
}
// Generic version of S11's runOrbitTraced, now also recording the resulting
// state signature per round (needed to detect exact-state recovery).
function runOrbitTraced(adapter: Adapter, state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; totalMs: number; rounds: RoundTrace[] } {
  const t0 = Date.now();
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
  const rounds: RoundTrace[] = [];

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      const tRound0 = Date.now();

      let found: any = null;
      let branch: Branch = "stuck";
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
      }
      if (found) {
        branch = "exact";
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: any = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          strictFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          branch = "strict";
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: any = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = adapter.perm(current)[pos];
              lateralFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            branch = "lateral";
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            let compoundFound: any = null;
            if (wrongBefore >= 2 && wrongBefore <= 15) {
              compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
            }
            if (compoundFound) {
              found = compoundFound;
              branch = "compound";
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: any = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = adapter.perm(current)[pos];
                  regressiveFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, true);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) throw new Error("stuck");
              if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error("exhausted regression budget");
              found = regressiveFound;
              branch = "regressive";
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
      const wrongAfter = targetPositions.filter((p) => !adapter.isPieceSolved(current, p)).length;
      rounds.push({ round: attempts, wrongBefore, wrongAfter, branch, totalMs: Date.now() - tRound0, sig: adapter.stateSignature(current) });
    }
    return { moves: solution, succeeded: true, totalMs: Date.now() - t0, rounds };
  } catch {
    return { moves: solution, succeeded: false, totalMs: Date.now() - t0, rounds };
  }
}

interface SolveRecord {
  seed: number;
  totalMs: number;
  cornersMs: number;
  innerCornerMs: number;
  wingMs: number;
  edgeBridgeMs: number;
  centerBridgeMs: number;
  wing: RoundTrace[];
  edgeBridge: RoundTrace[];
  centerBridge: RoundTrace[];
}

interface RegressionEvent {
  seed: number;
  orbit: Orbit;
  roundIdx: number; // index into the orbit's rounds array
  preWrong: number; // wrongBefore of the regressive round (state about to be abandoned)
  postWrong: number; // wrongAfter of the regressive round
  regressedBy: number;
  preSig: string; // state signature right before this regression (previous round's resulting sig, or initial)
  recoveryRounds: number | null; // rounds until wrongAfter <= preWrong again (null = never within solve)
  recoveryBranch: Branch | null;
  recoveredToExactPreSig: boolean; // did recovery land on the EXACT same state as preSig?
  recoveredViaVisitedBlindTier: boolean; // was the recovering round's branch exact/compound?
  wanderingMs: number; // sum of totalMs across rounds from regression to recovery (inclusive)
}

function analyzeRegressions(seed: number, orbit: Orbit, rounds: RoundTrace[]): RegressionEvent[] {
  const events: RegressionEvent[] = [];
  const RECOVERY_HORIZON = 80;
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    if (r.branch !== "regressive") continue;
    const preSig = i === 0 ? "" : rounds[i - 1].sig;
    const preWrong = r.wrongBefore;
    const postWrong = r.wrongAfter;
    let recoveryRounds: number | null = null;
    let recoveryBranch: Branch | null = null;
    let recoveredToExactPreSig = false;
    let recoveredViaVisitedBlindTier = false;
    let wanderingMs = r.totalMs;
    for (let j = i + 1; j < rounds.length && j <= i + RECOVERY_HORIZON; j++) {
      wanderingMs += rounds[j].totalMs;
      if (rounds[j].wrongAfter <= preWrong) {
        recoveryRounds = j - i;
        recoveryBranch = rounds[j].branch;
        recoveredToExactPreSig = preSig !== "" && rounds[j].sig === preSig;
        recoveredViaVisitedBlindTier = rounds[j].branch === "exact" || rounds[j].branch === "compound";
        break;
      }
    }
    events.push({ seed, orbit, roundIdx: i, preWrong, postWrong, regressedBy: postWrong - preWrong, preSig, recoveryRounds, recoveryBranch, recoveredToExactPreSig, recoveredViaVisitedBlindTier, wanderingMs });
  }
  return events;
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("GIGAMINX_S12B_REGRESSION_WANDERING_GENERALIZATION", () => {
  it(
    "measures how often regression abandons a good state and how long recovery takes, across 40 real full solves",
    () => {
      const records: SolveRecord[] = [];
      for (const seed of SEEDS) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);

        const tSolveStart = Date.now();
        const tC0 = Date.now();
        const cornerResult = solveCorners(scrambled);
        const cornersMs = Date.now() - tC0;
        if (!cornerResult.trace.succeeded) continue;
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const wingRun = runOrbitTraced(WING, afterCorners);
        if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) continue;
        const afterWings = applySeq(afterCorners, wingRun.moves);

        const tIc0 = Date.now();
        const innerResult = solveInnerCorners(afterWings);
        const innerCornerMs = Date.now() - tIc0;
        if (!innerResult.trace.succeeded) continue;
        const afterInner = applySeq(afterWings, innerResult.moves);

        const edgeRun = runOrbitTraced(EDGE_BRIDGE, afterInner);
        if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) continue;
        const afterEdge = applySeq(afterInner, edgeRun.moves);

        const centerRun = runOrbitTraced(CENTER_BRIDGE, afterEdge);
        if (!centerRun.succeeded || !areCenterBridgesSolved(applySeq(afterEdge, centerRun.moves))) continue;

        const totalMs = Date.now() - tSolveStart;
        records.push({ seed, totalMs, cornersMs, innerCornerMs, wingMs: wingRun.totalMs, edgeBridgeMs: edgeRun.totalMs, centerBridgeMs: centerRun.totalMs, wing: wingRun.rounds, edgeBridge: edgeRun.rounds, centerBridge: centerRun.rounds });
        console.log(`S12B_SOLVE seed=${seed} totalMs=${totalMs} cornersMs=${cornersMs} innerCornerMs=${innerCornerMs} wingMs=${wingRun.totalMs} edgeBridgeMs=${edgeRun.totalMs} centerBridgeMs=${centerRun.totalMs}`);
      }

      const totals = records.map((r) => r.totalMs).sort((a, b) => a - b);
      const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
      function pct(sorted: number[], p: number): number {
        return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
      }
      console.log(`S12B_CLEAN_BASELINE n=${totals.length} mean=${mean.toFixed(0)} median=${pct(totals, 50)} p90=${pct(totals, 90)} p95=${pct(totals, 95)} min=${totals[0]} max=${totals[totals.length - 1]}`);

      // ----- Regression event analysis, across ALL solves and orbits -----
      const allEvents: RegressionEvent[] = [];
      for (const r of records) {
        for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
          allEvents.push(...analyzeRegressions(r.seed, orbitKey, r[orbitKey]));
        }
      }
      console.log(`S12B_TOTAL_REGRESSION_EVENTS n=${allEvents.length}`);

      function bucketize(events: RegressionEvent[], label: string) {
        const n = events.length;
        if (n === 0) {
          console.log(`S12B_WANDERING_DIST label=${label} n=0`);
          return;
        }
        const never = events.filter((e) => e.recoveryRounds === null).length;
        const ge5 = events.filter((e) => e.recoveryRounds !== null && e.recoveryRounds >= 5).length;
        const ge10 = events.filter((e) => e.recoveryRounds !== null && e.recoveryRounds >= 10).length;
        const ge20 = events.filter((e) => e.recoveryRounds !== null && e.recoveryRounds >= 20).length;
        const exactRecovery = events.filter((e) => e.recoveredToExactPreSig).length;
        const visitedBlindRecovery = events.filter((e) => e.recoveredViaVisitedBlindTier && e.recoveryRounds !== null && e.recoveryRounds >= 5).length;
        const totalWanderingMs = events.reduce((a, e) => a + e.wanderingMs, 0);
        console.log(
          `S12B_WANDERING_DIST label=${label} n=${n} neverRecovered(<=80)=${never}(${((never / n) * 100).toFixed(1)}%) ` +
            `ge5rounds=${ge5}(${((ge5 / n) * 100).toFixed(1)}%) ge10rounds=${ge10}(${((ge10 / n) * 100).toFixed(1)}%) ge20rounds=${ge20}(${((ge20 / n) * 100).toFixed(1)}%) ` +
            `exactStateRecovery=${exactRecovery}(${((exactRecovery / n) * 100).toFixed(1)}%) visitedBlindRecoveryAfterGe5=${visitedBlindRecovery} totalWanderingMs=${totalWanderingMs}`,
        );
      }
      bucketize(allEvents, "all");
      for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
        bucketize(allEvents.filter((e) => e.orbit === orbitKey), orbitKey);
      }

      // Stratify: slow vs fast solves (top/bottom quartile by totalMs) -- does wandering correlate with solve speed?
      const byTotal = [...records].sort((a, b) => a.totalMs - b.totalMs);
      const q = Math.max(1, Math.floor(records.length * 0.25));
      const slowSeeds = new Set(byTotal.slice(-q).map((r) => r.seed));
      const fastSeeds = new Set(byTotal.slice(0, q).map((r) => r.seed));
      bucketize(allEvents.filter((e) => slowSeeds.has(e.seed)), "slow_quartile_solves");
      bucketize(allEvents.filter((e) => fastSeeds.has(e.seed)), "fast_quartile_solves");

      // Dump the worst (longest recovery) events for manual inspection.
      const worst = [...allEvents].filter((e) => e.recoveryRounds !== null).sort((a, b) => (b.recoveryRounds ?? 0) - (a.recoveryRounds ?? 0)).slice(0, 10);
      console.log(`S12B_WORST_EVENTS ${JSON.stringify(worst.map((e) => ({ seed: e.seed, orbit: e.orbit, roundIdx: e.roundIdx, preWrong: e.preWrong, postWrong: e.postWrong, recoveryRounds: e.recoveryRounds, recoveryBranch: e.recoveryBranch, recoveredToExactPreSig: e.recoveredToExactPreSig, wanderingMs: e.wanderingMs })))}`);
      const neverRecovered = allEvents.filter((e) => e.recoveryRounds === null);
      console.log(`S12B_NEVER_RECOVERED_SAMPLE ${JSON.stringify(neverRecovered.slice(0, 10).map((e) => ({ seed: e.seed, orbit: e.orbit, roundIdx: e.roundIdx, preWrong: e.preWrong, postWrong: e.postWrong })))}`);
    },
    7_000_000,
  );
});
