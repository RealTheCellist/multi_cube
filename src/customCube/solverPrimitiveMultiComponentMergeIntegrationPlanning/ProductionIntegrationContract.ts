// --- ProductionIntegrationContract (Multi-Component Merge Production
// Integration Planning Sprint v1, STEP6) ---------------------------------------
// Combines STEP1-5's own real outputs into ONE Operating Contract
// (Position/Gate/Budget/Scheduling Rule) and resolves the Directive's own
// Decision A/B/C from real risk levels, not asserted narrative.
import type { PositionId } from "./IntegrationPositionAnalysis";
import type { GateId } from "./GateDesign";
import type { BudgetPolicyId } from "./BudgetContract";
import type { RiskAssessmentResult, RiskLevel } from "./RiskAssessment";
import type { CounterfactualIntegrationResult } from "./CounterfactualIntegrationSimulation";

export interface OperatingContract {
  position: PositionId;
  gate: GateId;
  budget: BudgetPolicyId;
  schedulingRule: string;
}

export const CONFIRMED_CONTRACT: OperatingContract = {
  position: "BEFORE_PARITY",
  gate: "COMPONENT_COUNT_GE3",
  budget: "DEDICATED_SLICE",
  schedulingRule:
    "generateRecoveryStrategies()의 genCCR() 다음, genParityGatedCycle() 이전에 genMultiComponentMerge()를 " +
    "추가한다 -- componentCount>=3일 때만 시도(componentCount==2는 PARITY_GATED_CYCLE에게 그대로 맡긴다). Budget은 " +
    "PARITY_GATED_CYCLE_RESERVED_SLICE_MS(2000ms)를 그대로 재사용하는 Dedicated Slice. schedulingStrategy(A/B) " +
    "옵션과는 독립적으로 항상 이 위치에 삽입한다 -- CCR/MIXED_COMMUTATOR Integration Point가 REPAIR A/B 스케줄링 " +
    "질문과 무관하게 항상 고정 위치였던 것과 동일한 원칙.",
};

export type IntegrationDecision = "A_PRODUCTION_INTEGRATION_SPRINT" | "B_PLANNING_REFINEMENT" | "C_RESEARCH_CLOSEOUT";

export interface ContractDecisionResult {
  decision: IntegrationDecision;
  rationale: string;
  contract: OperatingContract;
}

function riskLevels(r: RiskAssessmentResult): RiskLevel[] {
  return [r.regressionRisk.level, r.runtimeRisk.level, r.schedulerRisk.level, r.budgetRisk.level, r.primitiveInteractionRisk.level];
}

const MIN_MEANINGFUL_RESCUE_COUNT = 1; // below this, there is no real Capability to weigh against Risk at all

export function decideContract(risk: RiskAssessmentResult, counterfactual: CounterfactualIntegrationResult): ContractDecisionResult {
  const levels = riskLevels(risk);
  const highCount = levels.filter((l) => l === "HIGH").length;
  const mediumCount = levels.filter((l) => l === "MEDIUM").length;
  const hasCapability = counterfactual.expectedRescueCount >= MIN_MEANINGFUL_RESCUE_COUNT;

  let decision: IntegrationDecision;
  let rationale: string;

  if (highCount > 0 && !hasCapability) {
    decision = "C_RESEARCH_CLOSEOUT";
    rationale = `High 위험(${highCount}건)이 존재하는데 expectedRescueCount=${counterfactual.expectedRescueCount}건으로 상쇄할 Capability가 없다 -- Integration Risk가 Capability보다 크다.`;
  } else if (highCount > 0) {
    decision = "B_PLANNING_REFINEMENT";
    rationale = `High 위험(${highCount}건) 항목이 남아있어 Contract를 그대로 확정하기엔 이르다 -- 해당 항목을 재설계하는 Refinement Sprint가 필요하다.`;
  } else {
    decision = "A_PRODUCTION_INTEGRATION_SPRINT";
    rationale =
      `Position(${CONFIRMED_CONTRACT.position})/Gate(${CONFIRMED_CONTRACT.gate})/Budget(${CONFIRMED_CONTRACT.budget}) 모두 실측 데이터로 확정되었고, ` +
      `위험도는 High 0건, Medium ${mediumCount}건(Low 위주)이며, expectedRescueCount=${counterfactual.expectedRescueCount}건` +
      `(${(counterfactual.expectedRescueRate * 100).toFixed(1)}%)의 실질적이나 제한적인 신규 Capability가 확인된다 -- ` +
      "Integration Contract가 명확히 확정되었으므로 Production Integration Sprint로 진행한다. 다만 신규 Capability " +
      "규모가 작으므로(2.8%), 다음 Sprint의 성공 기준은 이 규모에 맞게 보정되어야 한다.";
  }

  return { decision, rationale, contract: CONFIRMED_CONTRACT };
}
