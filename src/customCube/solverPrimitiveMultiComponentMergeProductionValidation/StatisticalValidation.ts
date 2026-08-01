// --- StatisticalValidation (Multi-Component Merge Production Validation
// Sprint v1, STEP3) --------------------------------------------------------------
// Paired-diff (Current Production - Baseline) over the full 142-case
// population, reusing evaluatePairedDiff (solverPostReleaseValidationFramework/
// KpiDefinitions.ts, UNMODIFIED) exactly as every prior Sprint in this arc.
// Primary KPI: improvedCount. Secondary KPI: solvedCount (per the
// Directive's own STEP3 spec).
import { evaluatePairedDiff, type MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";

export interface PairwiseComparison {
  n: number;
  improvedCountDiff: MetricEvaluation; // primary KPI
  solvedCountDiff: MetricEvaluation; // secondary KPI
  trueRegressionDiff: MetricEvaluation;
  runtimeDiffMs: MetricEvaluation;
  baselineP95RuntimeMs: number;
}

export function compareBaselineVsIntegrated(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): PairwiseComparison {
  const baselineByHash = new Map(baseline.map((r) => [r.hash, r]));
  const paired = integrated.map((intRow) => ({ intRow, baseRow: baselineByHash.get(intRow.hash)! }));

  const improvedDiffs = paired.map(({ intRow, baseRow }) => (intRow.improved ? 1 : 0) - (baseRow.improved ? 1 : 0));
  const solvedDiffs = paired.map(({ intRow, baseRow }) => (intRow.solved ? 1 : 0) - (baseRow.solved ? 1 : 0));
  const trueRegressionDiffs = paired.map(({ intRow, baseRow }) => {
    const intRegressed = intRow.wrongWingAfter > intRow.wrongWingBefore;
    const baseRegressed = baseRow.wrongWingAfter > baseRow.wrongWingBefore;
    return (intRegressed ? 1 : 0) - (baseRegressed ? 1 : 0);
  });
  const runtimeDiffs = paired.map(({ intRow, baseRow }) => intRow.wallMs - baseRow.wallMs);
  const sortedBaseline = baseline.map((r) => r.wallMs).sort((a, b) => a - b);
  const baselineP95RuntimeMs = sortedBaseline.length ? sortedBaseline[Math.min(sortedBaseline.length - 1, Math.floor(0.95 * sortedBaseline.length))] : 0;

  return {
    n: paired.length,
    improvedCountDiff: evaluatePairedDiff(improvedDiffs),
    solvedCountDiff: evaluatePairedDiff(solvedDiffs),
    trueRegressionDiff: evaluatePairedDiff(trueRegressionDiffs),
    runtimeDiffMs: evaluatePairedDiff(runtimeDiffs),
    baselineP95RuntimeMs,
  };
}
