// --- CompatibilityAudit (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP5) --------------------------------------
// Real, regex-based structural audit of solverPostReleaseValidationFramework/
// ReleaseGates.ts + ChangeClassification.ts (READ ONLY -- this Sprint is
// forbidden from modifying either file) to confirm the MCM Validation
// Protocol can feed both Capability-axis and Product-axis measurements
// into the SAME existing Gate functions without any Framework change.
import * as fs from "fs";

const RELEASE_GATES_PATH = "src/customCube/solverPostReleaseValidationFramework/ReleaseGates.ts";
const CHANGE_CLASSIFICATION_PATH = "src/customCube/solverPostReleaseValidationFramework/ChangeClassification.ts";

export interface GateSignatureCheck {
  gate: "A" | "B" | "C" | "E";
  functionName: string;
  signatureIsGeneric: boolean; // true if the function's own parameter types are generic KpiSnapshot/MetricEvaluation, not hardcoded to a specific measurement path
  evidence: string;
}

export interface CompatibilityAuditResult {
  gateChecks: GateSignatureCheck[];
  allGatesGeneric: boolean;
  categoryCCoversRequiredGates: boolean; // Category C's requiredGates already equals [A,B,C,E], matching this arc's own repeated real usage for MCM-family Sprints
  frameworkModificationRequired: boolean;
  evidenceSummary: string;
}

export function auditCompatibility(): CompatibilityAuditResult {
  const gatesSource = fs.readFileSync(RELEASE_GATES_PATH, "utf-8");
  const classificationSource = fs.readFileSync(CHANGE_CLASSIFICATION_PATH, "utf-8");

  const checkGate = (gate: "A" | "B" | "C" | "E", functionName: string): GateSignatureCheck => {
    const fnMatch = new RegExp(`export function ${functionName}\\(([^)]*)\\)`).exec(gatesSource);
    const params = fnMatch?.[1] ?? "";
    // "generic" = parameter types reference MetricEvaluation/KpiSnapshot (defined
    // in KpiDefinitions.ts, path-agnostic), not any attemptRecovery_direct- or
    // solve_e2e-specific type name.
    const referencesGenericType = /MetricEvaluation|KpiSnapshot/.test(params);
    const referencesPathSpecificType = /AttemptRecoveryProbeResult|SolveE2EProbeResult|EndToEndSolveResult|ReplayOutcome/.test(params);
    return {
      gate,
      functionName,
      signatureIsGeneric: referencesGenericType && !referencesPathSpecificType,
      evidence: `${functionName}(${params.trim()}) -- ${referencesGenericType ? "MetricEvaluation/KpiSnapshot 기반(경로 무관)" : "제네릭 타입 미확인"}${
        referencesPathSpecificType ? ", 특정 측정 경로 타입에 종속됨(위험)" : ""
      }.`,
    };
  };

  const gateChecks: GateSignatureCheck[] = [
    checkGate("A", "evaluateGateA"),
    checkGate("B", "evaluateGateB"),
    checkGate("C", "evaluateGateC"),
    checkGate("E", "evaluateGateE"),
  ];
  const allGatesGeneric = gateChecks.every((c) => c.signatureIsGeneric);

  const categoryCMatch = /category:\s*"C"[\s\S]*?requiredGates:\s*\[([^\]]*)\]/.exec(classificationSource);
  const categoryCGates = (categoryCMatch?.[1] ?? "").replace(/["\s]/g, "").split(",").filter(Boolean).sort();
  const categoryCCoversRequiredGates = JSON.stringify(categoryCGates) === JSON.stringify(["A", "B", "C", "E"]);

  const frameworkModificationRequired = !allGatesGeneric || !categoryCCoversRequiredGates;

  return {
    gateChecks,
    allGatesGeneric,
    categoryCCoversRequiredGates,
    frameworkModificationRequired,
    evidenceSummary: frameworkModificationRequired
      ? "Gate 함수 시그니처 또는 Category C의 requiredGates가 MCM Protocol의 요구(A/B/C/E, 두 축 모두 MetricEvaluation/KpiSnapshot으로 정규화되어 입력 가능)와 어긋난다 -- Framework 수정이 필요할 수 있다."
      : "Gate A/B/C/E 전부 MetricEvaluation/KpiSnapshot 기반 제네릭 시그니처를 사용하므로, Capability Validation(attemptRecovery_direct)과 Product Validation(solve_e2e) 어느 쪽에서 나온 비교 결과든 동일한 함수에 그대로 입력 가능하다. Category C의 requiredGates=[A,B,C,E]는 이미 Directive가 요구한 Gate 목록과 정확히 일치한다 (Short-Circuit/Production Validation Sprint 양쪽 모두 이미 Category C로 분류해 사용한 전례와 일치). Framework 자체 수정 불필요.",
  };
}
