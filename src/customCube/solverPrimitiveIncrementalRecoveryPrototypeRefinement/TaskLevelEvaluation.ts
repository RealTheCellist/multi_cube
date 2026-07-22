// --- TaskLevelEvaluation (Incremental Recovery Prototype Refinement
// Sprint v1) -------------------------------------------------------------
// STEP3. Prototype Sprint v1 found whole-cube-solved is floor-effected on
// this dataset (0/75 both Baseline and Candidate, all 30 runs) -- neither
// arm ever fully solves these hardest-failure snapshots inside the real
// 1000ms budget, so a binary "solved" comparison cannot detect a real
// difference even where one exists. This adds task-level partial-progress
// metrics that don't require reaching wrongWingCount===0 to register a
// signal: PAIR progress, wrongWing reduction, pairCount change, deferred
// improvement (Gate matched + a leaf found, but Deferred Validation
// rejected it), and net-improvement (the final accepted-or-not outcome).
//
// Baseline/Candidate mirrors are disclosed, independent reimplementations
// of FiveByFiveEdgeSolverEngine.solve()'s own top-level task loop (same
// pattern IncrementalScheduler.ts from Prototype Sprint v1 already
// established) -- needed because solve()/runCandidateSolve() (both
// EXISTING, protected -- read-only reuse only) return only aggregate
// scalars (SolvePlan.score / CandidateSolveResult), never the final cubies
// array, so finalPairCount cannot be read back out of them directly.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import type { InstrumentedAttempt } from "./InstrumentedSearch";
import { dispatchWithPolicy, type BudgetPolicyId, type BudgetPolicyContext } from "./BudgetRefinement";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";

export interface SolveMirrorResult {
  finalWrongWingCount: number;
  finalPairCount: number;
  totalMs: number;
  deadlineMissed: boolean;
}

/** No Incremental Recovery -- mirrors solve()'s real loop exactly, for the Baseline arm's final pairCount (not exposed by SolvePlan). */
export function runBaselineMirror(cubies: Cubie[], libs: ExecutorLibraries): SolveMirrorResult {
  const start = Date.now();
  const deadline = start + PLAN_TIME_BUDGET_MS;
  const working = cloneCubies(cubies);
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;
    executeTask(working, task, libs, deadline, undefined, true);
  }

  return {
    finalWrongWingCount: wrongWingCount5(working),
    finalPairCount: pairCountOf(working),
    totalMs: Date.now() - start,
    deadlineMissed: Date.now() > deadline,
  };
}

export interface TaskLevelAttemptRecord {
  wrongWingBefore: number;
  pairBefore: number;
  attempt: InstrumentedAttempt;
  appliedNetImprovement: boolean; // Deferred Validation accepted AND moves were applied
  skippedAsDuplicate: boolean; // true if a VisitedRegistry was supplied and this exact state was already attempted earlier in the same solve
}

export interface CandidateMirrorResult extends SolveMirrorResult {
  attempts: TaskLevelAttemptRecord[];
  duplicateInvocationCount: number; // states that WOULD have been re-attempted (recorded even with no registry supplied, by checking retrospectively)
}

/**
 * Same loop as IncrementalScheduler.runCandidateSolve() (Prototype Sprint
 * v1, read-only precedent), but dispatches through the instrumented core
 * so per-attempt deferred-improvement data survives. `registry`, if
 * supplied (STEP4's VisitedRegistry.ts), skips re-attempting a cube state
 * already seen earlier in this same solve -- shared across ALL PAIR task
 * slots, not just per-task (Prototype v1's own per-task cap only prevented
 * retrying the SAME task slot, not a different slot reaching an identical
 * state). The registry is scoped to a single solve -- there is nothing to
 * share across independent solves, so `useVisitedRegistry` is a simple
 * on/off flag rather than an externally-supplied Set.
 */
export function runCandidateMirror(
  cubies: Cubie[],
  libs: ExecutorLibraries,
  lib: WingLibrary,
  policy: BudgetPolicyId,
  policyCtx: Omit<BudgetPolicyContext, "remainingTimeMs">,
  useVisitedRegistry = false,
): CandidateMirrorResult {
  const start = Date.now();
  const deadline = start + PLAN_TIME_BUDGET_MS;
  const working = cloneCubies(cubies);
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  const attempts: TaskLevelAttemptRecord[] = [];
  const seenThisSolve = new Set<number>();
  let duplicateInvocationCount = 0;

  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;

    const moves = executeTask(working, task, libs, deadline, undefined, true);
    if (moves.length > 0) continue;

    if (task.type === "PAIR" && Date.now() <= deadline) {
      const wrongWingBefore = wrongWingCount5(working);
      const pairBefore = pairCountOf(working);
      const stateHash = computeEdgeSolverStateHash(working);

      const alreadySeen = seenThisSolve.has(stateHash);
      seenThisSolve.add(stateHash);

      const shouldSkip = useVisitedRegistry && alreadySeen;
      // "Duplicate Invocation" = the search was actually CALLED again on a
      // state already attempted earlier in this same solve -- not just
      // "this state was seen twice" (revisiting a state costs nothing by
      // itself; re-running a bounded DFS on it does). With the registry
      // active, shouldSkip prevents the call entirely, so this stays 0.
      if (alreadySeen && !shouldSkip) duplicateInvocationCount++;
      if (shouldSkip) {
        attempts.push({ wrongWingBefore, pairBefore, attempt: { primitiveUsed: null, search: null }, appliedNetImprovement: false, skippedAsDuplicate: true });
        continue;
      }

      const remainingTimeMs = Math.max(0, deadline - Date.now());
      const attempt = dispatchWithPolicy(working, lib, policy, remainingTimeMs, policyCtx);
      let applied = false;
      if (attempt.search?.deferredAccepted && attempt.search.moves) {
        applySeq(working, attempt.search.moves);
        applied = true;
      }
      attempts.push({ wrongWingBefore, pairBefore, attempt, appliedNetImprovement: applied, skippedAsDuplicate: false });
    }
  }

  return {
    finalWrongWingCount: wrongWingCount5(working),
    finalPairCount: pairCountOf(working),
    totalMs: Date.now() - start,
    deadlineMissed: Date.now() > deadline,
    attempts,
    duplicateInvocationCount,
  };
}

