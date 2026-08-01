// --- StatisticalValidation (Multi-Component Merge Production Integration
// Refinement Sprint v2, STEP5) -----------------------------------------------
// Routes every paired-diff through KpiDefinitions.evaluatePairedDiff
// (solverPostReleaseValidationFramework, UNMODIFIED). N=142 satisfies the
// Directive's own N>=15 and Category D's own production-stage N>=30.
import { evaluatePairedDiff, type MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { DeadlineReplayRow } from "./DeadlineReplay";

export interface PairwiseComparison {
  label: string;
  n: number;
  improvedCountDiff: MetricEvaluation;
  trueRegressionDiff: MetricEvaluation;
  runtimeDiffMs: MetricEvaluation;
  baselineP95RuntimeMs: number;
}

function buildComparison(label: string, rows: readonly DeadlineReplayRow[], armA: (r: DeadlineReplayRow) => DeadlineReplayRow["armA"], armB: (r: DeadlineReplayRow) => DeadlineReplayRow["armA"]): PairwiseComparison {
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
  armBVsArmA: PairwiseComparison; // 1500ms vs 1000ms
  armCVsArmA: PairwiseComparison; // 2000ms vs 1000ms -- this Sprint's own key question
  armCVsArmB: PairwiseComparison; // 2000ms vs 1500ms
}

export function runStatisticalValidation(rows: readonly DeadlineReplayRow[]): StatisticalValidationResult {
  return {
    armBVsArmA: buildComparison("1500ms vs 1000ms", rows, (r) => r.armA, (r) => r.armB),
    armCVsArmA: buildComparison("2000ms vs 1000ms", rows, (r) => r.armA, (r) => r.armC),
    armCVsArmB: buildComparison("2000ms vs 1500ms", rows, (r) => r.armB, (r) => r.armC),
  };
}
