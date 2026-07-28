// --- ImplementationChecklist (Production Integration Blueprint Sprint
// v1, Deliverable #5) -----------------------------------------------------
export interface ChecklistItem {
  item: string;
  detail: string;
}

export function buildImplementationChecklist(): ChecklistItem[] {
  return [
    { item: "새 RecoveryType 추가 여부", detail: "예 -- \"MixedCommutator\"를 RecoveryType 유니온(fiveByFiveEdgeSolverTypes.ts)에 5번째 멤버로 추가." },
    { item: "후보 생성 함수", detail: "genMixedCommutator() -- genCCR()과 동일한 형태: tryMixedCommutatorPrototype(cubies, lib, deadline) 호출 -> add(\"MixedCommutator\", description, moves)." },
    { item: "등록 위치", detail: "generateRecoveryStrategies()의 `order` 배열, genCCR 다음(6번째, 마지막) -- 기존 DISRUPT/DISRUPT/SETUP/REPAIR/CCR의 예산 산술을 전혀 건드리지 않는 순수 추가." },
    { item: "평가 순서", detail: "genDisrupt1 -> genDisrupt2 -> genSetup -> genRepair -> genCCR -> genMixedCommutator(신규). chooseBestRecovery()는 순서와 무관하게 최고 score만 선택하므로, 이 순서는 '누가 이기는가'가 아니라 '누가 예산을 얼마나 쓰는가'만 결정한다." },
    { item: "Validation 계약", detail: "tryMixedCommutatorPrototype 자체가 이미 validateDeferred로 내부 검증을 마치고 null 또는 검증된 moves만 반환 -- add() 호출 시 추가 검증 불필요, REPAIR/CCR과 동일한 패턴." },
    {
      item: "Selection 메커니즘 (실측으로 발견된 핵심 이슈)",
      detail:
        "chooseBestRecovery()의 순수 scoreWholeState 경쟁에 그대로 맡기면 안 된다 -- 실측 결과 Mixed Commutator 후보의 raw score가 wrongWingCount는 개선되어도 protectedEdges(-60) 페널티 때문에 자주 강하게 음수로 나온다. REPAIR의 shortCircuitRepair 패턴(자체 validateDeferred 통과 시 score 비교 없이 즉시 채택)을 그대로 재사용할 것을 권고.",
    },
    { item: "Regression 체크포인트", detail: "89 Union Covered 케이스에서 regressionCount=0 (Mixed Commutator Prototype Sprint v1에서 이미 실측 확인) -- Production Integration 이후에도 동일한 89건 재검증을 다음 Sprint의 필수 회귀 체크포인트로 지정." },
  ];
}
