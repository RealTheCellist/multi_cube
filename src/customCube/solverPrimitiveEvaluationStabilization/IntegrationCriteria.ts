// --- IntegrationCriteria (Solver Primitive Evaluation Stabilization
// Sprint v1) -- STEP4: replaces the naive "GapRescue >= 3" integer bar
// (used unmodified since Prototype Sprint v2) with a criterion grounded
// in STEP1~3's own measurements, and applies this Sprint's own Level 1~3
// success criteria to decide whether the new procedure is ready to hand
// back to future Prototype Sprints.
//   Level 1: Gap 평가의 변동성을 정량화한다 -- PASS if every stat this
//     Sprint computed is a well-defined finite number (not NaN/degenerate)
//     over enough independent runs (n>=3) to mean anything.
//   Level 2: 재현 가능한 Evaluation 기준을 제안한다 -- PASS whenever
//     Level 1 passes: the criterion (Majority Vote classification +
//     paired-diff 95% CI) is well-posed and computable regardless of what
//     the specific numbers turn out to be.
//   Level 3: 표준 Evaluation 절차를 확정한다 -- PASS only if applying
//     that procedure to the concrete worked example (A0 vs A1_wideCycle)
//     actually resolves the ambiguity Refinement Sprint v1 was left
//     with (A,A,B) -- i.e. the paired-diff CI excludes zero (a clear
//     signal either way) rather than straddling it (still inconclusive
//     even under the new procedure, which is itself a legitimate,
//     disclosable outcome -- not a bug in the procedure).
import type { GapClassificationComparison } from "./GapClassificationMethods";
import type { PrimitiveVarianceEntry } from "./PrimitiveVarianceAnalysis";
import type { GapRescueCIResult } from "./GapRescueConfidenceInterval";

export type FinalDecision = "A" | "B" | "C";

export interface StabilizationOutcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  recommendedCriterion: string;
}

// Disclosed threshold: a Primitive whose own success/failure classification
// has stddev bigger than 1.5x its mean (CV > 1.5) is unstable enough that
// no amount of averaging within this Sprint's N=5 budget can be trusted --
// that would mean the whole evaluation framework, not just the threshold
// number, needs redesign (decision C), not just more runs (decision B).
const EXTREME_CV_THRESHOLD = 1.5;

export function decideOutcome(gapClassification: GapClassificationComparison, primitiveVariance: readonly PrimitiveVarianceEntry[], gapRescueCI: GapRescueCIResult): StabilizationOutcome {
  const recommendedCriterion =
    "Gap 판정은 Majority Vote(N=5, 과반수)로 안정화하고, 두 변형 비교는 동일 Run에서 짝지은(paired) GapRescue 차이의 평균과 95% 신뢰구간을 함께 보고한다 -- '건수 >= 고정 threshold' 대신 'paired-diff CI 하한이 0을 초과해야 통계적으로 유의미한 개선'을 Integration 판단 기준으로 채택한다.";

  const allStats = [gapClassification.confidenceInterval, gapRescueCI.baselineStats, gapRescueCI.candidateStats, gapRescueCI.pairedDiffStats];
  const allStatsFinite = allStats.every((s) => Number.isFinite(s.mean) && Number.isFinite(s.ciLower) && Number.isFinite(s.ciUpper));
  const worstCV = Math.max(...primitiveVariance.map((p) => p.stats.coefficientOfVariation));

  const level1Pass = allStatsFinite && gapRescueCI.pairedDiffStats.n >= 3;

  if (!level1Pass || worstCV > EXTREME_CV_THRESHOLD) {
    return {
      decision: "C",
      rationale: !level1Pass
        ? `Run 수(${gapRescueCI.pairedDiffStats.n})가 부족하거나 통계량이 정의되지 않아(NaN/degenerate) 변동성 자체를 정량화하지 못했다 -- 평가 체계를 재설계해야 한다.`
        : `Primitive 중 하나 이상이 변동계수(CV)=${worstCV.toFixed(2)}로 기준(${EXTREME_CV_THRESHOLD})을 초과했다 -- 단순 다회 평균으로는 신뢰할 수 없을 만큼 불안정하다. 평가 체계 자체를 재설계해야 한다.`,
      level1Pass,
      level2Pass: false,
      level3Pass: false,
      recommendedCriterion,
    };
  }

  const level2Pass = true; // Level1 PASS means the criterion is well-posed and computable, independent of the outcome below

  const unambiguousMean = Math.abs(gapRescueCI.pairedDiffStats.mean) < 1e-9;
  const level3Pass = gapRescueCI.pairedDiffCIExcludesZero || unambiguousMean;

  const gapNote = `Gap 분류 방법 비교: Single Run Gap Total=${gapClassification.singleRunGapTotal}, Majority Vote=${gapClassification.majorityVoteGapTotal}, N회 평균(soft)=${gapClassification.softAverageGapTotal.toFixed(1)}, Run간 95% CI=[${gapClassification.confidenceInterval.ciLower.toFixed(1)}, ${gapClassification.confidenceInterval.ciUpper.toFixed(1)}], Single↔Majority Jaccard=${(gapClassification.singleVsMajorityJaccard * 100).toFixed(1)}%.`;
  const varianceNote = `Primitive별 변동계수: ${primitiveVariance.map((p) => `${p.primitive}=${p.stats.coefficientOfVariation.toFixed(2)}(flipRate ${(p.flipRate * 100).toFixed(1)}%)`).join(", ")}.`;
  const pairedNote = `GapRescue paired-diff(A1_wideCycle - baseline): 평균=${gapRescueCI.pairedDiffStats.mean.toFixed(2)}, 95% CI=[${gapRescueCI.pairedDiffStats.ciLower.toFixed(2)}, ${gapRescueCI.pairedDiffStats.ciUpper.toFixed(2)}].`;

  if (level3Pass) {
    return {
      decision: "A",
      rationale: `${gapNote} ${varianceNote} ${pairedNote} 새 기준(paired-diff CI)이 명확한 결론을 내렸다(CI가 0을 배제) -- 평가 체계를 확정한다.`,
      level1Pass,
      level2Pass,
      level3Pass,
      recommendedCriterion,
    };
  }

  return {
    decision: "B",
    rationale: `${gapNote} ${varianceNote} ${pairedNote} 새 기준(paired-diff CI)을 적용해도 이번 N=${gapRescueCI.pairedDiffStats.n}회로는 0을 배제하지 못해 A1_wideCycle이 baseline보다 통계적으로 유의미하게 낫다고 아직 결론 내릴 수 없다 -- 절차 자체는 정의되었으나(Level1/2 PASS) 이번 표본으로는 확정하지 못했다(Level3 FAIL). Run 수를 늘리거나 다른 안정화 기법을 추가로 검토해야 한다.`,
    level1Pass,
    level2Pass,
    level3Pass,
    recommendedCriterion,
  };
}