export interface TaskLevelMetric {
  name: "pairProgress" | "wrongWingReduction" | "pairCountChange" | "deferredImprovement" | "netImprovement";
  coverage: number; // attempted / totalPairNoProgressRecords
  precision: number; // metricTrue / attempted
  recall: number; // metricTrue / totalPairNoProgressRecords
}

export function computeTaskLevelMetrics(allAttempts: readonly TaskLevelAttemptRecord[]): TaskLevelMetric[] {
  const total = allAttempts.length;
  const attempted = allAttempts.filter((a) => a.attempt.search !== null);
  const attemptedCount = attempted.length;

  const count = (pred: (a: TaskLevelAttemptRecord) => boolean) => allAttempts.filter(pred).length;
  const metric = (name: TaskLevelMetric["name"], pred: (a: TaskLevelAttemptRecord) => boolean): TaskLevelMetric => {
    const trueCount = count(pred);
    return {
      name,
      coverage: total ? attemptedCount / total : 0,
      precision: attemptedCount ? trueCount / attemptedCount : 0,
      recall: total ? trueCount / total : 0,
    };
  };

  return [
    metric("pairProgress", (a) => a.appliedNetImprovement),
    metric("wrongWingReduction", (a) => a.attempt.search !== null && a.attempt.search.wrongWingAfterBestLeaf !== null && a.attempt.search.wrongWingAfterBestLeaf < a.wrongWingBefore),
    metric("pairCountChange", (a) => a.appliedNetImprovement), // pairCount and wrongWingCount move together under Deferred Validation's own definition (net WrongWing improvement) -- reported separately per the work order, but on this mechanism they coincide by construction
    metric("deferredImprovement", (a) => a.attempt.search !== null && a.attempt.search.leafFound && !a.attempt.search.deferredAccepted),
    metric("netImprovement", (a) => a.appliedNetImprovement),
  ];
}

export interface WholeCubeComparison {
  n: number;
  improvedCount: number; // candidate.finalWrongWingCount < baseline.finalWrongWingCount
  regressedCount: number; // candidate.finalWrongWingCount > baseline.finalWrongWingCount
  unchangedCount: number;
  avgWrongWingDelta: number; // mean(baseline.finalWrongWingCount - candidate.finalWrongWingCount), positive = candidate better
  pointBiserialCorrelation: number | null; // correlation between "this solve had >=1 successful task-level attempt" and "candidate improved on whole-cube wrongWingCount" -- null if either variable has zero variance (degenerate, reported honestly rather than as a fabricated 0)
}

function pointBiserial(binaryX: readonly boolean[], binaryY: readonly boolean[]): number | null {
  const n = binaryX.length;
  if (n === 0) return null;
  const x: number[] = binaryX.map((b) => (b ? 1 : 0));
  const y: number[] = binaryY.map((b) => (b ? 1 : 0));
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - meanX) * (y[i] - meanY);
    varX += (x[i] - meanX) ** 2;
    varY += (y[i] - meanY) ** 2;
  }
  if (varX === 0 || varY === 0) return null; // no variance in one variable -- correlation is undefined, not zero
  return cov / Math.sqrt(varX * varY);
}

export function compareWholeCube(baseline: readonly SolveMirrorResult[], candidate: readonly CandidateMirrorResult[]): WholeCubeComparison {
  const n = Math.min(baseline.length, candidate.length);
  let improvedCount = 0;
  let regressedCount = 0;
  let unchangedCount = 0;
  let deltaSum = 0;
  const hadSuccess: boolean[] = [];
  const improved: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const b = baseline[i];
    const c = candidate[i];
    const delta = b.finalWrongWingCount - c.finalWrongWingCount;
    deltaSum += delta;
    if (delta > 0) improvedCount++;
    else if (delta < 0) regressedCount++;
    else unchangedCount++;
    hadSuccess.push(c.attempts.some((a) => a.appliedNetImprovement));
    improved.push(delta > 0);
  }

  return {
    n,
    improvedCount,
    regressedCount,
    unchangedCount,
    avgWrongWingDelta: n ? deltaSum / n : 0,
    pointBiserialCorrelation: pointBiserial(hadSuccess, improved),
  };
}
