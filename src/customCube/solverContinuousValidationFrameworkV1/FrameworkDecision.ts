// --- FrameworkDecision (Continuous Validation Framework Sprint v1,
// STEP6 / Sprint 종료 판정) --------------------------------------------------
import type { ValidationCheckSpec } from "./ValidationPolicy";
import type { DashboardRow } from "./RegressionDashboard";
import type { ContractDriftMonitorResult } from "./ContractDriftMonitor";
import type { ReleaseGateAutomationResult } from "./ReleaseGateAutomation";

export type FrameworkDecisionType = "A_FRAMEWORK_COMPLETE" | "B_PARTIAL_COVERAGE" | "C_FRAMEWORK_INCOMPLETE";

export interface Level1To4 {
  level1NightlyValidationFrameworkBuilt: boolean;
  level2RegressionDashboardBuilt: boolean;
  level3ContractDriftMonitorBuilt: boolean;
  level4ReleaseGateAutomationApplied: boolean;
}

export interface FrameworkDecisionResult extends Level1To4 {
  decision: FrameworkDecisionType;
  rationale: string;
}

export function evaluateFrameworkDecision(
  policy: readonly ValidationCheckSpec[],
  dashboard: readonly DashboardRow[],
  contractDrift: ContractDriftMonitorResult,
  releaseGate: ReleaseGateAutomationResult
): FrameworkDecisionResult {
  // Level1: Validation Policy defined (5 named checks) AND at least one
  // real Nightly Validation run actually executed (not just designed on
  // paper).
  const level1NightlyValidationFrameworkBuilt = policy.length === 5 && dashboard.length > 0;

  // Level2: Dashboard has accumulated >=3 real runs with trend computation
  // working (regressionCountVsPrevious populated for every row after the
  // first).
  const level2RegressionDashboardBuilt = dashboard.length >= 3 && dashboard.slice(1).every((r) => r.regressionCountVsPrevious !== null);

  // Level3: Contract Drift Monitor actually ran and reports a real status.
  const level3ContractDriftMonitorBuilt = contractDrift.status === "PASS" || contractDrift.status === "FAIL";

  // Level4: Release Gate Automation actually produced a real composed
  // decision (not skipped).
  const level4ReleaseGateAutomationApplied = releaseGate.overallDecision === "PASS" || releaseGate.overallDecision === "FAIL" || releaseGate.overallDecision === "OPEN_QUESTION";

  let decision: FrameworkDecisionType;
  let rationale: string;
  if (level1NightlyValidationFrameworkBuilt && level2RegressionDashboardBuilt && level3ContractDriftMonitorBuilt && level4ReleaseGateAutomationApplied) {
    decision = "A_FRAMEWORK_COMPLETE";
    rationale = `Validation Policy(5개 항목) 정의 + Nightly Validation 실제 실행(${dashboard.length}회) + Regression Dashboard 트렌드 계산 정상 작동 + Contract Drift Monitor 실행(status=${contractDrift.status}) + Release Gate Automation 실행(overallDecision=${releaseGate.overallDecision}) 모두 확인됨 -- Continuous Validation Framework를 공식 완료로 선언한다.`;
  } else if (level1NightlyValidationFrameworkBuilt) {
    decision = "B_PARTIAL_COVERAGE";
    rationale = `Nightly Validation 기본 틀은 갖춰졌으나 Dashboard/Contract Drift Monitor/Release Gate Automation 중 일부가 완전히 작동하지 않는다 -- 보완이 필요하다.`;
  } else {
    decision = "C_FRAMEWORK_INCOMPLETE";
    rationale = `Validation Policy 정의 또는 실제 Nightly Validation 실행 자체가 완료되지 않았다.`;
  }

  return { level1NightlyValidationFrameworkBuilt, level2RegressionDashboardBuilt, level3ContractDriftMonitorBuilt, level4ReleaseGateAutomationApplied, decision, rationale };
}
