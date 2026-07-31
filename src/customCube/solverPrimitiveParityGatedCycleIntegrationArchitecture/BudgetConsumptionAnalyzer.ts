// --- BudgetConsumptionAnalyzer (Parity-Gated Cycle Integration
// Architecture Analysis Sprint v1, STEP2) ------------------------------------
// Aggregates RecoveryTimelineCollector.ts's own real per-case timelines
// into the Directive's own required table: avg/p95 Runtime, avg Remaining
// Time After, and Budget Share(%) per candidate type.
import type { CaseTimeline } from "./RecoveryTimelineCollector";
import { ALL_RECOVERY_TYPES } from "./RecoveryTimelineCollector";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

export interface BudgetConsumptionRow {
  type: RecoveryType;
  startedCount: number; // number of cases where this type's own generation actually started (not "skipped"/"never_started")
  avgRuntimeMs: number;
  p95RuntimeMs: number;
  avgRemainingTimeAfterMs: number;
  budgetSharePercent: number; // avg(ownRuntimeMs) / avg(totalCallRuntimeMs) across started cases, *100
}

export function analyzeBudgetConsumption(timelines: readonly CaseTimeline[]): BudgetConsumptionRow[] {
  const avgTotalCallRuntimeMs = timelines.length ? timelines.reduce((s, t) => s + t.totalCallRuntimeMs, 0) / timelines.length : 0;

  return ALL_RECOVERY_TYPES.map((type) => {
    const started = timelines.map((t) => t.entries[type]).filter((e) => e.ownRuntimeMs !== null);
    const runtimes = started.map((e) => e.ownRuntimeMs!);
    const remainingAfters = started.map((e) => e.remainingTimeAfterMs!);
    const avgRuntimeMs = runtimes.length ? runtimes.reduce((s, v) => s + v, 0) / runtimes.length : 0;
    const avgRemainingTimeAfterMs = remainingAfters.length ? remainingAfters.reduce((s, v) => s + v, 0) / remainingAfters.length : 0;
    return {
      type,
      startedCount: started.length,
      avgRuntimeMs,
      p95RuntimeMs: percentile(runtimes, 0.95),
      avgRemainingTimeAfterMs,
      budgetSharePercent: avgTotalCallRuntimeMs > 0 ? (avgRuntimeMs / avgTotalCallRuntimeMs) * 100 : 0,
    };
  });
}
