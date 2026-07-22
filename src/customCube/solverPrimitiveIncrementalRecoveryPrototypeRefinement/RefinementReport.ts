// --- RefinementReport (Incremental Recovery Prototype Refinement Sprint
// v1) -------------------------------------------------------------------
// STEP6/Decision. Reuses computeStats (Solver Primitive Evaluation
// Stabilization Sprint v1) and analyzeEffectSize (Stabilization Sprint v2)
// -- both EXISTING, unmodified -- for the paired-diff 95% CI / Cohen's d /
// variance this Sprint's own work order requires, rather than inventing a
// new statistic.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";

export interface StatisticalEvaluation {
  n: number;
  pairedDiffStats: SampleStats; // per-run (refinement's whole-cube-improved count - prototypeV1's whole-cube-improved count)
  effectSize: EffectSizeResult;
  ciExcludesZero: boolean;
}

export function evaluateStatistics(perRunRefinementImprovedCount: readonly number[], perRunPrototypeV1ImprovedCount: readonly number[]): StatisticalEvaluation {
  const n = Math.min(perRunRefinementImprovedCount.length, perRunPrototypeV1ImprovedCount.length);
  const diffs: number[] = [];
  for (let i = 0; i < n; i++) diffs.push(perRunRefinementImprovedCount[i] - perRunPrototypeV1ImprovedCount[i]);
  const pairedDiffStats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: pairedDiffStats.mean, stddevDiff: pairedDiffStats.stddev, n });
  return { n, pairedDiffStats, effectSize, ciExcludesZero: pairedDiffStats.ciLower > 0 };
}

export type RefinementDecision = "A" | "B" | "C";

export interface RefinementLevelResult {
  level1Pass: boolean; // Budget Overrun significantly reduced
  level2Pass: boolean; // Duplicate Invocation reduced, Regression 0
  level3Pass: boolean; // Task-level Capability is a reproducible evaluation metric (paired-diff CI excludes zero OR consistent effect size)
  decision: RefinementDecision;
}

export function decideRefinement(
  baselineOverrunRate: number,
  refinedOverrunRate: number,
  duplicateBefore: number,
  duplicateAfter: number,
  regressionCount: number,
  stats: StatisticalEvaluation,
): RefinementLevelResult {
  const level1Pass = refinedOverrunRate < baselineOverrunRate * 0.5; // "significantly" reduced -- at least halved
  const level2Pass = duplicateAfter < duplicateBefore && regressionCount === 0;
  const level3Pass = stats.ciExcludesZero || Math.abs(stats.effectSize.cohensD) >= 0.5; // CI excludes zero OR at least a medium, consistent effect size

  let decision: RefinementDecision;
  if (level1Pass && level2Pass && level3Pass) decision = "A";
  else if (!level1Pass && !level2Pass) decision = "C";
  else decision = "B";

  return { level1Pass, level2Pass, level3Pass, decision };
}
