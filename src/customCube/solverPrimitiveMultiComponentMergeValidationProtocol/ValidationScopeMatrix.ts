// --- ValidationScopeMatrix (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP1) --------------------------------------
// Formalizes the two-axis Validation Scope that the Validation Methodology
// Qualification Sprint v1 discovered was necessary: no MCM-family
// Validation is complete unless it reports BOTH axes together. This is a
// synthesis of that Sprint's own real, executed findings (Budget Envelope
// Comparison + Sensitivity Analysis + Counterfactual Validation, all real
// attemptRecovery()/solve() executions) -- not a new measurement, since
// STEP1 here is the STANDARD ITSELF, not a fresh replay.
export type ValidationAxis = "CAPABILITY_VALIDATION" | "PRODUCT_VALIDATION";

export interface ValidationScopeRow {
  axis: ValidationAxis;
  path: "attemptRecovery_direct" | "solve_e2e";
  purpose: string;
  budgetRequirement: string;
  evidenceSource: string; // which real Sprint's own execution established this axis's own real behavior
}

export const VALIDATION_SCOPE_MATRIX: ValidationScopeRow[] = [
  {
    axis: "CAPABILITY_VALIDATION",
    path: "attemptRecovery_direct",
    purpose: "Primitive 자체의 Capability(net-improving 여부)를 격리된 조건에서 검증한다 -- 실사용 환경의 primary 파이프라인 경쟁이나 solve()의 고정 outer deadline에 구애받지 않고, Primitive가 '충분한 예산이 주어졌을 때 실제로 이기는가'만 확인한다.",
    budgetRequirement: "호출자 지정 outer deadline >= 검증 대상 Primitive 자신의 RESERVED_SLICE_MS(명목 dedicated budget) -- Validation Methodology Qualification Sprint v1의 STEP3가 실측으로 확인한 대로, 이 조건이 충족되지 않으면 Primitive의 실제 효과도 이 축에서 가려질 수 있다 (예: outer=1000ms조차도 MCM 두 known-effect case에서는 이미 충분했지만, 이는 케이스별로 달라질 수 있으므로 최소 명목 budget 이상을 권장한다).",
    evidenceSource: "Short-Circuit Production Integration Sprint v1 (outer=2000ms 실측, 2/2 회복) + Validation Methodology Qualification Sprint v1 STEP3 (outer=1000/1500/2000/60000ms 스윕, 전 구간 improved=true)",
  },
  {
    axis: "PRODUCT_VALIDATION",
    path: "solve_e2e",
    purpose: "실제 최종 사용자가 겪는 완전한 Production Contract(primary 파이프라인의 outer deadline 선점 + ENDGAME 전용 Recovery 트리거 + real recoveryReserveMsOverride) 하에서, 이 변경이 실사용 결과(해결률/런타임/Regression)에 미치는 실제 영향을 검증한다.",
    budgetRequirement: "PLAN_TIME_BUDGET_MS=1000ms 고정(파라미터 아님) + recoveryReserveMsOverride(기본 250ms, 유일하게 노출된 안전한 레버) -- 이 축은 Primitive의 명목 budget에 맞춰 조정할 수 없다는 것이 이 Sprint 계열의 핵심 발견이다.",
    evidenceSource: "Multi-Component Merge Production Validation Sprint v1 (N=142, real solve(), improvedCount Baseline=Integrated=1/142) + Validation Methodology Qualification Sprint v1 STEP3 (recoveryReserveMsOverride=250/450/900ms 스윕, 전 구간 improved=false)",
  },
];
