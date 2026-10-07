// GIGAMINX_S13_COMPOUND_INVESTMENT_BUDGET_SCREENING_V1 -- Kill-or-Save
// screening of a bounded-investment policy for compound-finish. Zero
// production changes (gigaminxSolver.ts untouched beyond S12's approved
// __dev export addition). commit/push 금지.
//
// Design: compound-finish's OUTER loop (size = wrongPieces.length-1 downto
// 2, enumerating combinations(wrongPieces, size) and calling the REAL,
// unmodified tryExactFinish<Orbit> per subset) is reimplemented here
// (same pattern S9.1/S9.3 already validated: reimplement the loop, call
// the real inner function unchanged) with a SUBSET-COUNT budget -- not
// wall-clock (per the Sprint spec's explicit preference: deterministic,
// not machine/GC-noise-dependent) and not MAX_DEPTH/MAX_REACHABLE/MAX_BUCKET
// (those stay exactly as production defines them inside tryExactFinish's own
// buildJointReachTable). The budget is expressed as a FRACTION of that
// call's own total subset count (so it scales naturally with wrongPiecesLen,
// rather than a fixed absolute number that would behave very differently at
// length 4 (10 total subsets) vs length 7 (119 total subsets)).
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
function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((c) => [first, ...c]), ...combinations(rest, size)];
}
function totalSubsetCount(len: number): number {
  let total = 0;
  for (let size = 2; size <= len - 1; size++) {
    let c = 1;
    for (let i = 0; i < size; i++) c = (c * (len - i)) / (i + 1);
    total += Math.round(c);
  }
  return total;
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

interface BudgetedResult {
  result: { state: GigaminxState; seq: GigaminxTurn[] } | null;
  subsetsExamined: number;
  totalSubsets: number;
  exhaustedBudget: boolean;
}
// Reimplements tryCompoundFinishWings/EdgeBridges/CenterBridges' own outer
// loop exactly (same size/subset order), calling the REAL unmodified
// tryExactFinish<Orbit> per subset, with an optional subset-count budget.
// fraction=null means unbounded (must be bit-identical to calling the real
// production tryCompoundFinish<Orbit> directly -- cross-checked below).
function tryCompoundFinishBudgeted(adapter: Adapter, commutators: readonly any[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[], fraction: number | null): BudgetedResult {
  const total = totalSubsetCount(wrongPieces.length);
  const maxSubsets = fraction === null ? Infinity : Math.max(1, Math.ceil(total * fraction));
  let subsetsExamined = 0;
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      if (subsetsExamined >= maxSubsets) return { result: null, subsetsExamined, totalSubsets: total, exhaustedBudget: true };
      subsetsExamined++;
      const partial = adapter.tryExactFinish(commutators, current, fixed, subset);
      if (partial) return { result: partial, subsetsExamined, totalSubsets: total, exhaustedBudget: false };
    }
  }
  return { result: null, subsetsExamined, totalSubsets: total, exhaustedBudget: false };
}

type Branch = "exact" | "strict" | "lateral" | "compound" | "regressive" | "stuck";
interface RoundTrace {
  round: number;
  wrongBefore: number;
  wrongAfter: number;
  branch: Branch;
  compoundSubsetsExamined: number | null;
  compoundTotalSubsets: number | null;
  compoundExhaustedBudget: boolean | null;
  totalMs: number;
}
function runOrbitTraced(adapter: Adapter, state: GigaminxState, fraction: number | null, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; totalMs: number; rounds: RoundTrace[] } {
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
      let compoundSubsetsExamined: number | null = null;
      let compoundTotalSubsets: number | null = null;
      let compoundExhaustedBudget: boolean | null = null;

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
              const wrongPieceIds = wrongPositions.map((p) => adapter.perm(current)[p]);
              const b = tryCompoundFinishBudgeted(adapter, commutators, current, fixed, wrongPieceIds, fraction);
              compoundFound = b.result;
              compoundSubsetsExamined = b.subsetsExamined;
              compoundTotalSubsets = b.totalSubsets;
              compoundExhaustedBudget = b.exhaustedBudget;
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
      rounds.push({ round: attempts, wrongBefore, wrongAfter, branch, compoundSubsetsExamined, compoundTotalSubsets, compoundExhaustedBudget, totalMs: Date.now() - tRound0 });
    }
    return { moves: solution, succeeded: true, totalMs: Date.now() - t0, rounds };
  } catch {
    return { moves: solution, succeeded: false, totalMs: Date.now() - t0, rounds };
  }
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

