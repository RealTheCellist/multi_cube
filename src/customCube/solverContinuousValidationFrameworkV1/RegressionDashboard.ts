// --- RegressionDashboard (Continuous Validation Framework Sprint v1,
// STEP3) --------------------------------------------------------------------
// Accumulates a real, ordered series of population-replay runs into trend
// rows. Reuses buildRegressionTrend() (disclosed reuse, not duplicated)
// from the Long-term Reliability Validation Sprint's own module to compute
// each row's regressionCount against the immediately preceding run.
import { buildRegressionTrend } from "../solverLongTermReliabilityValidationV1/RegressionTrend";
import { summarizeRuntimeDistribution } from "../solverLongTermReliabilityValidationV1/RuntimeDistribution";
import type { ReplayRow } from "../solverLongTermReliabilityValidationV1/PopulationReplay";

export interface DashboardEntryInput {
  runId: string;
  startedAt: string;
  finishedAt: string;
  rows: ReplayRow[];
}

export interface DashboardRow {
  runId: string;
  startedAt: string;
  finishedAt: string;
  improvedCount: number;
  solvedCount: number;
  runtimeP50Ms: number;
  runtimeP95Ms: number;
  runtimeMaxMs: number;
  deadlineMissCount: number;
  regressionCountVsPrevious: number | null; // null for the first run in the series (no reference)
  flipRateVsPrevious: number | null;
}

export function buildDashboardHistory(entries: readonly DashboardEntryInput[]): DashboardRow[] {
  const sorted = [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const rows: DashboardRow[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const runtime = summarizeRuntimeDistribution(entry.rows);
    const previous = i > 0 ? sorted[i - 1] : null;
    const trend = previous ? buildRegressionTrend(previous.rows, entry.rows) : null;

    rows.push({
      runId: entry.runId,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      improvedCount: entry.rows.filter((r) => r.result.improved).length,
      solvedCount: entry.rows.filter((r) => r.result.solved).length,
      runtimeP50Ms: runtime.p50Ms,
      runtimeP95Ms: runtime.p95Ms,
      runtimeMaxMs: runtime.maxMs,
      deadlineMissCount: runtime.deadlineMissCount,
      regressionCountVsPrevious: trend ? trend.flipCount : null,
      flipRateVsPrevious: trend ? trend.flipRate : null,
    });
  }

  return rows;
}
