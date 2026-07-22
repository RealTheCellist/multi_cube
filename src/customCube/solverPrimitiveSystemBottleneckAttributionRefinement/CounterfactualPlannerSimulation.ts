// --- CounterfactualPlannerSimulation (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP3) -----------------------------------------------
// READ-ONLY. For every "PlannerSkipped" snapshot (STEP1: the real 1-second
// plan deadline fired before the task loop ever reached the queued ENDGAME
// task), resumes the SAME real task queue from the exact point the real
// deadline stopped it (STEP1's own captured `skippedCubies`/`reachedIndex`),
// with the deadline extended enough to guarantee reaching AND executing
// ENDGAME -- measuring what the real solve() outcome WOULD have been if
// Planner/queue-ordering had gotten out of the way. No Production code
// touched; this only changes what deadline THIS analysis module's own
// mirror calls are given, exactly like the prior Sprint's disclosed
// counterfactual-reconstruction pattern.
import { cloneCubies } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { mirrorExecuteTask, type StageEvent } from "../solverPrimitiveSystemBottleneckAttribution/StageInstrumentedMirror";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import type { ReachabilityRecord } from "./PlannerReachabilityAnalysis";

export interface PlannerCounterfactualRecord {
  hash: string;
  wrongBeforeSkip: number; // real outcome: wrongWingCount frozen at the moment the real deadline fired
  wrongAfterCounterfactual: number; // wrongWingCount after resuming with an extended deadline through ENDGAME
  improvement: number; // wrongBeforeSkip - wrongAfterCounterfactual -- the REAL recovery gain from reaching ENDGAME
  solved: boolean;
  runtimeMs: number;
}

/** Resumes the exact real task queue from where the real deadline stopped it, with a fresh full budget -- guarantees reaching the queued ENDGAME task. */
export function simulateReachingEndgame(record: ReachabilityRecord, libs: ExecutorLibraries): PlannerCounterfactualRecord | null {
  if (record.case !== "PlannerSkipped" || !record.skippedCubies) return null;

  const working = cloneCubies(record.skippedCubies);
  const wrongBeforeSkip = wrongWingCount5(working);
  const start = Date.now();
  const extendedDeadline = Date.now() + PLAN_TIME_BUDGET_MS; // a fresh full plan budget for the remainder of the SAME real queue
  const events: StageEvent[] = [];

  for (let i = record.reachedIndex + 1; i < record.tasks.length; i++) {
    if (wrongWingCount5(working) === 0) break;
    mirrorExecuteTask(record.hash, working, record.tasks[i], libs, extendedDeadline, DEFAULT_EVALUATOR_WEIGHTS, events);
  }

  const runtimeMs = Date.now() - start;
  const wrongAfterCounterfactual = wrongWingCount5(working);
  return {
    hash: record.hash,
    wrongBeforeSkip,
    wrongAfterCounterfactual,
    improvement: wrongBeforeSkip - wrongAfterCounterfactual,
    solved: wrongAfterCounterfactual === 0,
    runtimeMs,
  };
}

export function simulateAllPlannerSkipped(records: readonly ReachabilityRecord[], libs: ExecutorLibraries): PlannerCounterfactualRecord[] {
  const results: PlannerCounterfactualRecord[] = [];
  for (const r of records) {
    const result = simulateReachingEndgame(r, libs);
    if (result) results.push(result);
  }
  return results;
}
