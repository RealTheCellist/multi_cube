// --- MeasurementPathAudit (PARITY_GATED_CYCLE Validation Protocol
// Qualification Sprint v1, STEP1) -----------------------------------------
// PARITY Measurement Path Matrix: real code-level facts about where
// PARITY_GATED_CYCLE is invoked across solve()/attemptRecovery()/
// generateRecoveryStrategies(), read directly from fiveByFiveEdgeRecovery.ts
// (lines 540-587, 626-629, 705, 788) -- Production code NOT modified,
// read-only citation.
export interface ParityMeasurementPathRow {
  path: "solve_e2e" | "attemptRecovery_direct" | "generateRecoveryStrategies_direct";
  invocationLocation: string;
  gate: string;
  dedicatedSliceApplied: string;
  shortCircuitStatus: string;
  realProductionEvidence: string;
}

export const PARITY_MEASUREMENT_PATH_MATRIX: ParityMeasurementPathRow[] = [
  {
    path: "attemptRecovery_direct",
    invocationLocation: "generateRecoveryStrategies()의 genParityGatedCycle() 클로저 -- genCCR/genMultiComponentMerge 다음, genMixedCommutator 이전에 항상 호출됨(스케줄링 옵션과 무관하게 고정 순서).",
    gate: "componentCount>1 (analyzeConstraints(buildStateGraph(cubies)).componentCount) -- MCM의 Gate와 달리 훨씬 관대함(MCM은 특정 조건, PARITY는 순수 componentCount 기준). 실측: 142케이스 중 49케이스가 이 Gate를 통과(componentCount>1).",
    dedicatedSliceApplied: "PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms -- `Math.min(deadline, Date.now() + 2000)`로 outer deadline과 무관하게 자체 2000ms 예산 확보(MCM과 동일한 메커니즘).",
    shortCircuitStatus: "이미 attemptRecovery()의 short-circuit allowlist에 포함되어 있음(`best.type === \"PARITY_GATED_CYCLE\"`, 줄 788) -- MCM이 겪었던 Short-Circuit Gap 결함이 PARITY에는 애초에 없었다. Short-Circuit Production Integration Sprint v1이 발견하고 고친 문제가 PARITY에는 처음부터 존재하지 않았음.",
    realProductionEvidence: "이번 Sprint의 실측 스캔(outer=2000ms, 49개 Gate-passing 케이스 전수 조사): offeredCount=4, chosenCount=3, chosenAndImprovedCount=3 -- worstCase:5e5b20b, snapshot335:60b5c3b1, snapshot335:ad12c377.",
  },
  {
    path: "generateRecoveryStrategies_direct",
    invocationLocation: "attemptRecovery_direct와 동일한 genParityGatedCycle() 클로저 -- onEvent 계측 훅을 통해 candidateType=\"PARITY_GATED_CYCLE\"의 start/generated/skipped/empty phase를 직접 관측 가능.",
    gate: "attemptRecovery_direct와 동일.",
    dedicatedSliceApplied: "attemptRecovery_direct와 동일.",
    shortCircuitStatus: "이 경로는 attemptRecovery()의 retry-loop/short-circuit 레이어 자체를 우회하므로 short-circuit 이슈와 무관.",
    realProductionEvidence: "SharedProbes.ts의 parityRecoveryTimelineProbe()가 이 경로를 직접 사용 -- MCM Validation Methodology Sprint v1의 attemptRecoveryTimelineProbe()와 동일한 메커니즘(onEvent 훅), candidateType만 PARITY_GATED_CYCLE로 교체.",
  },
  {
    path: "solve_e2e",
    invocationLocation: "FiveByFiveEdgeSolverEngine.solve() -> executeTask() -> attemptRecovery() -> genParityGatedCycle() (ENDGAME 타입 task에서만 도달, recoveryEligible=true일 때).",
    gate: "attemptRecovery_direct와 동일한 componentCount>1 Gate -- 그러나 이 경로에서는 Recovery 자체가 트리거되어야만(primary 파이프라인 실패) genParityGatedCycle()에 도달함.",
    dedicatedSliceApplied: "동일한 PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms -- 그러나 attemptRecovery()가 real solve()로부터 받는 real outer deadline은 MCM Validation Methodology Sprint v1이 이미 확인한 대로 always the FULL task deadline(PLAN_TIME_BUDGET_MS=1000ms 고정, recoveryReserveMsOverride=250ms 기본값은 PRIMARY 파이프라인의 자체 시도 창만 줄임).",
    shortCircuitStatus: "attemptRecovery_direct와 동일(이미 allowlist 포함).",
    realProductionEvidence: "PARITY_GATED_CYCLE Production Integration Sprint v1(#415-421)의 real solve() 전체 142케이스 replay: parityGatedCycleOfferedCount=0, parityGatedCycleChosenCount=0, parityGatedCycleWinRate=0 -- 이 Sprint 자신의 데이터 파일(parityGatedCycleProductionIntegrationV1/data/parity-gated-cycle-production-integration-v1-result.json)에 이미 기록되어 있던 사실. MCM의 Production Validation Sprint v1(improvedCount Baseline=Integrated=1/142)과 정확히 동일한 패턴 -- solve_e2e 레벨에서 PARITY_GATED_CYCLE이 단 한 번도 후보로조차 등장하지 않았다.",
  },
];
