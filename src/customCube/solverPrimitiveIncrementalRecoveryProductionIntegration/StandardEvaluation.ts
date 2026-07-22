// --- StandardEvaluation (Incremental Recovery Production Integration
// Sprint v1, STEP5) ----------------------------------------------------------
// Standard Evaluation Protocol (paired-diff 95% CI + Cohen's d_z), reused
// read-only, applied across N>=30 independently-run TRIALS (not repeated
// per-case measurements, unlike the deterministic bfsMoveWingToPosition-
// level Sprints -- real solve() is genuinely stochastic via shuffle(), see
// EndToEndBenchmark.ts's own header) -- matching this whole research arc's
// original N=15->30 repeated-whole-dataset-run protocol (Prototype Sprint
// v1, Refinement Sprint v1) rather than the newer per-case population
// protocol (Architecture Prototype/Refinement Sprints), since this Sprint's
// unit of randomness is the WHOLE solve() call, not a single deterministic
// BFS.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { TrialAggregate } from "./EndToEndBenchmark";

export interface MetricEvaluation {
  stats: SampleStats; // of the per-trial (candidate - baseline) diff
  effectSize: EffectSizeResult;
}

export interface StandardEvaluationResult {
  nTrials: number;
  primary: MetricEvaluation; // whole-cube-improved count diff (candidate - baseline)
  secondary: MetricEvaluation; // whole-cube-solved count diff
  integrationRuntime: MetricEvaluation; // avg wall ms diff
  integrationDeadlineMiss: MetricEvaluation; // deadline miss rate diff (as a fraction, x100 for pp)
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

export function runStandardEvaluation(trials: readonly TrialAggregate[]): StandardEvaluationResult {
  const improvedDiffs = trials.map((t) => t.candidateImprovedCount - t.baselineImprovedCount);
  const solvedDiffs = trials.map((t) => t.candidateSolvedCount - t.baselineSolvedCount);
  const runtimeDiffs = trials.map((t) => t.candidateAvgWallMs - t.baselineAvgWallMs);
  const deadlineMissDiffs = trials.map((t) => (t.candidateDeadlineMissRate - t.baselineDeadlineMissRate) * 100);

  return {
    nTrials: trials.length,
    primary: evaluate(improvedDiffs),
    secondary: evaluate(solvedDiffs),
    integrationRuntime: evaluate(runtimeDiffs),
    integrationDeadlineMiss: evaluate(deadlineMissDiffs),
  };
}
