// --- ProtocolDefinition (Multi-Component Merge Validation Protocol
// Standardization Sprint v1, STEP2) --------------------------------------
// The official 4-stage Validation Flow. Every stage REUSES an existing,
// already-verified real module from this arc's own prior Sprints -- this
// Sprint defines the ORDER and CONTRACT between stages, it does not build
// any new measurement mechanism (Documentation/Framework Extension only,
// no Production/Primitive/Framework code touched).
export type ProtocolStage = "CAPABILITY_VALIDATION" | "REGRESSION_VALIDATION" | "PRODUCT_VALIDATION" | "RELEASE_DECISION";

export interface ProtocolStageRow {
  stage: ProtocolStage;
  order: number;
  description: string;
  reusedModule: string; // real, already-committed module this stage delegates to -- no new mechanism
  inputRequirement: string;
  outputConsumedBy: string; // which later stage needs this stage's own output
}

export const VALIDATION_FLOW: ProtocolStageRow[] = [
  {
    stage: "CAPABILITY_VALIDATION",
    order: 1,
    description: "attemptRecovery_direct를 검증 대상 Primitive 자신의 명목 budget(RESERVED_SLICE_MS) 이상의 outer deadline으로 호출해, Primitive 자체가 net-improving한지 확인한다.",
    reusedModule: "solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes.ts의 attemptRecoveryTimelineProbe() (Validation Methodology Qualification Sprint v1이 이미 실행/검증) -- generateRecoveryStrategies() 직접 호출 + onEvent 계측, 신규 실행 로직 없음.",
    inputRequirement: "대상 Hole Dataset 부분집합(해당 Primitive가 실제로 후보로 offer되는 케이스), outer deadline >= 대상 Primitive의 RESERVED_SLICE_MS.",
    outputConsumedBy: "RELEASE_DECISION (Gate C의 Capability 축 입력값 중 하나)",
  },
  {
    stage: "REGRESSION_VALIDATION",
    order: 2,
    description: "전체 Hole Dataset에 대해 real production 기본값(outer=1000ms)으로 attemptRecovery_direct를 Baseline/Integrated 두 arm으로 실행해, 새 Regression이 없는지 확인한다.",
    reusedModule: "solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/RegressionAudit.ts의 auditRegression() (Short-Circuit Production Integration Sprint v1이 이미 실행/검증, newRegressionCount=0 확인됨) -- 신규 로직 없음.",
    inputRequirement: "전체 Hole Dataset(142케이스), Baseline(변경 전) vs Integrated(변경 후) 두 real attemptRecovery_direct population replay.",
    outputConsumedBy: "RELEASE_DECISION (Gate A 입력값)",
  },
  {
    stage: "PRODUCT_VALIDATION",
    order: 3,
    description: "real solve() E2E를 production 기본값(recoveryReserveMsOverride=250ms)으로 전체 Hole Dataset에 실행해, 실사용 환경에서의 실제 영향(해결률/런타임)을 확인한다 -- 이 축이 CAPABILITY_VALIDATION과 다른 결과를 보일 수 있음을 이미 알고 있는 상태로 진행한다 (Validation Methodology Qualification Sprint v1의 핵심 발견).",
    reusedModule: "solverPrimitiveMultiComponentMergeProductionValidation/EndToEndSolveProbe.ts + PopulationReplay.ts (Multi-Component Merge Production Validation Sprint v1이 이미 실행/검증) -- 신규 로직 없음.",
    inputRequirement: "전체 Hole Dataset(142케이스), real solve() Baseline vs Integrated.",
    outputConsumedBy: "RELEASE_DECISION (Gate B/C의 Product 축 입력값, Gate E)",
  },
  {
    stage: "RELEASE_DECISION",
    order: 4,
    description: "CAPABILITY_VALIDATION과 PRODUCT_VALIDATION의 결과를 함께(어느 한쪽만이 아니라) Validation Framework의 Gate A/B/C/E에 통과시켜 최종 Decision A/B/C를 낸다. MCM 계열은 PRODUCT_VALIDATION 단독 결과(예: improvedCountDiff mean=0)만으로 Decision C(효과 없음)를 내리지 않는다 -- CAPABILITY_VALIDATION이 PASS인데 PRODUCT_VALIDATION만 OPEN_QUESTION/FAIL이면, 원인을 Budget Envelope 불일치로 우선 의심하고 STEP3(Sensitivity)로 재확인한다.",
    reusedModule: "solverPostReleaseValidationFramework/ReleaseGates.ts (evaluateGateA/B/C/E) + ChangeClassification.ts (getCategorySpec) + ValidationPipeline.ts (decideFromGates()) -- 전부 기존 그대로, 수정 없음.",
    inputRequirement: "REGRESSION_VALIDATION의 Gate A 입력, PRODUCT_VALIDATION의 Gate B/C/E 입력, CAPABILITY_VALIDATION의 보조 Gate C 입력(Product 축이 애매할 때 Capability 축의 PASS가 근거로 인용됨).",
    outputConsumedBy: "(최종 단계 -- 사람이 읽는 Release Decision)",
  },
];
