// --- ShadowSolveLoop (Solver Primitive Integration Prototype Sprint v1)
// -- STEP5/6 shared helper. fiveByFiveEdgeSolverEngine.ts is FORBIDDEN to
// modify or parametrize this Sprint ("Solver Architecture 수정 금지"), and
// its own solve() never exposes includeRepair/shortCircuitRepair, so a
// true "기존 Production Solver vs REPAIR 포함 Solver" comparison can't be
// obtained by calling solve() itself (it now ALWAYS uses the new REPAIR
// defaults, since the underlying executeTask/attemptRecovery chain has
// REPAIR wired in by default as of this Sprint's STEP1).
//
// This function reimplements solve()'s own orchestration loop byte-for-
// byte (same planDeadline=200ms slice, same per-task executeTask(...,
// allowRecovery=true) call, same budget/already-solved/break conditions)
// purely as a benchmark harness, calling the REAL, unmodified
// planEdgeTasks/executeTask exports directly -- Engine/Planner code
// itself is never touched or reimplemented, only re-invoked with extra
// trailing parameters solve() doesn't currently thread through.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { Move } from "../fiveByFiveEdges";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { DEFAULT_EVALUATOR_WEIGHTS, type EvaluatorWeights } from "../fiveByFiveEdgeEvaluator";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

export interface ShadowSolveResult {
  wrongWingBefore: number;
  wrongWingAfter: number;
  moveCount: number;
  taskCount: number;
  completedTaskCount: number;
  timeMs: number;
  recoveryTriggeredCount: number;
  repairGeneratedCount: number; // trace "recovery-candidates" entries mentioning REPAIR's description
  repairShortCircuitCount: number;
  trace: TraceEntry[];
}

/** Byte-identical orchestration to FiveByFiveEdgeSolverEngine.solve(),
 * minus the SolvePlan/cache bookkeeping this benchmark doesn't need,
 * plus the includeRepair/shortCircuitRepair pass-through solve() itself
 * doesn't (and per this Sprint's constraints, must not) expose. */
export function runShadowSolve(
  cubies: Cubie[],
  libs: ExecutorLibraries,
  includeRepair: boolean,
  shortCircuitRepair: boolean,
  weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS
): ShadowSolveResult {
  const trace: TraceEntry[] = [];
  const start = Date.now();
  const wrongWingBefore = wrongWingCount5(cubies);

  const working = cloneCubies(cubies);
  const deadline = start + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, start + 200);
  const { tasks, trace: plannerTrace } = planEdgeTasks(working, libs, weights, planDeadline, deadline);
  trace.push(...plannerTrace);

  const moveQueue: Move[] = [];
  let completedTaskCount = 0;

  for (const task of tasks) {
    if (Date.now() > deadline) break;
    if (wrongWingCount5(working) === 0) break;
    const moves = executeTask(working, task, libs, deadline, trace, true, weights, includeRepair, shortCircuitRepair);
    if (moves.length > 0) {
      moveQueue.push(...moves);
      completedTaskCount++;
    }
  }

  const timeMs = Date.now() - start;
  const wrongWingAfter = wrongWingCount5(working);

  return {
    wrongWingBefore,
    wrongWingAfter,
    moveCount: moveQueue.length,
    taskCount: tasks.length,
    completedTaskCount,
    timeMs,
    recoveryTriggeredCount: trace.filter((t) => t.label === "recovery-triggered").length,
    repairGeneratedCount: trace.filter((t) => t.label === "recovery-candidates" && (t.detail ?? "").includes("구조적 Cycle 해결")).length,
    repairShortCircuitCount: trace.filter((t) => t.label === "recovery-repair-short-circuit").length,
    trace,
  };
}
