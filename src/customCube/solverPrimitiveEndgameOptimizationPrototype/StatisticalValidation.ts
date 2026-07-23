// --- StatisticalValidation (ENDGAME Optimization Prototype Sprint v1,
// STEP6) ------------------------------------------------------------------
// Standard Evaluation Protocol (paired-diff 95% CI + Cohen's d_z), reused
// read-only across every Sprint in this research arc, applied here across
// N>=30 independently-run TRIALS for BOTH candidate arms (Reserved Slice,
// Absorb) against the same Baseline arm.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { TrialAggregate, ArmAggregate } from "./ThreeArmBenchmark";

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

export interface ArmEvaluation {
  primary: MetricEvaluation; // whole-cube-improved count diff (candidate - baseline)
  secondary: MetricEvaluation; // whole-cube-solved count diff
  runtime: MetricEvaluation; // avg wall ms diff
  deadlineMiss: MetricEvaluation; // deadline miss rate diff, in pp
}

export interface StatisticalValidationResult {
  nTrials: number;
  reservedSlice: ArmEvaluation;
  absorb: ArmEvaluation;
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

function evaluateArm(baselines: readonly ArmAggregate[], candidates: readonly ArmAggregate[]): ArmEvaluation {
  return {
    primary: evaluate(candidates.map((c, i) => c.improvedCount - baselines[i].improvedCount)),
    secondary: evaluate(candidates.map((c, i) => c.solvedCount - baselines[i].solvedCount)),
    runtime: evaluate(candidates.map((c, i) => c.avgWallMs - baselines[i].avgWallMs)),
    deadlineMiss: evaluate(candidates.map((c, i) => (c.deadlineMissRate - baselines[i].deadlineMissRate) * 100)),
  };
}

export function runStatisticalValidation(trials: readonly TrialAggregate[]): StatisticalValidationResult {
  const baselines = trials.map((t) => t.baseline);
  return {
    nTrials: trials.length,
    reservedSlice: evaluateArm(
      baselines,
      trials.map((t) => t.reservedSlice)
    ),
    absorb: evaluateArm(
      baselines,
      trials.map((t) => t.absorb)
    ),
  };
}
