// --- StatisticalSummary (Mixed Commutator Production Validation Sprint v1,
// Statistical Analysis section) ----------------------------------------------
// Reuses this research arc's own established Standard Evaluation Protocol
// UNMODIFIED (solverPrimitiveEvaluationStabilization/StatsUtil.ts +
// EffectSizeAnalysis.ts -- paired-diff 95% CI (normal approximation) +
// Cohen's d_z), the exact same statistics module every prior Production
// Integration/Finalization/Validation Sprint in this arc has used.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { CounterfactualRow } from "./RecoveryLayerCounterfactual";

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

/** Real RQ-1 metric: does Recovery's own chosen candidate for this case
 * actually make progress (wrongWingAfter < wrongWingBefore)? This is the
 * correct "did Recovery succeed" criterion at this layer -- a single
 * Recovery candidate is one incremental step, never a full re-solve, so
 * "wrongWingAfter === 0" (see fullySolvedRateEvaluation below) is almost
 * never true regardless of arm and is NOT a meaningful capability signal
 * here. One "trial" = one full pass (repeat index) over every case in a
 * population; diff = Integrated improved-count - Baseline improved-count
 * for that repeat -- matches this whole arc's own TrialAggregate/
 * runStandardEvaluation paired-diff pattern (see
 * productionIntegrationFinalization/StatisticalValidation.ts). */
export function improvedRateEvaluation(rows: readonly CounterfactualRow[], nRepeats: number): MetricEvaluation {
  const diffsByRepeat: number[] = [];
  for (let r = 0; r < nRepeats; r++) {
    const forRepeat = rows.filter((row) => row.repeat === r);
    const integratedImproved = forRepeat.filter((row) => row.integratedWrongWingAfter !== null && row.integratedWrongWingAfter < row.wrongWingBefore).length;
    const baselineImproved = forRepeat.filter((row) => row.baselineWrongWingAfter !== null && row.baselineWrongWingAfter < row.wrongWingBefore).length;
    diffsByRepeat.push(integratedImproved - baselineImproved);
  }
  return evaluate(diffsByRepeat);
}

/** Informational only, NOT used for the Release Assessment: how often a
 * single Recovery candidate alone brings wrongWingCount all the way to 0
 * (very rare from these raw hole states, which typically need a full
 * re-solve, not one Recovery step -- reported for transparency, not as a
 * capability signal). */
export function fullySolvedRateEvaluation(rows: readonly CounterfactualRow[], nRepeats: number): MetricEvaluation {
  const diffsByRepeat: number[] = [];
  for (let r = 0; r < nRepeats; r++) {
    const forRepeat = rows.filter((row) => row.repeat === r);
    const integratedSolved = forRepeat.filter((row) => row.integratedWrongWingAfter === 0).length;
    const baselineSolved = forRepeat.filter((row) => row.baselineWrongWingAfter === 0).length;
    diffsByRepeat.push(integratedSolved - baselineSolved);
  }
  return evaluate(diffsByRepeat);
}

/** Positive = Integrated worse on average (higher wrongWingCount). */
export function wrongWingGapEvaluation(rows: readonly CounterfactualRow[], nRepeats: number): MetricEvaluation {
  const diffsByRepeat: number[] = [];
  for (let r = 0; r < nRepeats; r++) {
    const forRepeat = rows.filter((row) => row.repeat === r);
    const meanIntegrated = forRepeat.reduce((a, row) => a + (row.integratedWrongWingAfter ?? row.wrongWingBefore), 0) / (forRepeat.length || 1);
    const meanBaseline = forRepeat.reduce((a, row) => a + (row.baselineWrongWingAfter ?? row.wrongWingBefore), 0) / (forRepeat.length || 1);
    diffsByRepeat.push(meanIntegrated - meanBaseline);
  }
  return evaluate(diffsByRepeat);
}

/** MIXED_COMMUTATOR's own isolated generation cost (onEvent start->end
 * timestamps, NOT a whole-call diff -- see CounterfactualRow.mixedOwnMs's
 * own comment for why a whole-call diff would be confounded by DISRUPT/
 * SETUP's independent stochastic timing). Only defined for rows where the
 * Gate actually ran (mixedOwnMs !== null); rows where MIXED_COMMUTATOR's
 * own onEvent never fired are excluded, not treated as 0. */
export function mixedOwnGenCostStats(rows: readonly CounterfactualRow[]): SampleStats {
  return computeStats(rows.map((r) => r.mixedOwnMs).filter((v): v is number => v !== null));
}
