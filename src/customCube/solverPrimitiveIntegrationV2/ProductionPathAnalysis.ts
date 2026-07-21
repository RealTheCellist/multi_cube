// --- ProductionPathAnalysis (Solver Primitive Integration Sprint v2) ------
// STEP2 (Contract Verification) + STEP6 (Production Regression Test)
// share ONE real-solve()-level pass -- since STEP1's Gate edit already
// lives inside runSuccessV2 itself, calling the REAL, completely
// unmodified FiveByFiveEdgeSolverEngine.solve()/executeTask/
// planEdgeTasks (all read-only this Sprint, called exactly as-is, no new
// parameters added anywhere) automatically exercises the NEW relaxed
// Gate -- no ShadowSolve-style counterfactual reimplementation or new
// override parameter was needed anywhere in Executor/Recovery/Planner
// for this single-arm health check (unlike prior Integration Sprints'
// own scheduling-strategy comparisons, which needed an explicit override
// parameter because there was no other way to reconstruct the OLD
// behavior at the full-solve()-level -- here STEP3/4/5's own
// runSuccessV2-level GateComparisonVariants.ts wrapper already covers
// the comparative question, so this file's job is narrower: does the
// REAL, now-shipped production path still behave safely).
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { FiveByFiveEdgeSolverEngine, PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import type { SolveTask, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";

const ENDGAME_PROBE_TASK: SolveTask = { id: 0, type: "ENDGAME", description: "Integration Sprint v2 planner-impact probe", targetEdge: -1, score: 0 };

export interface ProductionPathRecord {
  hash: string;
  solved: boolean;
  recoveryTriggered: boolean;
  repairGenerated: boolean; // "recovery-candidates" trace mentions REPAIR's description
  repairChosen: boolean; // "recovery-applied" mentions REPAIR OR short-circuit fired
  retryCount: number;
  shortCircuited: boolean;
  timeMs: number;
  heapDeltaBytes: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  regressed: boolean;
  deadlineMissed: boolean;
}

function runOne(snapshot: FailureSnapshot): ProductionPathRecord {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();

  const heapBefore = process.memoryUsage().heapUsed;
  const start = Date.now();
  const plan = engine.solve(cubies);
  const timeMs = Date.now() - start;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;

  const working = cloneCubies(cubies);
  applySeq(working, plan.moveQueue);
  const wrongWingAfter = wrongWingCount5(working);
  const trace = engine.getTrace();

  const recoveryTriggered = trace.some((t) => t.label === "recovery-triggered");
  const repairGenerated = trace.some((t) => t.label === "recovery-candidates" && (t.detail ?? "").includes("구조적 Cycle 해결"));
  const shortCircuited = trace.some((t) => t.label === "recovery-repair-short-circuit");
  const repairChosen = shortCircuited || trace.some((t) => t.label === "recovery-applied" && (t.detail ?? "").includes("구조적 Cycle 해결"));
  const retryCount = trace.filter((t) => t.label.startsWith("recovery-retry-")).length;

  return {
    hash: snapshot.hash,
    solved: wrongWingAfter === 0,
    recoveryTriggered,
    repairGenerated,
    repairChosen,
    retryCount,
    shortCircuited,
    timeMs,
    heapDeltaBytes,
    wrongWingBefore,
    wrongWingAfter,
    regressed: wrongWingAfter > wrongWingBefore,
    deadlineMissed: timeMs > PLAN_TIME_BUDGET_MS,
  };
}

export function analyzeProductionPath(snapshots: readonly FailureSnapshot[]): ProductionPathRecord[] {
  return snapshots.map(runOne);
}

export interface ProductionPathSummary {
  n: number;
  solveRate: number;
  recoveryRate: number;
  repairGenerationRate: number;
  repairChosenRate: number;
  avgRetryCount: number;
  shortCircuitRate: number;
  avgRuntimeMs: number;
  p95RuntimeMs: number;
  p99RuntimeMs: number;
  deadlineMissRate: number;
  avgHeapDeltaBytes: number;
  regressionCount: number;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarizeProductionPath(records: readonly ProductionPathRecord[]): ProductionPathSummary {
  const n = records.length;
  const times = records.map((r) => r.timeMs).sort((a, b) => a - b);
  return {
    n,
    solveRate: n ? records.filter((r) => r.solved).length / n : 0,
    recoveryRate: n ? records.filter((r) => r.recoveryTriggered).length / n : 0,
    repairGenerationRate: n ? records.filter((r) => r.repairGenerated).length / n : 0,
    repairChosenRate: n ? records.filter((r) => r.repairChosen).length / n : 0,
    avgRetryCount: n ? records.reduce((a, r) => a + r.retryCount, 0) / n : 0,
    shortCircuitRate: n ? records.filter((r) => r.shortCircuited).length / n : 0,
    avgRuntimeMs: n ? times.reduce((a, b) => a + b, 0) / n : 0,
    p95RuntimeMs: percentile(times, 95),
    p99RuntimeMs: percentile(times, 99),
    deadlineMissRate: n ? records.filter((r) => r.deadlineMissed).length / n : 0,
    avgHeapDeltaBytes: n ? records.reduce((a, r) => a + r.heapDeltaBytes, 0) / n : 0,
    regressionCount: records.filter((r) => r.regressed).length,
  };
}

export interface PlannerImpactResult {
  baselineJitterMismatch: number; // sigA vs sigB, no probe -- pre-existing jitter unrelated to this Sprint
  probeMismatch: number; // sigA vs sigC, after a real executeTask probe call
  attributableToProbe: number; // probeMismatch - baselineJitterMismatch
}

function planSignature(cubies: Cubie[], libs: ExecutorLibraries): string {
  const working = cloneCubies(cubies);
  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, DEFAULT_EVALUATOR_WEIGHTS, planDeadline, deadline);
  return tasks.map((t) => `${t.type}:${t.targetEdge}:${t.description}`).join("|");
}

export function checkPlannerImpact(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): PlannerImpactResult {
  let baselineJitterMismatch = 0;
  let probeMismatch = 0;
  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    const sigA = planSignature(cubies, libs);
    const sigB = planSignature(cubies, libs);
    if (sigA !== sigB) baselineJitterMismatch++;

    const scratch = cloneCubies(cubies);
    const trace: TraceEntry[] = [];
    executeTask(scratch, ENDGAME_PROBE_TASK, libs, Date.now() + 400, trace, true, DEFAULT_EVALUATOR_WEIGHTS);
    const sigC = planSignature(cubies, libs);
    if (sigA !== sigC) probeMismatch++;
  }
  return { baselineJitterMismatch, probeMismatch, attributableToProbe: probeMismatch - baselineJitterMismatch };
}
