// --- IncrementalScheduler (Incremental Recovery Prototype Sprint v1) -----
// STEP3. Disclosed reimplementation of FiveByFiveEdgeSolverEngine.solve()'s
// own top-level task loop (fiveByFiveEdgeSolverEngine.ts's solve() method,
// UNMODIFIED source) -- reusing the exact same real, exported
// planEdgeTasks()/executeTask() calls, in the exact same order, with the
// exact same allowRecovery=true (so the existing ENDGAME Recovery layer
// still runs exactly as it does today -- Incremental Recovery is additive,
// never a replacement for it). The ONLY addition versus the real solve()
// loop: whenever a PAIR task's own real attempt (via executeTask) returns
// no progress, the Incremental Recovery trigger gets exactly one shot at
// that same task slot before the loop moves to the next task --
//   PAIR no-progress -> Incremental Trigger -> REPAIR -> CCR -> PAIR continues
// -- exactly the Blueprint's Scheduling section. Production Solver/Planner/
// Executor/Recovery files are never modified or imported for write access,
// only called read-only, precisely as fiveByFiveEdgeSolverEngine.ts's own
// solve() already does.
import { cloneCubies, type Cubie } from "../cubeState";
import { wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";
import { attemptIncrementalRecovery, type IncrementalAttemptResult } from "./IncrementalRecoveryPrototype";

export interface IncrementalAttemptLogEntry {
  taskId: number;
  stateHashBefore: number; // computeEdgeSolverStateHash(working) just before this attempt -- used by Safety Verification (STEP6) to detect duplicate-state invocation across different task slots within the same solve
  attempt: IncrementalAttemptResult;
}

export interface CandidateSolveResult {
  solved: boolean; // wrongWingCount===0 at the end (same definition as SolvePlan.score===0 in the real engine)
  finalWrongWingCount: number;
  taskCount: number;
  completedTaskCount: number; // tasks that made progress, either via the primary pipeline or via a successful Incremental Recovery attempt
  incrementalAttempts: IncrementalAttemptLogEntry[]; // one entry per PAIR-no-progress point encountered, whether the Trigger fired or not
  totalMs: number;
  deadlineMissed: boolean;
}

export function runCandidateSolve(cubies: Cubie[], libs: ExecutorLibraries, lib: WingLibrary): CandidateSolveResult {
  const start = Date.now();
  const deadline = start + PLAN_TIME_BUDGET_MS;
  const working = cloneCubies(cubies);
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  const incrementalAttempts: IncrementalAttemptLogEntry[] = [];
  let completedTaskCount = 0;

  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;

    const moves = executeTask(working, task, libs, deadline, undefined, true);
    if (moves.length > 0) {
      completedTaskCount++;
      continue;
    }

    if (task.type === "PAIR" && Date.now() <= deadline) {
      const stateHashBefore = computeEdgeSolverStateHash(working);
      const remainingTimeMs = Math.max(0, deadline - Date.now());
      const attempt = attemptIncrementalRecovery(working, lib, remainingTimeMs);
      incrementalAttempts.push({ taskId: task.id, stateHashBefore, attempt });
      if (attempt.succeeded) completedTaskCount++; // this task slot's own goal was still reached, just via Incremental Recovery instead of the primary pipeline
    }
  }

  const finalWrongWingCount = wrongWingCount5(working);
  return {
    solved: finalWrongWingCount === 0,
    finalWrongWingCount,
    taskCount: tasks.length,
    completedTaskCount,
    incrementalAttempts,
    totalMs: Date.now() - start,
    deadlineMissed: Date.now() > deadline,
  };
}
