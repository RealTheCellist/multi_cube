// --- SchedulingContract (CCR Integration Blueprint Sprint v1) --------------
// STEP2. A SPECIFICATION only -- a typed data structure describing how CCR
// SHOULD be scheduled if/when a future Integration Sprint actually wires
// it in. Nothing here is called by, or wired into,
// fiveByFiveEdgeRecovery.ts/fiveByFiveEdgeExecutor.ts -- this file cannot
// affect production behavior by construction (it exports only inert data
// + a documentation-style validator, no side effects on real Cubie state).
export type CcrCallCondition =
  | "task.type === 'ENDGAME'" // matches Recovery's own existing recoveryEligible gate (fiveByFiveEdgeExecutor.ts) -- CCR never fires outside Recovery under the "repair_after" Integration Point
  | "primary pipeline made zero progress (Recovery already triggered)"
  | "CCR Gate: cycleLength(cubies) in [5,6] AND conflictEdgeCount(cubies) === 0";

export interface SchedulingContractSpec {
  callConditions: CcrCallCondition[];
  priority: string;
  executionOrderVsRepair: string;
  budgetAllocationPolicy: string;
  starvationSafeguard: string;
}

export function ccrSchedulingContract(): SchedulingContractSpec {
  return {
    callConditions: [
      "task.type === 'ENDGAME'",
      "primary pipeline made zero progress (Recovery already triggered)",
      "CCR Gate: cycleLength(cubies) in [5,6] AND conflictEdgeCount(cubies) === 0",
    ],
    priority:
      "REPAIR와 CCR은 Gate가 서로소(cycleLength 2~4 vs 5~6)이므로 '더 우선한다'는 개념 자체가 무의미하다 -- 어느 한 state에서 둘 다 매치되는 경우가 구조적으로 없다(CCR Prototype Sprint v1 STEP6에서 Duplicate Success 0건으로 실측 확인됨). 따라서 순서는 결과가 아니라 지연시간(latency)만 좌우한다.",
    executionOrderVsRepair:
      "generateRecoveryStrategies()의 후보 생성 순서에서 CCR을 REPAIR 바로 뒤에 둔다: DISRUPT, DISRUPT, SETUP, REPAIR, CCR. REPAIR가 이미 '가장 나중에 추가된 후보' 관례를 확립했으므로(fiveByFiveEdgeRecovery.ts 주석, RepresentationPrimitiveSelector.ts의 FIXED_BASELINE_ORDER 주석 모두 동일 패턴), CCR도 그 다음에 추가하는 것이 가장 낮은 리스크의 선택이다.",
    budgetAllocationPolicy:
      "REPAIR의 reservedBudget 패턴(REPAIR_RESERVED_SLICE_MS=75ms, 공유 genDeadline을 우회)을 그대로 계승하되, CCR 자신의 슬라이스 크기는 STEP3의 Budget Contract 평가를 따른다 -- DISRUPT/SETUP이 공유하는 genDeadline(RECOVERY_GEN_BUDGET_MS=300ms)과는 별개의, CCR 전용 예산 창을 갖는다(REPAIR와 동일한 설계 철학).",
    starvationSafeguard:
      "CCR이 자신만의 예산 창을 가지므로(REPAIR의 reservedBudget과 동일한 원리) DISRUPT/SETUP/REPAIR의 예산을 잠식하지 않는다. 역방향(CCR이 DISRUPT/SETUP/REPAIR에 의해 굶주리는 것) 역시 동일한 이유로 방지된다 -- Integration Refinement Sprint v1이 REPAIR를 위해 이미 검증한 것과 동일한 안전장치를 CCR에도 그대로 적용하는 것뿐, 새로운 메커니즘이 아니다.",
  };
}
