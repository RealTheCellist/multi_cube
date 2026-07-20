// --- RefinementV2Decision (Solver Primitive Prototype Refinement Sprint
// v2) -- decides A/B/C using the CONFIRMED Standard Evaluation Protocol
// (paired-diff CI lower bound > 0 = statistically significant
// improvement over baseline A1_wideCycle, Regression 0 required) instead
// of a fixed count threshold.
//   Level 1: Capability가 실제로 확장되었다 -- PASS if at least one
//     candidate's paired-diff CI excludes zero (statistically real
//     improvement) with zero Regression.
//   Level 2: Regression 없이 개선되었다 -- PASS whenever the winning
//     candidate has regressionCount===0 (already required to be eligible
//     for Level1, so this is a direct consequence, not re-derived
//     independently).
//   Level 3: 그 개선이 실질적 비중을 차지한다 -- PASS only if the
//     improvement is not just statistically real but large enough to
//     matter: paired-diff mean >= 20% of baseline's own average
//     GapRescue. A statistically-significant-but-tiny improvement is a
//     real Level1/2 pass but not yet "Capability 확장" worth Integration.
import type { VariantV2Metrics } from "./StandardProtocolEvaluation";

export type FinalDecision = "A" | "B" | "C";

export interface RefinementV2Outcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  bestVariant: VariantV2Metrics | null;
}

const MIN_MEANINGFUL_IMPROVEMENT_RATIO = 0.2; // disclosed bar: an improvement smaller than 20% of baseline's own GapRescue mean is statistically real but too marginal to call "실제로 확장" on its own

export function decideOutcomeV2(baselineMetrics: VariantV2Metrics, candidates: readonly VariantV2Metrics[]): RefinementV2Outcome {
  const allWorse = candidates.every((c) => c.pairedDiffVsBaselineStats.ciUpper < 0);
  if (allWorse) {
    return {
      decision: "C",
      rationale: `모든 신규 변형(${candidates.map((c) => c.variantName).join(", ")})의 paired-diff CI 상한이 0보다 작다 -- baseline(A1_wideCycle)보다 통계적으로 유의미하게 더 나쁘다. cycleLength 추가 확장/탐색 순서 변경 방향의 Capability 확장은 여기서 한계에 도달했다.`,
      level1Pass: false,
      level2Pass: false,
      level3Pass: false,
      bestVariant: null,
    };
  }

  const significant = candidates.filter((c) => c.pairedDiffVsBaselineStats.ciLower > 0 && c.regressionCount === 0);
  const bestVariant = significant.length ? significant.reduce((a, b) => (b.pairedDiffVsBaselineStats.mean > a.pairedDiffVsBaselineStats.mean ? b : a)) : null;

  const level1Pass = !!bestVariant;
  const level2Pass = level1Pass && bestVariant!.regressionCount === 0;
  const improvementRatio = level1Pass && baselineMetrics.gapRescueStats.mean > 0 ? bestVariant!.pairedDiffVsBaselineStats.mean / baselineMetrics.gapRescueStats.mean : 0;
  const level3Pass = level1Pass && improvementRatio >= MIN_MEANINGFUL_IMPROVEMENT_RATIO;

  if (!level1Pass) {
    return {
      decision: "B",
      rationale: `이번 N=${baselineMetrics.gapRescueStats.n}회 실행에서는 baseline(A1_wideCycle) 대비 paired-diff CI가 0을 배제하는 정당한 변형이 없었다(Regression 없는 후보 중 최고: ${candidates.length ? candidates.map((c) => `${c.variantName} 평균diff=${c.pairedDiffVsBaselineStats.mean.toFixed(2)} CI=[${c.pairedDiffVsBaselineStats.ciLower.toFixed(2)}, ${c.pairedDiffVsBaselineStats.ciUpper.toFixed(2)}]`).join(" / ") : "없음"}) -- Run 수를 늘리거나 다른 방향을 추가로 탐색해야 한다.`,
      level1Pass,
      level2Pass: false,
      level3Pass: false,
      bestVariant: null,
    };
  }

  if (!level3Pass) {
    return {
      decision: "B",
      rationale: `"${bestVariant!.variantName}"가 baseline보다 통계적으로 유의미하게 낫다(paired-diff 평균=${bestVariant!.pairedDiffVsBaselineStats.mean.toFixed(2)}, CI=[${bestVariant!.pairedDiffVsBaselineStats.ciLower.toFixed(2)}, ${bestVariant!.pairedDiffVsBaselineStats.ciUpper.toFixed(2)}], Regression 0건). 다만 개선 폭이 baseline 평균 GapRescue(${baselineMetrics.gapRescueStats.mean.toFixed(2)})의 ${(improvementRatio * 100).toFixed(1)}%로 기준(${(MIN_MEANINGFUL_IMPROVEMENT_RATIO * 100).toFixed(0)}%) 미달이라, Integration을 정당화할 만큼 크지 않다 -- 추가 Prototype 보완이 필요하다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      bestVariant,
    };
  }

  return {
    decision: "A",
    rationale: `"${bestVariant!.variantName}"가 baseline(A1_wideCycle) 대비 paired-diff CI=[${bestVariant!.pairedDiffVsBaselineStats.ciLower.toFixed(2)}, ${bestVariant!.pairedDiffVsBaselineStats.ciUpper.toFixed(2)}](0 배제)로 통계적으로 유의미하고, baseline 평균 GapRescue의 ${(improvementRatio * 100).toFixed(1)}%만큼 실질적으로 Capability를 확장했다(Regression 0건) -- Integration 가능.`,
    level1Pass,
    level2Pass,
    level3Pass,
    bestVariant,
  };
}
