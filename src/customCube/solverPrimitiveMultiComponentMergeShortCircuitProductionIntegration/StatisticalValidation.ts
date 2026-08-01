// --- StatisticalValidation (Multi-Component Merge Short-Circuit Production
// Integration Sprint v1, STEP6 prep) -------------------------------------------
// Paired-diff (Integrated - Baseline) over the full 142-case population,
// reusing evaluatePairedDiff (solverPostReleaseValidationFramework/
// KpiDefinitions.ts, UNMODIFIED) exactly as every prior Sprint in this arc.
import { evaluatePairedDiff, type MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { ReplayOutcome } from "./ReplayRunner";

export interface PairwiseComparison {
  n: number;
  improvedCountDiff: MetricEvaluation;
  trueRegressionDiff: MetricEvaluation;
  runtimeDiffMs: MetricEvaluation;
  baselineP95RuntimeMs: number;
}

export function compareBaselineVsIntegrated(baseline: readonly ReplayOutcome[], integrated: readonly ReplayOutcome[]): PairwiseComparison {
  const baselineByLabel = new Map(baseline.map((r) => [r.label, r]));
  const paired = integrated.map((intRow) => ({ intRow, baseRow: baselineByLabel.get(intRow.label)! }));

  const improvedDiffs = paired.map(({ intRow, baseRow }) => (intRow.improved ? 1 : 0) - (baseRow.improved ? 1 : 0));
  const trueRegressionDiffs = paired.map(({ intRow, baseRow }) => (intRow.trueRegression ? 1 : 0) - (baseRow.trueRegression ? 1 : 0));
  const runtimeDiffs = paired.map(({ intRow, baseRow }) => intRow.wallMs - baseRow.wallMs);
  const sortedBaseline = baseline.map((r) => r.wallMs).sort((a, b) => a - b);
  const baselineP95RuntimeMs = sortedBaseline.length ? sortedBaseline[Math.min(sortedBaseline.length - 1, Math.floor(0.95 * sortedBaseline.length))] : 0;

  return {
    n: paired.length,
    improvedCountDiff: evaluatePairedDiff(improvedDiffs),
    trueRegressionDiff: evaluatePairedDiff(trueRegressionDiffs),
    runtimeDiffMs: evaluatePairedDiff(runtimeDiffs),
    baselineP95RuntimeMs,
  };
}
