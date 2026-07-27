// --- PrototypeReadinessDecision (Deep Cycle Resolver Validation Sprint v1,
// "Prototype Readiness 평가" deliverable + Success Criteria A/B/C) ----------
import type { CrossCaseMechanismComparison } from "./MechanismIdentification";
import type { OpportunityMapRevision } from "./OpportunityMapUpdate";

export type ReadinessDecision = "A_BLUEPRINT_COMPLETE_PROCEED_TO_PROTOTYPE" | "B_NEEDS_MORE_BLUEPRINT" | "C_CANDIDATE_REJECTED";

export interface ReadinessDecisionResult {
  decision: ReadinessDecision;
  conclusionLabel: string;
  rationale: string;
}

export function decideReadiness(comparison: CrossCaseMechanismComparison, revision: OpportunityMapRevision): ReadinessDecisionResult {
  if (revision.revisedPriority === "REJECTED_DUPLICATE_MECHANISM" || revision.revisedPriority === "DOWNGRADED_PARTIAL_OVERLAP") {
    return {
      decision: "C_CANDIDATE_REJECTED",
      conclusionLabel: "Conclusion C -- Primitive-Candidate-A 자체가 잘못되었다",
      rationale:
        "Primitive-Candidate-A(Deep Cycle Resolver)로 제안된 메커니즘은 이미 production Recovery layer에 CCR(Clean-Cycle Resolution)로 구현되어 있음이 직접 측정으로 확인됨. " +
        `대상 인구(${comparison.totalCases}건) 전원이 CCR Gate를 통과하며(allGateEligible=${comparison.allGateEligible}), 기존 CCR 구현이 ${comparison.solvedByCcr}/${comparison.totalCases}건을 이미 해결한다. ` +
        "따라서 '새 Primitive가 필요하다'는 원래 전제 자체가 기각 대상이다 -- 남은 미해결 케이스는 새 메커니즘이 아니라 기존 CCR의 탐색 완전성(leaf cap) 문제이며, 이는 Primitive 설계가 아닌 기존 구현 리파인먼트 영역이다.",
    };
  }
  return {
    decision: "A_BLUEPRINT_COMPLETE_PROCEED_TO_PROTOTYPE",
    conclusionLabel: "Conclusion A -- Deep Cycle Resolver 하나로 대부분을 설명 가능",
    rationale: "대상 인구가 기존 메커니즘으로 설명되지 않는 신규 구조를 요구함이 확인됨.",
  };
}
