// --- IntegrationContract (Solver Primitive Integration Blueprint Sprint
// v1) -- STEP4, the Sprint's own most important deliverable ("이 Sprint에서
// 가장 중요한 산출물"). Specifies exactly how W2_widerHop would be added
// as a REPAIR-typed candidate inside fiveByFiveEdgeRecovery.ts's
// generateRecoveryStrategies() -- design only, no code change to that
// file in this Sprint.
export interface IntegrationContract {
  preconditions: string;
  input: string;
  output: string;
  allowedOperations: string;
  successCriteria: string;
  failureCriteria: string;
  deferredValidation: string;
  fallback: string;
  plannerContract: string;
  primitivePriority: string;
}

export const W2_INTEGRATION_CONTRACT: IntegrationContract = {
  preconditions:
    "1) Recovery가 이미 발동된 상태(즉 ENDGAME task의 runPrimaryPipeline이 실패한 이후, executeTask의 allowRecovery=true top-level 루프에서만). " +
    "2) analyzeMultiCycle(cubies)로 얻은 cycleLength가 2~4 사이. " +
    "3) countConflictEdges(cubies) > 0. " +
    "이 세 조건 전부를 만족할 때만 REPAIR 후보를 생성한다 -- 조건 (2)(3)은 Prototype Refinement Sprint v2가 확정한 Blueprint(A1_wideCycle) 그대로, 새로 만들지 않는다.",
  input: "cubies(현재 Cube 상태, generateRecoveryStrategies가 이미 받는 것과 동일), libs.lib(WingLibrary), genDeadline(RECOVERY_GEN_BUDGET_MS을 후보 수만큼 나눈 slice() -- 다른 후보와 동일한 예산 배분 규칙을 그대로 따른다).",
  output:
    "RecoveryStrategy 객체 하나(또는 게이트 불충족/탐색 실패 시 생성 안 함, 기존 add() 헬퍼의 '실패하면 그냥 추가 안 함' 계약과 동일) -- " +
    "type: 'REPAIR', description: 문자열, moves: Move[], expectedWrongWingDelta/expectedFuturePotential/score: 기존 add() 헬퍼가 scoreWholeState로 계산하는 것과 동일한 방식.",
  allowedOperations:
    "MultiHopBridgePrototypeV3.ts의 countConflictEdges + solverPrimitivePrototypeRefinementV2/의 W2_widerHop 검색 로직(maxCandidatesPerHop=3, reorderByImmediateImprovement=false)을 그대로 재사용한다 -- 이 Sprint에서도, Integration Prototype Sprint에서도 그 알고리즘 자체는 새로 작성하지 않는다. Recovery의 기존 add() 헬퍼 패턴을 그대로 따른다(moves가 없거나 비었으면 후보에 안 넣음).",
  successCriteria: "add() 헬퍼를 통과한 REPAIR 후보가 chooseBestRecovery()에서 최고 점수로 선택되고, 그 결과 attemptRecovery()의 재시도(retryTask)가 originalBaseline보다 낮은 wrongWingCount로 끝나는 경우 -- 기존 Recovery 전체의 success 기준과 동일, REPAIR만을 위한 별도 기준을 만들지 않는다.",
  failureCriteria:
    "1) Gate 불충족(사전조건 (2)(3) 중 하나라도 거짓) -- 후보 자체를 생성하지 않음(정상적인 '해당 없음', 실패로 로그하지 않음). " +
    "2) Gate는 충족했지만 tryMultiHopBridge류 탐색이 leavesExplored/deadline 안에서 net-improving leaf를 못 찾음 -- add()에서 자동으로 후보 목록 제외. " +
    "3) 후보는 생성됐지만 다른 DISRUPT/SETUP 후보의 score가 더 높아 chooseBestRecovery에서 선택 안 됨 -- 이것도 실패가 아니라 정상적인 우선순위 경쟁 결과.",
  deferredValidation:
    "이중 검증 구조를 그대로 유지한다: (a) W2 자체의 validateDeferred(원본 vs best leaf)가 이미 net-improvement만 통과시킨다(solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts 그대로 재사용). " +
    "(b) attemptRecovery() 자체도 독립적으로 originalBaseline과 finalWrong을 비교해 전체 Recovery 시도가 실제로 개선됐는지 재검증한다. REPAIR 후보라고 이 (b) 검증을 생략하지 않는다 -- DISRUPT/SETUP과 동일한 계약.",
  fallback:
    "REPAIR가 선택되지 않거나 실패해도 Recovery의 기존 흐름(DISRUPT/SETUP 후보, MAX_RECOVERY_RETRIES=1회 재시도, 실패 시 빈 배열 반환 후 executeTask가 빈 Move[] 반환)이 그대로 fallback으로 작동한다 -- REPAIR는 '있으면 좋은' 세 번째 후보일 뿐, 기존 계약을 대체하거나 필수로 만들지 않는다.",
  plannerContract:
    "변경 없음(PlannerDependencyAnalysis.ts의 PLANNER_CHANGE_REQUIRED=false 참고). Planner는 Recovery의 존재 자체를 모르며, REPAIR 후보 추가는 Executor/Recovery 계층에 완전히 캡슐화된다. simulateStrategy의 결정론 보장(동일 Cube -> 동일 Strategy)도 영향받지 않는다 -- allowRecovery=false로 호출되는 시뮬레이션 경로는 Recovery 자체를 타지 않으므로 REPAIR 후보도 당연히 타지 않는다.",
  primitivePriority:
    "고정 순서(if/else 우선순위 체인)를 두지 않는다 -- 기존 DISRUPT x2/SETUP x1과 동일하게 scoreWholeState 기반 점수 경쟁에 맡긴다(chooseBestRecovery의 기존 reduce 로직 그대로). " +
    "예외적으로 하나 검토할 설계 선택지가 있다: REPAIR 후보의 moves가 이미 net-improving임이 자체 검증(validateDeferred)으로 보장되므로, DISRUPT/SETUP처럼 '적용 후 retryTask로 재시도'하는 대신 expectedWrongWingDelta<0이면 즉시 성공으로 단축(short-circuit)하는 것이 효율적일 수 있다 -- 이 선택은 RiskAnalysis.ts에서 별도 논의하며, 이 Sprint는 결정하지 않고 Integration Prototype Sprint의 판단으로 남긴다(제품 코드 미변경 원칙과 별개로, '설계 결정을 다음 Sprint로 명시적으로 넘긴다'는 뜻).",
};
