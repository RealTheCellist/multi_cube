// --- AdjacentPairAnalysis (ENDGAME Optimization Prototype Refinement
// Sprint v2, STEP4) ----------------------------------------------------------
// Paired-diff 95% CI + Cohen's d_z between each ADJACENT pair of budgets in
// this Sprint's own fresh sweep (250 vs 225, 225 vs 200, ..., 100 vs 75, 75
// vs 50) -- NOT a simple average comparison, per the Work Order's own
// explicit "단순 평균 비교 금지" instruction. Every pair is drawn from the
// SAME N=30 trial loop (same trial index i for both budgets), so this is a
// genuine paired comparison, not two independent samples.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { BudgetTrialAggregate } from "./BudgetSweep";

export interface PairEvaluation {
  largerBudgetMs: number;
  smallerBudgetMs: number;
  primary: { stats: SampleStats; effectSize: EffectSizeResult }; // improved count diff (smaller - larger)
  runtime: { stats: SampleStats; effectSize: EffectSizeResult };
  distinguishable: boolean; // 95% CI of Primary excludes 0
}

function evaluate(diffs: number[]): { stats: SampleStats; effectSize: EffectSizeResult } {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

/** `orderedBudgetsDescending`: e.g. [250, 225, 200, 175, 150, 125, 100, 75, 50]. */
export function analyzeAdjacentPairs(
  trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>,
  orderedBudgetsDescending: readonly number[]
): PairEvaluation[] {
  const results: PairEvaluation[] = [];
  for (let i = 0; i < orderedBudgetsDescending.length - 1; i++) {
    const largerBudgetMs = orderedBudgetsDescending[i];
    const smallerBudgetMs = orderedBudgetsDescending[i + 1];
    const largerTrials = trialsByBudget.get(largerBudgetMs)!;
    const smallerTrials = trialsByBudget.get(smallerBudgetMs)!;
    const improvedDiffs = smallerTrials.map((t, idx) => t.improvedCount - largerTrials[idx].improvedCount);
    const runtimeDiffs = smallerTrials.map((t, idx) => t.avgWallMs - largerTrials[idx].avgWallMs);
    const primary = evaluate(improvedDiffs);
    const runtime = evaluate(runtimeDiffs);
    results.push({
      largerBudgetMs,
      smallerBudgetMs,
      primary,
      runtime,
      distinguishable: primary.stats.ciLower > 0 || primary.stats.ciUpper < 0,
    });
  }
  return results;
}
