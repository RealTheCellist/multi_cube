// --- RecoveryInteractionAnalysis (Solver Primitive Integration
// Refinement Sprint v1) -- STEP4 (Recovery Interaction) + STEP5 (Cost)
// share ONE full executeTask(allowRecovery=true) pass per scheduling
// strategy -- exercises the REAL production path (runPrimaryPipeline ->
// attemptRecovery -> generateRecoveryStrategies(schedulingStrategy) ->
// chooseBestRecovery -> short-circuit or retryTask) exactly like
// Integration Prototype Sprint v1's own RecoveryBenchmark.runOutcome,
// extended with the schedulingStrategy parameter this Sprint added.
// DISRUPT/SETUP/REPAIR usage and retry/short-circuit counts are read
// directly off the EXISTING trace labels (already emitted by
// attemptRecovery, unmodified) rather than new instrumentation.
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { SolveTask, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import type { SchedulingStrategy } from "../fiveByFiveEdgeRecovery";

const ENDGAME_TASK: SolveTask = { id: 0, type: "ENDGAME", description: "Integration Refinement Sprint v1 benchmark task", targetEdge: -1, score: 0 };
// Matches PLAN_TIME_BUDGET_MS (fiveByFiveEdgeSolverEngine.ts) and
// Integration Prototype Sprint v1's own RecoveryBenchmark.ts convention --
// the real whole-plan budget a single ENDGAME task's deadline would be
// drawn from.
export const INTERACTION_DEADLINE_MS = 1000;

export interface InteractionRecord {
  hash: string;
  disruptChosen: boolean;
  setupChosen: boolean;
  repairChosen: boolean;
  retryCount: number;
  shortCircuited: boolean;
  timeMs: number;
  heapDeltaBytes: number; // approximate -- process.memoryUsage() around a single call is GC-timing-sensitive, disclosed as a rough signal only, not a precise per-call cost
  wrongWingBefore: number;
  wrongWingAfter: number;
  succeeded: boolean;
  regressed: boolean;
  deadlineMissed: boolean; // timeMs > INTERACTION_DEADLINE_MS
}

function runOne(snapshot: FailureSnapshot, libs: ExecutorLibraries, strategy: SchedulingStrategy): InteractionRecord {
  const cubies = deserializeCube(snapshot.cubeState);
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];

  const heapBefore = process.memoryUsage().heapUsed;
  const start = Date.now();
  const deadline = start + INTERACTION_DEADLINE_MS;
  const moves = executeTask(clone, ENDGAME_TASK, libs, deadline, trace, true, undefined, true, true, strategy);
  const timeMs = Date.now() - start;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

  if (moves.length > 0) applySeq(clone, moves);
  const wrongWingAfter = wrongWingCount5(clone);

  const candidateTrace = trace.find((t) => t.label === "recovery-applied");
  const detail = candidateTrace?.detail ?? "";
  const disruptChosen = detail.includes("Disruption");
  const setupChosen = detail.includes("Setup");
  const repairChosen = detail.includes("구조적 Cycle 해결");
  const retryCount = trace.filter((t) => t.label.startsWith("recovery-retry-")).length;
  const shortCircuited = trace.some((t) => t.label === "recovery-repair-short-circuit");

  return {
    hash: snapshot.hash,
    disruptChosen,
    setupChosen,
    repairChosen,
    retryCount,
    shortCircuited,
    timeMs,
    heapDeltaBytes,
    wrongWingBefore,
    wrongWingAfter,
    succeeded: wrongWingAfter < wrongWingBefore,
    regressed: wrongWingAfter > wrongWingBefore,
    deadlineMissed: timeMs > INTERACTION_DEADLINE_MS,
  };
}

export function analyzeRecoveryInteraction(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, strategy: SchedulingStrategy): InteractionRecord[] {
  return snapshots.map((s) => runOne(s, libs, strategy));
}

export interface InteractionSummary {
  strategy: SchedulingStrategy;
  n: number;
  disruptUsageRate: number;
  setupUsageRate: number;
  repairUsageRate: number;
  avgRetryCount: number;
  shortCircuitRate: number;
}

export function summarizeInteraction(strategy: SchedulingStrategy, records: readonly InteractionRecord[]): InteractionSummary {
  const n = records.length;
  return {
    strategy,
    n,
    disruptUsageRate: n ? records.filter((r) => r.disruptChosen).length / n : 0,
    setupUsageRate: n ? records.filter((r) => r.setupChosen).length / n : 0,
    repairUsageRate: n ? records.filter((r) => r.repairChosen).length / n : 0,
    avgRetryCount: n ? records.reduce((a, r) => a + r.retryCount, 0) / n : 0,
    shortCircuitRate: n ? records.filter((r) => r.shortCircuited).length / n : 0,
  };
}

export interface CostSummary {
  strategy: SchedulingStrategy;
  n: number;
  avgRuntimeMs: number;
  p99RuntimeMs: number;
  avgHeapDeltaBytes: number;
  deadlineMissRate: number;
}

export function summarizeCost(strategy: SchedulingStrategy, records: readonly InteractionRecord[]): CostSummary {
  const n = records.length;
  const sortedTimes = records.map((r) => r.timeMs).sort((a, b) => a - b);
  const p99Index = Math.min(sortedTimes.length - 1, Math.ceil(0.99 * sortedTimes.length) - 1);
  return {
    strategy,
    n,
    avgRuntimeMs: n ? records.reduce((a, r) => a + r.timeMs, 0) / n : 0,
    p99RuntimeMs: sortedTimes.length ? sortedTimes[Math.max(0, p99Index)] : 0,
    avgHeapDeltaBytes: n ? records.reduce((a, r) => a + r.heapDeltaBytes, 0) / n : 0,
    deadlineMissRate: n ? records.filter((r) => r.deadlineMissed).length / n : 0,
  };
}
