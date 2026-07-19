// --- StatsUtil (Solver Primitive Evaluation Stabilization Sprint v1) -----
// Small shared statistics helper -- sample mean/stddev/coefficient of
// variation/95% confidence interval -- used by every STEP in this Sprint.
// Uses a normal approximation for the CI half-width (1.96 * stddev/sqrt(n))
// rather than the t-distribution: disclosed as a pragmatic choice
// consistent with this project's existing stddev-based variance reporting
// elsewhere (e.g. ReproducibilityCheck.ts's stdDev field) -- with n=5 the
// t-multiplier would be somewhat wider (t=2.78 vs z=1.96), so this CI is
// narrower than a strict small-sample interval would be; treat the
// reported bounds as approximate, not exact.
export interface SampleStats {
  n: number;
  mean: number;
  stddev: number; // sample stddev (n-1 denominator), 0 if n<2
  coefficientOfVariation: number; // stddev/mean, 0 if mean=0
  ci95Half: number;
  ciLower: number;
  ciUpper: number;
}

export function computeStats(values: readonly number[]): SampleStats {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1) : 0;
  const stddev = Math.sqrt(variance);
  const coefficientOfVariation = mean !== 0 ? stddev / mean : 0;
  const ci95Half = n > 0 ? (1.96 * stddev) / Math.sqrt(n) : 0;
  return { n, mean, stddev, coefficientOfVariation, ci95Half, ciLower: mean - ci95Half, ciUpper: mean + ci95Half };
}
