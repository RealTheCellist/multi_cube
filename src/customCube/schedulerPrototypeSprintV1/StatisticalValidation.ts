// --- StatisticalValidation (CONFLICT_DEEP_DEPENDENCY Scheduler Prototype
// Sprint v1, STEP6) -------------------------------------------------------
// Standard Evaluation Protocol (paired-diff 95% CI + Cohen's d_z), reused
// read-only from solverPrimitiveEvaluationStabilization/ (StatsUtil.ts's
// computeStats, EffectSizeAnalysis.ts's analyzeEffectSize) -- this arc's own
// established statistics convention, applied here across N>=15 repeats
// (each repeat = one full pass over the 142-case Hole Dataset, matching
// productionIntegrationFinalization/StatisticalValidation.ts's own
// per-trial-aggregate-then-paired-diff pattern). Paired unit = repeat (not
// case): for each repeat, count how many of the 142 cases succeeded under
// Baseline vs Candidate, then paired-diff those per-repeat counts across
// repeats.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { RunRecord } from "./ProductionReplayCollector";

export interface RepeatAggregate {
  n: number;
  baselineSucceededCount: number;
  candidateSucceededCount: number;
  baselineRegressedCount: number;
  candidateRegressedCount: number;
  baselineAvgTimeMs: number;
  candidateAvgTimeMs: number;
}

export function aggregateRepeat(run: RunRecord): RepeatAggregate {
  const n = run.length;
  const avg = (f: (r: RunRecord[number]) => number) => (n ? run.reduce((a, r) => a + f(r), 0) / n : 0);
  return {
    n,
    baselineSucceededCount: run.filter((r) => r.baselineSucceeded).length,
    candidateSucceededCount: run.filter((r) => r.candidateSucceeded).length,
    baselineRegressedCount: run.filter((r) => r.baselineRegressed).length,
    candidateRegressedCount: run.filter((r) => r.candidateRegressed).length,
    baselineAvgTimeMs: avg((r) => r.baselineTimeMs),
    candidateAvgTimeMs: avg((r) => r.candidateTimeMs),
  };
}

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

export interface StatisticalValidationResult {
  nRepeats: number;
  improvedCountDiff: MetricEvaluation; // candidate - baseline succeeded count, per repeat
  regressedCountDiff: MetricEvaluation; // candidate - baseline regressed count, per repeat
  runtimeDiffMs: MetricEvaluation; // candidate - baseline avg time, per repeat
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

export function runStatisticalValidation(runs: readonly RunRecord[]): StatisticalValidationResult {
  const aggregates = runs.map(aggregateRepeat);
  return {
    nRepeats: aggregates.length,
    improvedCountDiff: evaluate(aggregates.map((a) => a.candidateSucceededCount - a.baselineSucceededCount)),
    regressedCountDiff: evaluate(aggregates.map((a) => a.candidateRegressedCount - a.baselineRegressedCount)),
    runtimeDiffMs: evaluate(aggregates.map((a) => a.candidateAvgTimeMs - a.baselineAvgTimeMs)),
  };
}