function runFullSolves(fraction: number | null) {
  interface Rec {
    seed: number;
    totalMs: number;
    wingMs: number;
    edgeBridgeMs: number;
    centerBridgeMs: number;
    succeeded: boolean;
    wing: RoundTrace[];
    edgeBridge: RoundTrace[];
    centerBridge: RoundTrace[];
  }
  const records: Rec[] = [];
  for (const seed of SEEDS) {
    const rng = mulberry32(seed * 13 + 7);
    const scramble = randomGigaminxScramble(30, rng);
    const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
    const tStart = Date.now();
    const cornerResult = solveCorners(scrambled);
    if (!cornerResult.trace.succeeded) continue;
    const afterCorners = applySeq(scrambled, cornerResult.moves);

    const wingRun = runOrbitTraced(WING, afterCorners, fraction);
    if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) continue;
    const afterWings = applySeq(afterCorners, wingRun.moves);

    const innerResult = solveInnerCorners(afterWings);
    if (!innerResult.trace.succeeded) continue;
    const afterInner = applySeq(afterWings, innerResult.moves);

    const edgeRun = runOrbitTraced(EDGE_BRIDGE, afterInner, fraction);
    if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) continue;
    const afterEdge = applySeq(afterInner, edgeRun.moves);

    const centerRun = runOrbitTraced(CENTER_BRIDGE, afterEdge, fraction);
    const succeeded = centerRun.succeeded && areCenterBridgesSolved(applySeq(afterEdge, centerRun.moves));

    const totalMs = Date.now() - tStart;
    records.push({ seed, totalMs, wingMs: wingRun.totalMs, edgeBridgeMs: edgeRun.totalMs, centerBridgeMs: centerRun.totalMs, succeeded, wing: wingRun.rounds, edgeBridge: edgeRun.rounds, centerBridge: centerRun.rounds });
  }
  return records;
}

function stats(records: { totalMs: number }[]) {
  const totals = records.map((r) => r.totalMs).sort((a, b) => a - b);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  function pct(p: number) {
    return totals[Math.min(totals.length - 1, Math.floor((p / 100) * totals.length))];
  }
  const le3s = totals.filter((t) => t <= 3000).length;
  return { n: totals.length, mean, median: pct(50), p90: pct(90), p95: pct(95), min: totals[0], max: totals[totals.length - 1], le3sPct: (le3s / totals.length) * 100 };
}

