// --- StatisticalSummary (Mixed Commutator Production Validation Sprint
// v2, RQ-1) -----------------------------------------------------------------
// Reuses this research arc's own established Standard Evaluation Protocol
// UNMODIFIED (solverPrimitiveEvaluationStabilization/StatsUtil.ts +
// EffectSizeAnalysis.ts).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { CaseMeasurement } from "./CaseMeasurement";

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

/** Improved Rate: does the chosen candidate for this case-repeat actually
 * make progress (wrongWingAfter < wrongWingBefore)? One "trial" = one
 * repeat index across the whole population; diff = Integrated(Gate C)
 * improved-count - Baseline(Gate A) improved-count for that repeat. */
export function improvedRateEvaluation(cases: readonly CaseMeasurement[], nRepeats: number): MetricEvaluation {
  const diffsByRepeat: number[] = [];
  for (let r = 0; r < nRepeats; r++) {
    let integratedImproved = 0;
    let baselineImproved = 0;
    for (const c of cases) {
      const row = c.perRepeat[r];
      if (row.integratedWrongWingAfter !== null && row.integratedWrongWingAfter < c.wrongWingBefore) integratedImproved++;
      if (row.baselineWrongWingAfter !== null && row.baselineWrongWingAfter < c.wrongWingBefore) baselineImproved++;
    }
    diffsByRepeat.push(integratedImproved - baselineImproved);
  }
  return evaluate(diffsByRepeat);
}

/** Positive = Integrated(Gate C) worse on average. */
export function wrongWingGapEvaluation(cases: readonly CaseMeasurement[], nRepeats: number): MetricEvaluation {
  const diffsByRepeat: number[] = [];
  for (let r = 0; r < nRepeats; r++) {
    const integratedVals = cases.map((c) => c.perRepeat[r].integratedWrongWingAfter ?? c.wrongWingBefore);
    const baselineVals = cases.map((c) => c.perRepeat[r].baselineWrongWingAfter ?? c.wrongWingBefore);
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
    diffsByRepeat.push(mean(integratedVals) - mean(baselineVals));
  }
  return evaluate(diffsByRepeat);
}
