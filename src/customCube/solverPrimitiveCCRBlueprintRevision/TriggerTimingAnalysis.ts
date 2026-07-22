// --- TriggerTimingAnalysis (CCR Integration Blueprint Revision Sprint v1) --
// STEP1. Full distribution (not just the average) of Recovery's own
// real trigger timing and remaining-time-at-trigger, over the whole
// 335-snapshot dataset. Reuses runTimingDiagnostic()
// (solverPrimitiveCCRProductionIntegration/RecoveryTimingDiagnostic.ts,
// UNMODIFIED -- calls only the real, unmodified engine.solve()) and adds
// the richer statistics (median/p90/p95/histogram) this Sprint's own
// STEP1 asks for.
import { runTimingDiagnostic, type TimingDiagnosticRecord } from "../solverPrimitiveCCRProductionIntegration/RecoveryTimingDiagnostic";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

const PLAN_TIME_BUDGET_MS = 1000;

export interface RemainingTimeDistribution {
  n: number; // triggered count
  mean: number;
  median: number;
  p90: number;
  p95: number;
  min: number;
  max: number;
  histogram: { bucketLabel: string; count: number }[]; // remaining-time buckets, 0-1000ms in 100ms steps
}

function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function bucketLabelFor(remainingMs: number): string {
  const bucket = Math.min(9, Math.max(0, Math.floor(remainingMs / 100)));
  return `${bucket * 100}-${bucket * 100 + 100}ms`;
}

export function computeRemainingTimeDistribution(records: readonly TimingDiagnosticRecord[]): RemainingTimeDistribution {
  const remaining = records
    .filter((r) => r.recoveryTriggered && r.recoveryTriggeredAtMs !== null)
    .map((r) => Math.max(0, PLAN_TIME_BUDGET_MS - (r.recoveryTriggeredAtMs as number)));
  const sorted = [...remaining].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? sorted.reduce((a, b) => a + b, 0) / n : 0;

  const bucketOrder = Array.from({ length: 10 }, (_, i) => `${i * 100}-${i * 100 + 100}ms`);
  const counts = new Map(bucketOrder.map((b) => [b, 0]));
  for (const r of remaining) counts.set(bucketLabelFor(r), (counts.get(bucketLabelFor(r)) ?? 0) + 1);

  return {
    n,
    mean,
    median: percentileOf(sorted, 50),
    p90: percentileOf(sorted, 90),
    p95: percentileOf(sorted, 95),
    min: n ? sorted[0] : 0,
    max: n ? sorted[n - 1] : 0,
    histogram: bucketOrder.map((b) => ({ bucketLabel: b, count: counts.get(b) ?? 0 })),
  };
}

export function analyzeTriggerTiming(snapshots: readonly FailureSnapshot[]): { records: TimingDiagnosticRecord[]; distribution: RemainingTimeDistribution } {
  const records = runTimingDiagnostic(snapshots);
  const distribution = computeRemainingTimeDistribution(records);
  return { records, distribution };
}
