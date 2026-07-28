// --- RecommendationAssessment (Mixed Commutator Opportunity Analysis
// Sprint v1, Deliverable #5 / Success Criteria) ------------------------------
import type { OpportunityLossSummary } from "./OpportunityMatrix";
import type { ShadowEvaluationSummary } from "./ShadowEvaluation";

export type OpportunityDecision = "A_KEEP_GATE" | "B_GATE_REFINEMENT" | "C_RETIRE_PRIMITIVE";

export interface RecommendationResult {
  decision: OpportunityDecision;
  decisionLabel: string;
  opportunityLoss: number;
  potentiallySolvableTotal: number;
  rationale: string;
}

// Disclosed thresholds, fixed before reading the real numbers:
// - "negligible loss" for Conclusion A: <=1 case out of 142 (matches the
//   scale of noise already seen in this population -- a single case is
//   within the range this whole research arc has repeatedly treated as one
//   real, isolated instance rather than a systematic pattern).
// - "negligible even with Gate removed" for Conclusion C: potentially
//   solvable population itself is <=1 case total, meaning the mechanism
//   itself (not the Gate) is the binding constraint.
const NEGLIGIBLE_LOSS_THRESHOLD = 1;
const NEGLIGIBLE_TOTAL_THRESHOLD = 1;

export function assessOpportunity(loss: OpportunityLossSummary, shadowSummary: ShadowEvaluationSummary): RecommendationResult {
  if (shadowSummary.shadowSolvableCount <= NEGLIGIBLE_TOTAL_THRESHOLD) {
    return {
      decision: "C_RETIRE_PRIMITIVE",
      decisionLabel: "Conclusion C -- Gate를 완전히 제거해도 효과가 거의 없다. Mixed Commutator 연구 종료 권장.",
      opportunityLoss: loss.opportunityLoss,
      potentiallySolvableTotal: shadowSummary.shadowSolvableCount,
      rationale: `Gate를 완전히 우회한 Shadow Evaluation에서도 Potentially Solvable=${shadowSummary.shadowSolvableCount}/${shadowSummary.total}건뿐 -- Gate가 아니라 Mechanism 자체의 한계로 판단.`,
    };
  }
  if (loss.opportunityLoss > NEGLIGIBLE_LOSS_THRESHOLD) {
    return {
      decision: "B_GATE_REFINEMENT",
      decisionLabel: "Conclusion B -- Gate가 실제 Capability를 막고 있다. Gate Refinement Sprint 진행 권장.",
      opportunityLoss: loss.opportunityLoss,
      potentiallySolvableTotal: shadowSummary.shadowSolvableCount,
      rationale: `Opportunity Loss=${loss.opportunityLoss}건 (Potentially Solvable=${loss.potentiallySolvable} - Actually Attempted=${loss.actuallyAttempted}) -- Gate가 배제한 상태 중 실제로 개선 가능한 사례가 존재.`,
    };
  }
  return {
    decision: "A_KEEP_GATE",
    decisionLabel: "Conclusion A -- Opportunity Loss가 거의 없다. 현재 Gate 유지.",
    opportunityLoss: loss.opportunityLoss,
    potentiallySolvableTotal: shadowSummary.shadowSolvableCount,
    rationale: `Opportunity Loss=${loss.opportunityLoss}건으로 무시할 수 있는 수준 -- 현재 Gate가 이미 거의 모든 실제 Opportunity를 포착하고 있음.`,
  };
}
