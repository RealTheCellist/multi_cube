// --- OpportunityMapUpdate (Deep Cycle Resolver Validation Sprint v1,
// "Primitive Opportunity Map 갱신" deliverable) ------------------------------
// Revises State Taxonomy Sprint v2's Primitive-Candidate-A entry
// ("Deep Cycle Resolver") in light of this Sprint's direct measurement:
// the target mechanism already exists in production as CCR
// (Clean-Cycle Resolution, solverPrimitiveCCRPrototype/CCRPrototype.ts,
// wired into fiveByFiveEdgeRecovery.ts's genCCR) -- Primitive-Candidate-A
// was proposed without that cross-reference (State Taxonomy v2 cited
// BoundedResolver.ts/BP-1 as prior art, not CCR, which post-dates it).
import type { CrossCaseMechanismComparison } from "./MechanismIdentification";

export interface OpportunityMapRevision {
  candidateId: string;
  originalTarget: string;
  originalCaseCount: number;
  revisedPriority: "REJECTED_DUPLICATE_MECHANISM" | "DOWNGRADED_PARTIAL_OVERLAP" | "CONFIRMED_NOVEL";
  rationale: string;
  redirectRecommendation: string;
}

export function buildOpportunityMapRevision(comparison: CrossCaseMechanismComparison): OpportunityMapRevision {
  const fullyDuplicated = comparison.verdict === "SAME_EXISTING_MECHANISM_SUFFICIENT";
  const partialOverlap = comparison.verdict === "SAME_EXISTING_MECHANISM_INCOMPLETE";

  return {
    candidateId: "Primitive-Candidate-A",
    originalTarget: "Cycle Isolation / Pure Structural Isolation (State Taxonomy Sprint v2)",
    originalCaseCount: comparison.totalCases,
    revisedPriority: fullyDuplicated ? "REJECTED_DUPLICATE_MECHANISM" : partialOverlap ? "DOWNGRADED_PARTIAL_OVERLAP" : "CONFIRMED_NOVEL",
    rationale: partialOverlap
      ? `이번 Sprint의 직접 측정 결과, Primitive-Candidate-A가 겨냥한 구조(cycleLength 5~6, conflictEdgeCount=0, componentCount=1)는 이미 production에 통합된 CCR(Clean-Cycle Resolution)의 Gate 정의와 정확히 일치한다. Gate 통과율 ${comparison.allGateEligible ? "100%" : "부분적"}, 실제 해결률 ${comparison.solvedByCcr}/${comparison.totalCases}. 미해결 ${comparison.unsolvedLabels.length}건은 메커니즘 부재가 아니라 기존 CCR 구현의 leaf cap(MAX_LEAVES_EXPLORED=64) 한계로 실측 확인됨 -- '새 Primitive'가 아니라 '기존 Primitive의 탐색 완전성 개선' 문제.`
      : `Gate 통과 및 실제 해결률: ${comparison.solvedByCcr}/${comparison.totalCases}.`,
    redirectRecommendation: partialOverlap
      ? "Primitive-Candidate-A를 신규 Primitive 설계 트랙에서 제거하고, 'CCR 탐색 완전성 개선(leaf cap 확장/후보 정렬 휴리스틱)'이라는 별도의 기존-Primitive 리파인먼트 트랙으로 재분류할 것을 권장. 이는 이번 Sprint의 권한 범위(신규 Primitive/Prototype 구현 금지) 밖이므로 향후 별도 Sprint가 필요."
      : "추가 조치 불필요.",
  };
}
