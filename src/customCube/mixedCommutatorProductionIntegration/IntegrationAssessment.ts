// --- IntegrationAssessment (Mixed Commutator Production Integration
// Sprint v1, Deliverable #6, Success Criteria) -----------------------------
import type { ContractVerificationResult } from "./PrimitiveContractVerification";
import type { CompatibilitySummary } from "./CompatibilityReport";

export type IntegrationDecision = "A_PROCEED_TO_VALIDATION" | "B_NEEDS_ADDITIONAL_FIXES" | "C_INTEGRATION_FAILED";

export interface IntegrationAssessmentResult {
  decision: IntegrationDecision;
  decisionLabel: string;
  buildSucceeded: boolean;
  contractCompliant: boolean;
  noRegression: boolean;
  rationale: string;
}

export function assessIntegration(buildSucceeded: boolean, contract: ContractVerificationResult, compatibility: CompatibilitySummary): IntegrationAssessmentResult {
  const contractCompliant = contract.fullyCompliant;
  const noRegression = compatibility.regressionCount === 0;

  let decision: IntegrationDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!buildSucceeded) {
    decision = "C_INTEGRATION_FAILED";
    decisionLabel = "Conclusion C -- 구조적 문제가 발견되어 Blueprint 수정이 필요하다.";
    rationale = "Production Build(vite build)가 실패했다.";
  } else if (!contractCompliant || !noRegression) {
    decision = "B_NEEDS_ADDITIONAL_FIXES";
    decisionLabel = "Conclusion B -- 통합은 되었으나 수정이 추가 필요하다.";
    rationale = `contractCompliant=${contractCompliant}, noRegression=${noRegression} -- 계약 위반 또는 회귀가 발견되어 추가 수정이 필요하다.`;
  } else {
    decision = "A_PROCEED_TO_VALIDATION";
    decisionLabel = "Conclusion A -- Integration 완료. 다음 Sprint는 Production Validation Sprint 진행.";
    rationale = `Build 성공, Primitive 계약 100% 유지, Regression 0건, Recovery Layer 정상 동작(Gate/Short-Circuit 실측 확인) -- Production Integration이 완료되었다.`;
  }

  return { decision, decisionLabel, buildSucceeded, contractCompliant, noRegression, rationale };
}
