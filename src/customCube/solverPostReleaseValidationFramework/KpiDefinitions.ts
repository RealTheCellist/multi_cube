// --- KpiDefinitions (Solver Post-Release Validation Framework Sprint v1,
// STEP2/STEP3) ------------------------------------------------------------
// Formalizes, as reusable typed code, the KPI set and the "Standard
// Evaluation Protocol" statistical standard this whole research arc has
// already used (unstandardized, re-derived per Sprint) since
// solverPrimitiveEvaluationStabilization/StatsUtil.ts +
// EffectSizeAnalysis.ts were first built. Future Sprints should import
// from here instead of re-deriving the same computeStats/analyzeEffectSize
// composition -- this is the ONLY change this Sprint makes to "code": a
// consolidation, not new statistical logic (computeStats/analyzeEffectSize
// themselves are imported unmodified).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";

// The 9 KPIs the Directive's own STEP2 requires, standardized as a single
// snapshot shape. A "Regression Test Suite" run collects one of these per
// arm (Baseline/Candidate) per repeat; MetricEvaluation below is what a
// paired-diff series of these snapshots reduces to.
export interface KpiSnapshot {
  n: number;
  successCount: number; // whole-cube-improved OR recovery-succeeded, whichever the caller's own methodology defines as "success" -- disclosed per-Sprint, not fixed here
  successRate: number;
  improvedCount: number;
  improvedRate: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  falseRegressionCount: number;
  falseRegressionRate: number;
  avgRuntimeMs: number;
  p95RuntimeMs: number;
  deadlineMissCount: number;
  deadlineMissRate: number;
  duplicateCount: number; // same candidate/primitive type offered >1x in one round -- should always be 0
  starvedTypeCount: number; // count of primitive types meeting the Starvation definition (see PrimitiveInteractionMatrix precedent: offered>=5 times AND selectedRate<5%)
}

// Minimum sample size below which a Statistical Validation result cannot
// be used as a Release Gate input (Directive's own "N ≥ 30" recommendation
// for Release-level reproducibility -- Regression Test Suite runs for a
// single Bug Fix (Category A, see ChangeClassification.ts) may use less,
// but nothing that claims Release-level confidence may).
export const MIN_N_FOR_RELEASE_CONFIDENCE = 30;

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
  majorityVoteRate: number; // fraction of paired samples where diff >= 0 -- the Directive's own required "Majority Vote" statistic
}

// The one standardized function every future Sprint's own statistical
// validation should route through, so "Sprint마다 다른 기준을 쓰지
// 않도록" (Directive STEP3) is enforced by code, not convention alone.
export function evaluatePairedDiff(diffs: readonly number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  const majorityVoteRate = diffs.length ? diffs.filter((d) => d >= 0).length / diffs.length : 0;
  return { stats, effectSize, majorityVoteRate };
}

// "Statistically significant improvement, standardized": the one
// definition every prior Sprint in this arc has actually used when
// claiming significance (CI excludes zero on the improving side) --
// codified here so a future Sprint can't silently loosen it to "mean >= 0"
// the way this Sprint's own Solver Release Readiness Validation Sprint v1
// initially did before catching and disclosing it.
export function isSignificantImprovement(evaluation: MetricEvaluation): boolean {
  return evaluation.stats.ciLower > 0;
}

// "Directionally non-regressive, standardized": for a diff (Candidate -
// Baseline) on a metric where a POSITIVE diff means "got worse" (e.g.
// Regression count, Deadline Miss rate), non-regressive means the CI does
// NOT show a statistically significant increase -- i.e. the CI's lower
// bound does not itself sit above zero.
export function isNonRegressive(evaluation: MetricEvaluation): boolean {
  return evaluation.stats.ciLower <= 0;
}
