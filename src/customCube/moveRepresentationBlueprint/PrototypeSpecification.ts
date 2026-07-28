// --- PrototypeSpecification (Move Representation Blueprint Sprint v1,
// Deliverable #4) ------------------------------------------------------------
// Specification only -- defines what a FUTURE Prototype Sprint must
// implement and how it must be evaluated. No code implementing this
// mechanism is written in this Sprint.
export interface PrototypeSpec {
  input: string;
  output: string;
  precondition: string;
  postcondition: string;
  plannerInterface: string;
  evaluationMethod: string;
}

export function buildPrototypeSpecification(): PrototypeSpec {
  return {
    input: "cubies: Cubie[] (미변경 원본 상태), lib: WingLibrary, cycleNodes: string[] (analyzeMultiCycle()의 기존 출력), deadline: number.",
    output: "Move[] | null -- 성공 시 cycle의 모든 wing을 목표 위치로 재배치하는 완성된 이동 시퀀스 (기존 모든 Primitive와 동일한 반환 계약).",
    precondition: "PURE_CYCLE_ISOLATION 형태 (componentCount===1, conflictEdgeCount===0, cycleCount>=1) -- CCR Gate와 동일한 구조적 전제. 이 Sprint가 측정한 28건 전체가 해당.",
    postcondition: "wrongWingCount5(결과) < wrongWingCount5(원본) -- 기존 DeferredValidator.validateDeferred()와 동일한 net-improvement 기준으로 검증. 추가로 이번 Sprint가 규명한 문제(부작용 누적)를 재발시키지 않도록: affectedWingCount(결과) 가 cycleLength보다 유의미하게 크지 않아야 한다 (측정 가능한 새 평가 기준으로 명시적으로 추가).",
    plannerInterface: "Recovery Layer의 generateRecoveryStrategies()에 genCCR()과 나란히 추가되는 새 후보 생성 함수 하나 -- Planner/Executor 인터페이스 변경 없음.",
    evaluationMethod:
      "이번 Sprint가 규명한 28건의 PURE_CYCLE_ISOLATION 잔여 케이스 전체를 대상으로: (1) Capability -- 몇 건을 실제로 해결하는가 (목표: CCR의 0건 대비 유의미한 개선), (2) Side-effect -- 평균 affectedWingCount가 기존 평균(~30)보다 유의미하게 낮은가 (목표: cycleLength에 근접한 값), (3) Regression -- 기존 89건(Union Covered)에 대해 회귀가 없는가. 이 세 기준 모두 이후 Prototype Sprint의 Success Criteria가 되어야 한다.",
  };
}
