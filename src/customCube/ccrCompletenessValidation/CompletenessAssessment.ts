// --- CompletenessAssessment (CCR Completeness Validation Sprint v1,
// Deliverable #4/#5 + Success Criteria A/B/C) -------------------------------
import type { CompletenessMatrixSummary } from "./CompletenessMatrix";
import type { TerminationTally } from "./CompletenessMatrix";
import type { LeafCapImpactSummary } from "./LeafCapImpactAnalysis";

export type AssessmentConclusion = "A_SUFFICIENTLY_COMPLETE" | "B_LEAF_CAP_IS_BOTTLENECK" | "C_STRUCTURAL_ISSUE_BEYOND_LEAF_CAP";
export type Recommendation = "MAINTAIN" | "PARAMETER_REFINEMENT" | "ARCHITECTURAL_CHANGE";

export interface CompletenessAssessmentResult {
  conclusion: AssessmentConclusion;
  conclusionLabel: string;
  recommendation: Recommendation;
  rationale: string;
}

// A meaningful-impact threshold, not zero-tolerance: a single stray
// leaf-cap or budget-expired case out of 60 wouldn't justify a
// architecture-level conclusion. Matches this whole research arc's own
// convention of requiring a clearly non-trivial share before treating a
// population effect as a real, actionable signal (e.g. Recovery Necessity
// Validation Sprint's own 2.1% vs 64.8% distinction).
const MEANINGFUL_SHARE_THRESHOLD = 0.05;

export function assessCompleteness(matrix: CompletenessMatrixSummary, terminationTally: TerminationTally, leafCapImpact: LeafCapImpactSummary): CompletenessAssessmentResult {
  const leafCapShare = matrix.gatePassed ? terminationTally.LEAF_CAP_REACHED / matrix.gatePassed : 0;
  const budgetExpiredShare = matrix.gatePassed ? terminationTally.BUDGET_EXPIRED / matrix.gatePassed : 0;

  if (leafCapShare < MEANINGFUL_SHARE_THRESHOLD && budgetExpiredShare < MEANINGFUL_SHARE_THRESHOLD) {
    return {
      conclusion: "A_SUFFICIENTLY_COMPLETE",
      conclusionLabel: "Conclusion A -- CCR은 현재 구조에서 충분히 Complete하다",
      recommendation: "MAINTAIN",
      rationale: `Gate 통과 ${matrix.gatePassed}건 중 LEAF_CAP_REACHED ${(leafCapShare * 100).toFixed(1)}%, BUDGET_EXPIRED ${(budgetExpiredShare * 100).toFixed(
        1
      )}% -- 둘 다 유의미한 임계치(${(MEANINGFUL_SHARE_THRESHOLD * 100).toFixed(0)}%) 미만. 대부분의 케이스가 SOLUTION_FOUND 또는 SEARCH_EXHAUSTED로 정상 종료됨.`,
    };
  }

  if (leafCapShare >= budgetExpiredShare) {
    return {
      conclusion: "B_LEAF_CAP_IS_BOTTLENECK",
      conclusionLabel: "Conclusion B -- Leaf Cap이 실제 병목이다",
      recommendation: "PARAMETER_REFINEMENT",
      rationale: `Gate 통과 ${matrix.gatePassed}건 중 ${terminationTally.LEAF_CAP_REACHED}건(${(leafCapShare * 100).toFixed(
        1
      )}%)이 LEAF_CAP_REACHED로 종료됨 -- MAX_LEAVES_EXPLORED=64 상한 자체가 지배적 종료 원인. 영향받는 케이스의 평균 추정 탐색공간/leaf cap 비율은 ${leafCapImpact.affectedAvgRatioToLeafCap.toFixed(
        1
      )}배(미영향군 ${leafCapImpact.unaffectedAvgRatioToLeafCap.toFixed(1)}배 대비). Parameter Refinement(leaf cap 확장/후보 정렬 휴리스틱) 대상.`,
    };
  }

  return {
    conclusion: "C_STRUCTURAL_ISSUE_BEYOND_LEAF_CAP",
    conclusionLabel: "Conclusion C -- Leaf Cap이 아니라 구조 자체가 Incomplete하다",
    recommendation: "ARCHITECTURAL_CHANGE",
    rationale: `Gate 통과 ${matrix.gatePassed}건 중 BUDGET_EXPIRED가 LEAF_CAP_REACHED보다 우세(${(budgetExpiredShare * 100).toFixed(1)}% vs ${(leafCapShare * 100).toFixed(
      1
    )}%) -- 병목이 leaf 개수 상한이 아니라 매 hop의 후보 탐색(enumerateWingCandidates) 자체가 시간을 소진하는 구조적 문제. 단순 leaf cap 조정으로는 해결되지 않으며 Architecture Review가 필요.`,
  };
}
