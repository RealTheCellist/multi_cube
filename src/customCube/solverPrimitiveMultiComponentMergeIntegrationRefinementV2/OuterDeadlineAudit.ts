// --- OuterDeadlineAudit (Multi-Component Merge Production Integration
// Refinement Sprint v2, STEP1) -----------------------------------------------
// Real generateRecoveryStrategies() replay (read-only, UNMODIFIED usage --
// the outer `deadline` argument is already an ordinary parameter of the
// production function, no code change needed to vary it) capturing outer
// deadline / remainingTime / MCM start-end / deadline-abort per case, at
// the real production default order (AFTER_CCR) -- Scheduler Ordering is
// held fixed per this Sprint's own "Scheduler Ordering도 추가 변경하지
// 않는다" scope.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const NOMINAL_MCM_BUDGET_MS = 2000; // MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS, cited from fiveByFiveEdgeRecovery.ts

export interface OuterDeadlineAuditRow {
  label: string;
  outerDeadlineMs: number;
  mcmPhase: "generated" | "empty" | "skipped" | "never_started";
  mcmStartMs: number | null;
  mcmEndMs: number | null;
  mcmOwnMs: number | null; // wall time MCM's own turn actually took
  remainingTimeAtMcmStartMs: number | null; // outerDeadline(absolute) - mcmStartMs -- how much of the outer budget was left when MCM's turn began
  actualBudgetAvailableMs: number | null; // min(NOMINAL_MCM_BUDGET_MS, remainingTimeAtMcmStartMs)
  deadlineAbort: boolean; // MCM's own turn ran past the outer deadline (mcmEndMs > callStart + outerDeadlineMs)
}

export function auditOneCase(cubies: Cubie[], label: string, libs: ExecutorLibraries, outerDeadlineMs: number): OuterDeadlineAuditRow {
  const events: SchedulingEvent[] = [];
  const startMs: Partial<Record<string, number>> = {};
  const endMs: Partial<Record<string, number>> = {};
  const onEvent = (e: SchedulingEvent) => {
    events.push(e);
    if (e.phase === "start") startMs[e.candidateType] = e.atMs;
    else endMs[e.candidateType] = e.atMs;
  };

  const callStart = Date.now();
  const deadline = callStart + outerDeadlineMs;
  generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true, "AFTER_CCR");

  const mcmEvent = events.filter((e) => e.candidateType === "MULTI_COMPONENT_MERGE").slice(-1)[0];
  const mcmPhase: OuterDeadlineAuditRow["mcmPhase"] = mcmEvent ? (mcmEvent.phase as OuterDeadlineAuditRow["mcmPhase"]) : "never_started";
  const mcmStartMs = startMs["MULTI_COMPONENT_MERGE"] ?? null;
  const mcmEndMs = endMs["MULTI_COMPONENT_MERGE"] ?? null;
  const mcmOwnMs = mcmStartMs !== null && mcmEndMs !== null ? mcmEndMs - mcmStartMs : null;
  const remainingTimeAtMcmStartMs = mcmStartMs !== null ? deadline - mcmStartMs : null;
  const actualBudgetAvailableMs = remainingTimeAtMcmStartMs !== null ? Math.min(NOMINAL_MCM_BUDGET_MS, remainingTimeAtMcmStartMs) : null;
  const deadlineAbort = mcmEndMs !== null ? mcmEndMs > deadline : false;

  return { label, outerDeadlineMs, mcmPhase, mcmStartMs, mcmEndMs, mcmOwnMs, remainingTimeAtMcmStartMs, actualBudgetAvailableMs, deadlineAbort };
}

export function auditPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries, outerDeadlineMs: number): OuterDeadlineAuditRow[] {
  return holes.map((h) => auditOneCase(h.cubies, h.label, libs, outerDeadlineMs));
}

export interface OuterDeadlineAuditSummary {
  outerDeadlineMs: number;
  n: number;
  gateMatchedCount: number;
  avgRemainingTimeAtMcmStartMs: number;
  avgActualBudgetAvailableMs: number;
  fullBudgetCount: number; // actualBudgetAvailableMs >= NOMINAL_MCM_BUDGET_MS -- MCM got its ENTIRE nominal 2000ms slice
  fullBudgetRate: number;
  deadlineAbortCount: number;
}

export function summarizeOuterDeadlineAudit(rows: readonly OuterDeadlineAuditRow[]): OuterDeadlineAuditSummary {
  const gateMatched = rows.filter((r) => r.mcmPhase !== "skipped" && r.mcmPhase !== "never_started");
  const withBudget = gateMatched.filter((r) => r.actualBudgetAvailableMs !== null);
  const fullBudget = withBudget.filter((r) => (r.actualBudgetAvailableMs ?? 0) >= NOMINAL_MCM_BUDGET_MS);
  return {
    outerDeadlineMs: rows[0]?.outerDeadlineMs ?? 0,
    n: rows.length,
    gateMatchedCount: gateMatched.length,
    avgRemainingTimeAtMcmStartMs: withBudget.length ? withBudget.reduce((s, r) => s + (r.remainingTimeAtMcmStartMs ?? 0), 0) / withBudget.length : 0,
    avgActualBudgetAvailableMs: withBudget.length ? withBudget.reduce((s, r) => s + (r.actualBudgetAvailableMs ?? 0), 0) / withBudget.length : 0,
    fullBudgetCount: fullBudget.length,
    fullBudgetRate: withBudget.length ? fullBudget.length / withBudget.length : 0,
    deadlineAbortCount: rows.filter((r) => r.deadlineAbort).length,
  };
}
