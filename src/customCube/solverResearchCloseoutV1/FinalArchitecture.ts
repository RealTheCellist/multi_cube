// --- FinalArchitecture (Solver Research Closeout Sprint v1, STEP2)
// -------------------------------------------------------------------------
// Freezes the current Production Solver architecture as of this Sprint,
// citing real, verified facts read directly from the production source
// (fiveByFiveEdgeRecovery.ts, fiveByFiveEdgeExecutor.ts,
// fiveByFiveEdgeSolverEngine.ts, fiveByFiveEdgePlanner.ts) at Sprint time.
// This is documentation only -- no production file is modified.
export interface RecoveryPipelineStage {
  order: number;
  candidateType: string;
  gate: string;
  budgetContract: string;
  shortCircuitEligible: boolean;
}

export interface FinalArchitectureV1 {
  recoveryPipelineDefaultOrder: RecoveryPipelineStage[];
  recoveryEligibleCondition: string;
  outerDeadlines: { component: string; valueMs: number; parameterized: boolean }[];
  plannerRole: string;
  primitiveLibraryFile: string;
  validationFrameworkSummary: string;
  dedicatedBudgetPrimitiveProtocolSummary: string;
}

export const FINAL_ARCHITECTURE_V1: FinalArchitectureV1 = {
  // Real production default order (schedulingStrategy="reservedBudget",
  // multiComponentMergeOrder="AFTER_CCR", useSetupReservedSlice=true) --
  // fiveByFiveEdgeRecovery.ts line 628.
  recoveryPipelineDefaultOrder: [
    { order: 1, candidateType: "DISRUPT (light, ≤1 disruption)", gate: "always attempted, shares genDeadline with SETUP", budgetContract: "shared genDeadline window", shortCircuitEligible: false },
    { order: 2, candidateType: "DISRUPT (extended, disruption=3, 1 recursion)", gate: "always attempted, shares genDeadline with SETUP", budgetContract: "shared genDeadline window", shortCircuitEligible: false },
    { order: 3, candidateType: "REPAIR", gate: "always attempted (internal runSuccessV2 gate: cycleLength 2-4 AND conflictEdgeCount>0)", budgetContract: "REPAIR_RESERVED_SLICE_MS=75ms", shortCircuitEligible: true },
    { order: 4, candidateType: "CCR", gate: "includeCCR flag only, no structural gate", budgetContract: "remainingTime (real outer deadline as-is, no dedicated slice)", shortCircuitEligible: true },
    { order: 5, candidateType: "MULTI_COMPONENT_MERGE", gate: "componentCount >= 3", budgetContract: "MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=2000ms", shortCircuitEligible: true },
    { order: 6, candidateType: "PARITY_GATED_CYCLE", gate: "componentCount > 1", budgetContract: "PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms", shortCircuitEligible: true },
    { order: 7, candidateType: "MIXED_COMMUTATOR", gate: "cycleCount===1 AND componentCount===1", budgetContract: "MIXED_COMMUTATOR_RESERVED_SLICE_MS=300ms", shortCircuitEligible: true },
    { order: 8, candidateType: "SETUP", gate: "last-resort -- only attempted if candidates.length===0", budgetContract: "SETUP_RESERVED_SLICE_MS=500ms", shortCircuitEligible: false },
  ],
  recoveryEligibleCondition: "recoveryEligible = allowRecovery && task.type === \"ENDGAME\" (fiveByFiveEdgeExecutor.ts) -- Recovery only ever triggers on ENDGAME-type tasks, never PAIR/FLIP/PARITY.",
  outerDeadlines: [
    { component: "solve() 전체 (PLAN_TIME_BUDGET_MS)", valueMs: 1000, parameterized: false },
    { component: "ENDGAME task 자체의 Recovery Reserve (recoveryReserveMsOverride)", valueMs: 250, parameterized: true },
    { component: "primary 파이프라인 tryFixWing 자체 예산 (FIXED_BUDGET_MS)", valueMs: 140, parameterized: false },
  ],
  plannerRole: "Planner v2(fiveByFiveEdgePlanner.ts): 여러 후보 whole-cube Strategy(순서가 다른 MacroGoal 시퀀스)를 생성해 각각을 클론된 큐브에 미리보기(preview)로 몇 수 앞서 시뮬레이션하고 Evaluator로 점수를 매겨 최고 점수의 전체 Strategy를 채택한다. Executor의 executeTask()만 블랙박스로 호출하며 Library 함수를 직접 호출하지 않는다.",
  primitiveLibraryFile: "fiveByFiveEdges.ts -- BASE_ALG/FLIP_ALG/PARITY_ALG 등 실제 이동/케이스 라이브러리와 tryFixWing/tryEndgameThroughDisruption/tryEndgameMultiPly 등 저수준 탐색 함수를 보유. 헤더 설명 주석은 없으나(코드로 직접 확인됨), 이 프로젝트 전체 Recovery/Primitive 레이어가 재사용하는 최하위 실행 레이어다.",
  validationFrameworkSummary: "solverPostReleaseValidationFramework/ -- ReleaseGates.ts(Gate A/B/C/D/E, 경로-무관 MetricEvaluation/KpiSnapshot 기반), ChangeClassification.ts(Category A/B/C/D + tiered minN: prototype/production 2단계), ValidationPipeline.ts(decideFromGates() → Decision A/B/C). Post-Release 이후 이 arc의 모든 후속 Sprint가 이 Framework 위에서 검증되었다.",
  dedicatedBudgetPrimitiveProtocolSummary: "MULTI_COMPONENT_MERGE Validation Protocol Standardization Sprint v1이 확정하고 PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1이 실측으로 재확인한 2축 Protocol: dedicated budget(RESERVED_SLICE_MS)이 real production Recovery Reserve(250ms)보다 훨씬 큰 Primitive는 attemptRecovery_direct(Capability 확인)와 solve_e2e(실사용 영향 확인) 둘 다 보고해야 하며, 어느 한쪽만으로 효과 유무를 판정하지 않는다. 현재 이 Protocol 적용 대상: MULTI_COMPONENT_MERGE(적용 완료), PARITY_GATED_CYCLE(적용 완료). 구조적으로 동일 위험군이나 미검증: 없음(둘 다 이번 arc에서 검증 완료).",
};
