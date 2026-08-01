// --- StatisticalValidation (Multi-Component Merge Production Integration
// Refinement Sprint v1, STEP5) -----------------------------------------------
// Routes every paired-diff through KpiDefinitions.evaluatePairedDiff
// (solverPostReleaseValidationFramework, UNMODIFIED) -- this arc's own
// standardized Statistical Validation entry point. N=142 (STEP2/3's real
// CapabilityReplayRow[]) satisfies the Directive's own N>=15 and Category
// D(Architecture Change)'s own production-stage N>=30 requirement.
import { evaluatePairedDiff, type MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { CapabilityReplayRow } from "./CapabilityReplay";

export interface PairwiseComparison {
  label: string;
  n: number;
  improvedCountDiff: MetricEvaluation;
  trueRegressionDiff: MetricEvaluation;
  runtimeDiffMs: MetricEvaluation;
  baselineP95RuntimeMs: number;
}

function buildComparison(label: string, rows: readonly CapabilityReplayRow[], armA: (r: CapabilityReplayRow) => CapabilityReplayRow["baseline"], armB: (r: CapabilityReplayRow) => CapabilityReplayRow["baseline"]): PairwiseComparison {
  const improvedDiffs = rows.map((r) => (armB(r).improved ? 1 : 0) - (armA(r).improved ? 1 : 0));
  const trueRegressionDiffs = rows.map((r) => (armB(r).trueRegression ? 1 : 0) - (armA(r).trueRegression ? 1 : 0));
  const runtimeDiffs = rows.map((r) => armB(r).wallMs - armA(r).wallMs);
  const sortedA = rows.map((r) => armA(r).wallMs).sort((a, b) => a - b);
  const baselineP95RuntimeMs = sortedA.length ? sortedA[Math.min(sortedA.length - 1, Math.floor(0.95 * sortedA.length))] : 0;
  return {
    label,
    n: rows.length,
    improvedCountDiff: evaluatePairedDiff(improvedDiffs),
    trueRegressionDiff: evaluatePairedDiff(trueRegressionDiffs),
    runtimeDiffMs: evaluatePairedDiff(runtimeDiffs),
    baselineP95RuntimeMs,
  };
}

export interface StatisticalValidationResult {
  beforeCcrVsAfterCcr: PairwiseComparison; // this Sprint's own key question -- does reordering help over today's production order?
  beforeCcrVsBaseline: PairwiseComparison; // does the reordered MCM meaningfully beat having no MCM at all?
  afterCcrVsBaseline: PairwiseComparison; // reproduces Production Integration Sprint v1's own comparison for cross-check
}

export function runStatisticalValidation(rows: readonly CapabilityReplayRow[]): StatisticalValidationResult {
  return {
    beforeCcrVsAfterCcr: buildComparison("BEFORE_CCR vs AFTER_CCR", rows, (r) => r.afterCcr, (r) => r.beforeCcr),
    beforeCcrVsBaseline: buildComparison("BEFORE_CCR vs Baseline(no MCM)", rows, (r) => r.baseline, (r) => r.beforeCcr),
    afterCcrVsBaseline: buildComparison("AFTER_CCR vs Baseline(no MCM)", rows, (r) => r.baseline, (r) => r.afterCcr),
  };
}
