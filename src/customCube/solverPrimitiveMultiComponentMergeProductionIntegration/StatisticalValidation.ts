// --- StatisticalValidation (Multi-Component Merge Production Integration
// Sprint v1, STEP5) -----------------------------------------------------------
// Routes every paired-diff through KpiDefinitions.evaluatePairedDiff
// (solverPostReleaseValidationFramework, UNMODIFIED) -- this arc's own
// standardized Statistical Validation entry point, itself built on
// computeStats/analyzeEffectSize (solverPrimitiveEvaluationStabilization/
// StatsUtil.ts + EffectSizeAnalysis.ts, UNMODIFIED). N=142 (STEP3's real
// CapabilityValidationRow[]) satisfies both the Directive's own N>=15 and
// Category C(New Primitive)'s own production-stage N>=30 requirement.
import { evaluatePairedDiff, type MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { CapabilityValidationRow } from "./CapabilityValidation";

export interface StatisticalValidationResult {
  n: number;
  improvedCountDiff: MetricEvaluation; // integrated.improved(1/0) - baseline.improved(1/0), per case -- Gate C input
  trueRegressionDiff: MetricEvaluation; // integrated.trueRegression(1/0) - baseline.trueRegression(1/0), per case -- Gate A input
  runtimeDiffMs: MetricEvaluation; // integrated.wallMs - baseline.wallMs, per case -- Gate B input
  newCapabilityRate: number; // mean of the newCapability(1/0) indicator -- the Directive's own explicit "newCapability" metric, reported directly (not a paired diff -- newCapability is already relative to Baseline by definition)
  baselineP95RuntimeMs: number;
}

export function runStatisticalValidation(rows: readonly CapabilityValidationRow[]): StatisticalValidationResult {
  const improvedDiffs = rows.map((r) => (r.integrated.improved ? 1 : 0) - (r.baseline.improved ? 1 : 0));
  const trueRegressionDiffs = rows.map((r) => (r.integrated.trueRegression ? 1 : 0) - (r.baseline.trueRegression ? 1 : 0));
  const runtimeDiffs = rows.map((r) => r.integrated.wallMs - r.baseline.wallMs);
  const newCapabilityRate = rows.length ? rows.filter((r) => r.newCapability).length / rows.length : 0;

  const sortedBaselineWallMs = rows.map((r) => r.baseline.wallMs).sort((a, b) => a - b);
  const baselineP95RuntimeMs = sortedBaselineWallMs.length
    ? sortedBaselineWallMs[Math.min(sortedBaselineWallMs.length - 1, Math.floor(0.95 * sortedBaselineWallMs.length))]
    : 0;

  return {
    n: rows.length,
    improvedCountDiff: evaluatePairedDiff(improvedDiffs),
    trueRegressionDiff: evaluatePairedDiff(trueRegressionDiffs),
    runtimeDiffMs: evaluatePairedDiff(runtimeDiffs),
    newCapabilityRate,
    baselineP95RuntimeMs,
  };
}
