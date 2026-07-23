// --- StatisticalValidation (ENDGAME Optimization Prototype Refinement
// Sprint v1, STEP3) ----------------------------------------------------------
// Standard Evaluation Protocol (paired-diff 95% CI + Cohen's d_z), reused
// read-only across this whole research arc, applied here across N=30
// trials for EVERY budget vs the 450ms Baseline arm (same trial index,
// same 75-snapshot subsample -- a genuine paired comparison).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { BudgetTrialAggregate } from "./BudgetSweep";

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

export interface BudgetEvaluation {
  budgetMs: number;
  primary: MetricEvaluation; // improved count diff (budget - baseline)
  secondary: MetricEvaluation; // solved count diff
  runtime: MetricEvaluation; // avg wall ms diff
  deadlineMiss: MetricEvaluation; // deadline miss rate diff, pp
  recoveryTrigger: MetricEvaluation; // recovery trigger rate diff, pp
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

/** `trialsByBudget`: budgetMs -> array of N=30 per-trial aggregates (same trial index = same 75-snapshot draw across all budgets). */
export function runStatisticalValidation(trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>, baselineBudgetMs: number): BudgetEvaluation[] {
  const baselineTrials = trialsByBudget.get(baselineBudgetMs);
  if (!baselineTrials) throw new Error(`No trials found for baseline budget ${baselineBudgetMs}ms`);

  const evaluations: BudgetEvaluation[] = [];
  for (const [budgetMs, trials] of trialsByBudget) {
    if (budgetMs === baselineBudgetMs) continue;
    const n = trials.length;
    const improvedDiffs = trials.map((t, i) => t.improvedCount - baselineTrials[i].improvedCount);
    const solvedDiffs = trials.map((t, i) => t.solvedCount - baselineTrials[i].solvedCount);
    const runtimeDiffs = trials.map((t, i) => t.avgWallMs - baselineTrials[i].avgWallMs);
    const deadlineMissDiffs = trials.map((t, i) => (t.deadlineMissRate - baselineTrials[i].deadlineMissRate) * 100);
    const recoveryTriggerDiffs = trials.map((t, i) => (t.recoveryTriggerRate - baselineTrials[i].recoveryTriggerRate) * 100);
    void n;
    evaluations.push({
      budgetMs,
      primary: evaluate(improvedDiffs),
      secondary: evaluate(solvedDiffs),
      runtime: evaluate(runtimeDiffs),
      deadlineMiss: evaluate(deadlineMissDiffs),
      recoveryTrigger: evaluate(recoveryTriggerDiffs),
    });
  }
  return evaluations.sort((a, b) => b.budgetMs - a.budgetMs);
}
