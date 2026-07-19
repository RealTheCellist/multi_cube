// --- EffectSizeAnalysis (Solver Primitive Evaluation Stabilization Sprint
// v2) -- STEP1: quantifies HOW BIG the apparent candidate-vs-baseline
// improvement actually is, using the paired-sample effect size (Cohen's
// d_z = mean(diff)/stddev(diff)) computed from Sprint v1's own reported
// paired-diff statistics for the Refinement Sprint v1 worked example
// (baseline A0 vs candidate A1_wideCycle, N=5, mean=+0.20, stddev=0.45 --
// cited verbatim from solverPrimitiveEvaluationStabilization/data/
// stabilization-v1-report.txt's own STEP3 section, not re-derived, since
// that Sprint's raw per-run array was not persisted to disk, only the
// aggregate statistics). This is a closed-form calculation from already-
// published numbers -- no new Prototype run needed for STEP1 itself
// (STEP3 in this Sprint does the new empirical run).
export interface EffectSizeInput {
  meanDiff: number;
  stddevDiff: number;
  n: number;
}

export type EffectMagnitude = "negligible" | "small" | "medium" | "large";

export interface EffectSizeResult {
  meanDiff: number;
  variance: number; // stddevDiff^2
  standardError: number; // stddevDiff / sqrt(n)
  cohensD: number; // paired-sample d_z = meanDiff / stddevDiff
  magnitude: EffectMagnitude;
}

// Cohen's (1988) conventional thresholds for d -- the standard, most-cited
// reference points for "small/medium/large" in behavioral/applied
// statistics; used here as-is rather than inventing project-specific
// thresholds, since this Sprint's whole point is aligning with an
// established, externally-recognized statistical standard.
const D_SMALL = 0.2;
const D_MEDIUM = 0.5;
const D_LARGE = 0.8;

export function analyzeEffectSize(input: EffectSizeInput): EffectSizeResult {
  const variance = input.stddevDiff ** 2;
  const standardError = input.n > 0 ? input.stddevDiff / Math.sqrt(input.n) : 0;
  const cohensD = input.stddevDiff !== 0 ? input.meanDiff / input.stddevDiff : 0;
  const absD = Math.abs(cohensD);
  const magnitude: EffectMagnitude = absD < D_SMALL ? "negligible" : absD < D_MEDIUM ? "small" : absD < D_LARGE ? "medium" : "large";
  return { meanDiff: input.meanDiff, variance, standardError, cohensD, magnitude };
}

// Sprint v1's own actual reported paired-diff statistics for the
// baseline(A0)/candidate(A1_wideCycle) worked example -- STEP3's
// starting empirical estimate.
export const V1_PAIRED_DIFF: EffectSizeInput = { meanDiff: 0.2, stddevDiff: 0.45, n: 5 };
