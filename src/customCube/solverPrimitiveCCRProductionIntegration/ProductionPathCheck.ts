// --- ProductionPathCheck (CCR Production Integration Sprint v1) -----------
// STEP1/2. A REAL, single real-solve()-level pass -- since this Sprint's
// own STEP1 change (wiring CCR into fiveByFiveEdgeRecovery.ts) already
// lives inside production code itself, calling the REAL, completely
// unmodified FiveByFiveEdgeSolverEngine.solve()/executeTask/planEdgeTasks
// (all read-only this Sprint, called exactly as-is) automatically
// exercises CCR's real, now-wired-in behavior -- no override parameter
// needed. Mirrors solverPrimitiveIntegrationV2/ProductionPathAnalysis.ts's
// own precedent exactly, extended to also parse CCR's own trace entries
// (genCCR()'s own description string embeds "remainingTime=Xms 남음",
// giving a REAL, directly-measured remainingTime distribution straight
// from the unmodified engine's own trace log).
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

const CCR_BUDGET_FLOOR_MS = 500; // CCR Integration Blueprint Sprint v1's own recommended floor

export interface ProductionPathRecord {
  hash: string;
  solved: boolean;
  recoveryTriggered: boolean;
  ccrGenerated: boolean; // CCR appeared among Recovery's candidates (Gate matched AND Deferred Validation accepted)
  ccrChosen: boolean;
  ccrRemainingTimeMs: number | null; // parsed straight from the real trace's own "remainingTime=Xms" text; null if CCR never attempted
  ccrFloorMet: boolean | null; // ccrRemainingTimeMs >= 500ms; null if not attempted
  timeMs: number;
  heapDeltaBytes: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  regressed: boolean;
  deadlineMissed: boolean;
}

function parseRemainingTimeMs(detail: string): number | null {
  const m = detail.match(/remainingTime=(\d+)ms/);
  return m ? Number(m[1]) : null;
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
  const ccrCandidateEntry = trace.find((t) => t.label === "recovery-candidates" && (t.detail ?? "").includes("Clean-Cycle Resolution"));
  const ccrGenerated = !!ccrCandidateEntry;
  const shortCircuited = trace.some((t) => t.label === "recovery-repair-short-circuit" && (t.detail ?? "").startsWith("CCR"));
  const ccrChosen = shortCircuited || trace.some((t) => t.label === "recovery-applied" && (t.detail ?? "").includes("Clean-Cycle Resolution"));
  const ccrRemainingTimeMs = ccrCandidateEntry ? parseRemainingTimeMs(ccrCandidateEntry.detail ?? "") : null;

  return {
    hash: snapshot.hash,
    solved: wrongWingAfter === 0,
    recoveryTriggered,
    ccrGenerated,
    ccrChosen,
    ccrRemainingTimeMs,
    ccrFloorMet: ccrRemainingTimeMs === null ? null : ccrRemainingTimeMs >= CCR_BUDGET_FLOOR_MS,
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
  ccrGeneratedRate: number;
  ccrChosenRate: number;
  ccrCallCount: number;
  avgRemainingBudgetMs: number;
  floorMetRate: number; // among CCR calls that were actually attempted
  avgRuntimeMs: number;
  p95RuntimeMs: number;
  deadlineMissRate: number;
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
  const ccrAttempted = records.filter((r) => r.ccrRemainingTimeMs !== null);
  return {
    n,
    solveRate: n ? records.filter((r) => r.solved).length / n : 0,
    recoveryRate: n ? records.filter((r) => r.recoveryTriggered).length / n : 0,
    ccrGeneratedRate: n ? records.filter((r) => r.ccrGenerated).length / n : 0,
    ccrChosenRate: n ? records.filter((r) => r.ccrChosen).length / n : 0,
    ccrCallCount: ccrAttempted.length,
    avgRemainingBudgetMs: ccrAttempted.length ? ccrAttempted.reduce((a, r) => a + (r.ccrRemainingTimeMs ?? 0), 0) / ccrAttempted.length : 0,
    floorMetRate: ccrAttempted.length ? ccrAttempted.filter((r) => r.ccrFloorMet).length / ccrAttempted.length : 0,
    avgRuntimeMs: n ? times.reduce((a, b) => a + b, 0) / n : 0,
    p95RuntimeMs: percentile(times, 95),
    deadlineMissRate: n ? records.filter((r) => r.deadlineMissed).length / n : 0,
    regressionCount: records.filter((r) => r.regressed).length,
  };
}
