// --- ValidationPolicy (Continuous Validation Framework Sprint v1,
// STEP1) --------------------------------------------------------------------
// Standardizes the ad-hoc validation each prior Sprint re-derived by hand
// into a fixed, named policy -- so future runs invoke the SAME checks
// instead of re-deriving methodology per Sprint. Every check cited here
// reuses an already-committed, already-verified module (disclosed reuse,
// no new statistical/measurement logic invented).
export interface ValidationCheckSpec {
  name: string;
  reusedModule: string;
  frequency: "per-run" | "per-run-pair"; // per-run = computed from a single population replay; per-run-pair = compares latest vs a reference run
  passCriterion: string;
}

export const VALIDATION_POLICY_V1: ValidationCheckSpec[] = [
  {
    name: "Regression Validation",
    reusedModule: "solverLongTermReliabilityValidationV1/RegressionTrend.ts + solverPostReleaseValidationFramework/ReleaseGates.ts(evaluateGateA)",
    frequency: "per-run-pair",
    passCriterion: "latest run과 reference run 간 per-case trueRegressionDiff의 95% CI가 0을 초과하지 않음(isNonRegressive) -- 새로 악화된 case가 통계적으로 유의하게 증가하지 않았음.",
  },
  {
    name: "Runtime Validation",
    reusedModule: "solverLongTermReliabilityValidationV1/RuntimeDistribution.ts + solverPostReleaseValidationFramework/ReleaseGates.ts(evaluateGateB)",
    frequency: "per-run-pair",
    passCriterion: "latest run의 p95 runtime이 reference run의 p95 대비 +15% tolerance 이내.",
  },
  {
    name: "Contract Drift Validation",
    reusedModule: "solverLongTermReliabilityValidationV1/ContractStability.ts를 일반화한 ContractDriftMonitor.ts",
    frequency: "per-run",
    passCriterion: "Solver Research Closeout Sprint v1이 Freeze한 8개 Operating Contract 값이 production 코드에서 여전히 동일하게 읽힘 -- 하나라도 다르면 즉시 FAIL.",
  },
  {
    name: "Determinism Spot Check",
    reusedModule: "solverLongTermReliabilityValidationV1/DeterminismAnalysis.ts",
    frequency: "per-run",
    passCriterion: "정기 실행은 아니며(비용이 큼, 케이스당 N회 반복), 이 Sprint의 own STEP1이 정의한 '분기별 표본 점검' 대상으로만 명시 -- 매 Nightly Validation마다 강제하지 않는다(disclosed scope 축소).",
  },
  {
    name: "Release Gate Validation",
    reusedModule: "solverContinuousValidationFrameworkV1/ReleaseGateAutomation.ts (Gate A/B/C + Contract Drift 조합)",
    frequency: "per-run-pair",
    passCriterion: "Regression/Runtime/Capability Gate 전부 PASS 이고 Contract Drift 없음 -- 하나라도 FAIL이면 전체 Release Gate Validation FAIL.",
  },
];