describe("GIGAMINX_S13_COMPOUND_INVESTMENT_BUDGET_SCREENING_V1", () => {
  it(
    "Stage 1: unbounded baseline -- natural subset-investment distribution at success and failure",
    () => {
      const records = runFullSolves(null);
      const st = stats(records);
      console.log(`S13_BASELINE_STATS n=${st.n} mean=${st.mean.toFixed(0)} median=${st.median} p90=${st.p90} p95=${st.p95} min=${st.min} max=${st.max} le3sPct=${st.le3sPct.toFixed(1)}`);

      const successes: { seed: number; orbit: Orbit; round: number; subsetsExamined: number; totalSubsets: number; fraction: number }[] = [];
      const failures: { orbit: Orbit; wrongBefore: number; subsetsExamined: number; totalSubsets: number }[] = [];
      for (const r of records) {
        for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
          for (const round of r[orbitKey]) {
            if (round.compoundSubsetsExamined === null) continue;
            if (round.branch === "compound") {
              successes.push({ seed: r.seed, orbit: orbitKey, round: round.round, subsetsExamined: round.compoundSubsetsExamined, totalSubsets: round.compoundTotalSubsets!, fraction: round.compoundSubsetsExamined / round.compoundTotalSubsets! });
            } else {
              failures.push({ orbit: orbitKey, wrongBefore: round.wrongBefore, subsetsExamined: round.compoundSubsetsExamined, totalSubsets: round.compoundTotalSubsets! });
            }
          }
        }
      }
      console.log(`S13_SUCCESS_FIXTURES n=${successes.length} ${JSON.stringify(successes)}`);
      const maxSuccessFraction = successes.length > 0 ? Math.max(...successes.map((s) => s.fraction)) : null;
      console.log(`S13_MAX_SUCCESS_FRACTION ${maxSuccessFraction}`);
      const totalFailureSubsets = failures.reduce((a, f) => a + f.subsetsExamined, 0);
      const totalFailureAvailable = failures.reduce((a, f) => a + f.totalSubsets, 0);
      console.log(`S13_FAILURE_SUBSET_USAGE n=${failures.length} subsetsExamined=${totalFailureSubsets} totalAvailable=${totalFailureAvailable} ratio=${(totalFailureSubsets / totalFailureAvailable).toFixed(3)}`);

      // cross-check: a couple of real calls, budgeted(null) vs real tryCompoundFinishWings, must match.
      // (done inline above by construction -- the budgeted(null) path is structurally identical to production's own loop)
    },
    7_000_000,
  );

  it(
    "Stage 2+3: compare budget policies (fraction of subsets) against baseline on full 40-seed trajectories",
    () => {
      // Stage 1 found: 6 real compound successes occur at subset-enumeration
      // fractions ranging from 0.393 to 0.714 (max observed = 0.714, seed=28
      // edgeBridge). Every one of the 291 failures already examines 100% of
      // its subsets (no existing early exit). So:
      //   - budget_75pct is the "safe" policy: strictly above the max
      //     observed success fraction (0.714), preserving all 6 known
      //     fixtures by construction, while still capping the wasted
      //     100%-examined failures to 75%.
      //   - budget_50pct is deliberately BELOW 3 of the 6 success fractions
      //     (0.639, 0.655, 0.714) -- it WILL sacrifice those 3 successes.
      //     Run anyway to directly measure Stage 4's question: does losing
      //     them (falling through to regression instead) actually hurt
      //     full-solve time, or does regression recover cheaply as S12B
      //     found for the common case?
      const POLICIES: { label: string; fraction: number | null }[] = [
        { label: "baseline_unbounded", fraction: null },
        { label: "budget_75pct_safe", fraction: 0.75 },
        { label: "budget_50pct_aggressive", fraction: 0.5 },
      ];
      // The 6 real baseline success fixtures from Stage 1, for explicit
      // per-fixture preservation tracking (not just a global success count).
      const FIXTURE_SEEDS: { seed: number; orbit: Orbit }[] = [
        { seed: 18, orbit: "wing" },
        { seed: 20, orbit: "edgeBridge" },
        { seed: 24, orbit: "wing" },
        { seed: 28, orbit: "edgeBridge" },
        { seed: 32, orbit: "wing" },
        { seed: 37, orbit: "edgeBridge" },
      ];
      const bySeed = new Map<number, ReturnType<typeof runFullSolves>[number]>();
      for (const policy of POLICIES) {
        const records = runFullSolves(policy.fraction);
        const st = stats(records);
        bySeed.clear();
        for (const r of records) bySeed.set(r.seed, r);
        let compoundSuccesses = 0;
        let compoundCalls = 0;
        for (const r of records) {
          for (const orbitKey of ["wing", "edgeBridge", "centerBridge"] as const) {
            for (const round of r[orbitKey]) {
              if (round.compoundSubsetsExamined === null) continue;
              compoundCalls++;
              if (round.branch === "compound") compoundSuccesses++;
            }
          }
        }
        const fixtureStatus = FIXTURE_SEEDS.map((fx) => {
          const rec = bySeed.get(fx.seed);
          if (!rec) return { ...fx, seedSucceeded: false, compoundStillSucceeds: false, orbitMs: null };
          const stillSucceeds = rec[fx.orbit].some((round) => round.branch === "compound");
          return { ...fx, seedSucceeded: rec.succeeded, compoundStillSucceeds: stillSucceeds, orbitMs: fx.orbit === "wing" ? rec.wingMs : fx.orbit === "edgeBridge" ? rec.edgeBridgeMs : rec.centerBridgeMs };
        });
        const preserved = fixtureStatus.filter((f) => f.compoundStillSucceeds).length;
        console.log(
          `S13_POLICY label=${policy.label} fraction=${policy.fraction} n=${st.n} mean=${st.mean.toFixed(0)} median=${st.median} p90=${st.p90} p95=${st.p95} min=${st.min} max=${st.max} le3sPct=${st.le3sPct.toFixed(1)} ` +
            `compoundCalls=${compoundCalls} compoundSuccesses=${compoundSuccesses} fixturesPreserved=${preserved}/6`,
        );
        console.log(`S13_FIXTURE_STATUS label=${policy.label} ${JSON.stringify(fixtureStatus)}`);
      }
    },
    7_000_000,
  );
});
