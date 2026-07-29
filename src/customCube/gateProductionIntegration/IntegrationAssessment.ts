// --- IntegrationAssessment (Gate Production Integration Sprint v1,
// Deliverable "Integration Assessment", Success Criteria) --------------------
import type { ContractVerificationResult } from "./PrimitiveContractVerification";
import type { CompatibilitySummary } from "./CompatibilityReport";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";

export type IntegrationDecision = "A_INTEGRATION_COMPLETE" | "B_NEEDS_REFINEMENT" | "C_ROLLBACK";

export interface IntegrationAssessmentResult {
  decision: IntegrationDecision;
  decisionLabel: string;
  buildSucceeded: boolean;
  contractCompliant: boolean;
  noRegression: boolean;
  runtimeNormal: boolean;
  gateActivated: boolean;
  rationale: string;
}

// Disclosed threshold: Mixed Commutator's own reserved slice is 300ms, so a
// normal generation call (with Mixed eligible) should stay within a small
// margin of that; this only flags something abnormal.
const RUNTIME_NORMAL_MAX_MEAN_MS = 400;

export function assessIntegration(buildSucceeded: boolean, contract: ContractVerificationResult, compatibility: CompatibilitySummary, runtime: SampleStats, trueRegressionCount: number): IntegrationAssessmentResult {
  const contractCompliant = contract.fullyCompliant;
  const noRegression = trueRegressionCount === 0;
  const runtimeNormal = runtime.mean <= RUNTIME_NORMAL_MAX_MEAN_MS;
  const gateActivated = compatibility.gateGeneratedCount > 0;

  let decision: IntegrationDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!buildSucceeded || !noRegression) {
    decision = "C_ROLLBACK";
    decisionLabel = "Conclusion C -- Gate 적용 실패 또는 Regression 발생. Rollback 권고.";
    rationale = `buildSucceeded=${buildSucceeded}, noRegression=${noRegression} (trueRegressionCount=${trueRegressionCount}, single-pass regressionCount=${compatibility.regressionCount}) -- 실패 조건 충족.`;
  } else if (!contractCompliant || !runtimeNormal || !gateActivated) {
    decision = "B_NEEDS_REFINEMENT";
    decisionLabel = "Conclusion B -- 기능은 동작하지만 계약/Runtime/Gate 활성화 문제 존재. Refinement 필요.";
    rationale = `contractCompliant=${contractCompliant}, runtimeNormal=${runtimeNormal} (mean=${runtime.mean.toFixed(1)}ms), gateActivated=${gateActivated} (generatedCount=${compatibility.gateGeneratedCount}) -- 하나 이상 미충족.`;
  } else {
    decision = "A_INTEGRATION_COMPLETE";
    decisionLabel = "Conclusion A -- Production Gate 교체 완료. Integration 완료.";
    rationale = `Build 성공, Primitive 계약 100% 유지, Regression 0건, Runtime 정상(mean=${runtime.mean.toFixed(1)}ms), Gate C 실제 활성화 확인(generated=${compatibility.gateGeneratedCount}) -- Gate Production Integration이 완료되었다.`;
  }

  return { decision, decisionLabel, buildSucceeded, contractCompliant, noRegression, runtimeNormal, gateActivated, rationale };
}
