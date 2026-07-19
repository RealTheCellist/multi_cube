// --- RequiredSampleSize (Solver Primitive Evaluation Stabilization Sprint
// v2) -- STEP2: given the effect size STEP1 measured, computes the Run
// count required for a target Power/alpha using the standard closed-form
// one-sample (paired) test sample-size formula:
//   n = ((z_{alpha/2} + z_{beta}) / d)^2
// and, in the other direction, the achieved Power at a given n:
//   power = Phi(|d| * sqrt(n) - z_{alpha/2})
// where Phi is the standard normal CDF (Abramowitz & Stegun 26.2.17
// approximation, ~1e-7 max error -- disclosed as an approximation, not
// exact; adequate for the n this Sprint compares, which are all small
// enough that the normal/z approximation to the t-distribution is a
// disclosed, acceptable simplification consistent with StatsUtil.ts's
// own CI already using the same approximation).
const Z_ALPHA_2_05 = 1.959964; // two-sided z for alpha=0.05
const Z_BETA_80 = 0.841621; // z for power=80%

function normalCDF(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228; // 1/sqrt(2*pi)
  if (x >= 0) {
    const t = 1 / (1 + p * x);
    return 1 - c * Math.exp((-x * x) / 2) * t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  }
  return 1 - normalCDF(-x);
}

export interface RequiredSampleSizeResult {
  cohensD: number;
  alpha: number;
  targetPower: number;
  requiredN: number; // ceil of the closed-form formula
}

export function computeRequiredSampleSize(cohensD: number, alpha: number = 0.05, targetPower: number = 0.8): RequiredSampleSizeResult {
  if (alpha !== 0.05 || targetPower !== 0.8) {
    // This Sprint only hardcodes the z-values for the work order's own
    // stated targets (alpha=0.05, Power=80%) -- other targets would need
    // their own z-lookup, disclosed as an unimplemented case rather than
    // silently returning a wrong number.
    throw new Error(`computeRequiredSampleSize only supports alpha=0.05/targetPower=0.8 in this Sprint (got alpha=${alpha}, power=${targetPower})`);
  }
  const d = Math.abs(cohensD) || 1e-6; // avoid divide-by-zero; a near-zero effect size correctly yields an enormous required N
  const requiredN = Math.ceil(((Z_ALPHA_2_05 + Z_BETA_80) / d) ** 2);
  return { cohensD, alpha, targetPower, requiredN };
}

export interface AchievedPowerRow {
  n: number;
  achievedPower: number; // 0..1
  meetsPowerTarget: boolean; // achievedPower >= 0.8
}

export function computeAchievedPowerTable(cohensD: number, ns: readonly number[], alpha: number = 0.05): AchievedPowerRow[] {
  if (alpha !== 0.05) throw new Error(`computeAchievedPowerTable only supports alpha=0.05 in this Sprint (got ${alpha})`);
  const d = Math.abs(cohensD);
  return ns.map((n) => {
    const achievedPower = normalCDF(d * Math.sqrt(n) - Z_ALPHA_2_05);
    return { n, achievedPower, meetsPowerTarget: achievedPower >= 0.8 };
  });
}
