// --- PlannerDependencyAnalysis (Solver Primitive Integration Blueprint
// Sprint v1) -- STEP2: analyzes the REAL Planner's (fiveByFiveEdgePlanner.ts)
// current call flow, grounded in reading planEdgeTasks/simulateStrategy
// directly, to determine whether the chosen integration point (REPAIR-
// typed Recovery candidate) requires ANY Planner change. No Planner code
// read here is modified.
export interface PlannerCallOrderStep {
  step: number;
  description: string;
}

export const PLANNER_CALL_ORDER: PlannerCallOrderStep[] = [
  { step: 1, description: "analyzeEdgeSlots(cubies)로 12개 슬롯의 EdgeSlotStats 계산, pairedCount<2인 슬롯만 unfinished로 추림" },
  { step: 2, description: "5가지 후보 Strategy 생성 (점수순/완성임박순/Flip우선/어려운것부터/역순) -- buildCandidateStrategies" },
  { step: 3, description: "각 Strategy를 SIMULATION_LOOKAHEAD=2 MacroGoal만 클론 위에서 미리 실행(executeTask를 블랙박스로 호출), scoreWholeState로 채점" },
  { step: 4, description: "가장 점수 높은 Strategy 선택(동점이면 먼저 만든 것 우선, 결정론 보장), 5개 후보 전부 항상 평가(시간 초과로 스킵하지 않음)" },
  { step: 5, description: "선택된 Strategy의 MacroGoal 전체를 SolveTask[]로 전개(macroGoalToTask) -- Executor의 실제 입력" },
];

export interface FailureHandlingNote {
  taskType: string;
  onFailure: string;
}

export const FAILURE_HANDLING: FailureHandlingNote[] = [
  { taskType: "PAIR/FLIP/PARITY", onFailure: "executeTask가 빈 Move[]를 반환하면 SolverEngine의 for-loop가 그냥 다음 task로 넘어간다(moves.length===0이면 completedTasks에 안 들어감) -- Recovery는 이 세 타입에는 아예 적용되지 않는다(allowRecovery && task.type==='ENDGAME' 조건)." },
  { taskType: "ENDGAME", onFailure: "runPrimaryPipeline이 실패하면 executeTask가 attemptRecovery를 호출한다(allowRecovery=true인 top-level 루프에서만) -- 이게 W2/REPAIR가 실제로 개입하는 유일한 실패 처리 경로." },
];

export const DEFERRED_VALIDATION_LOCATIONS = [
  "runPrimaryPipeline 내부: 각 tryFixWing/tryFlipWingsInPlace/tryExactCaseMatch/bestFixOverall 호출 자체가 '개선되는 fix만 반환'하는 계약을 이미 갖고 있다 (라이브러리 함수 자체의 계약, Executor가 별도로 검증하지 않음).",
  "attemptRecovery 내부: originalBaseline(Recovery 시작 전 wrongWingCount) vs finalWrong(retry 이후)를 비교해 originalBaseline보다 나아졌을 때만 최종 success로 인정 -- Recovery 후보 자체의 개별 futurePotential과는 별개의, Recovery 전체에 대한 2차 검증.",
  "W2_widerHop(solverPrimitivePrototypeRefinementV2/) 자체: runInstrumentedBoundedSearch가 validateDeferred(before, best.cubies)를 호출해 net wrongWingCount 개선만 채택 -- Recovery 후보로 편입되어도 이 자체 검증은 그대로 유지된다(REPAIR 후보의 moves는 이미 검증된 것만 add()에 전달됨).",
];

export const PLANNER_FEATURES_CURRENTLY_USED = [
  "analyzeEdgeSlots/EdgeSlotStats (pairedCount, wings, pattern) -- 슬롯 단위 상태",
  "detectEdgeSlotPattern (flipped-pair/unpaired/wing-pair 분류)",
  "computeSlotMetrics + scoreMetrics (EvaluatorWeights 기반 슬롯별 점수)",
  "scoreWholeState (Strategy 시뮬레이션 비교용 전체 상태 점수)",
  "wrongWingCount5 (진행 여부/조기 종료 판단)",
];

export const FEATURES_REQUIRED_IF_W2_ADDED = [
  "buildStateGraph/analyzeMultiCycle(cycleLength, cycleNodes) -- Planner가 현재 전혀 쓰지 않는, WANTS-그래프 기반 구조 정보. REPAIR 방식으로 통합하면 이 계산은 Recovery 내부(generateRecoveryStrategies)에서만 필요하고 Planner에는 노출되지 않는다.",
  "countConflictEdges(conflictEdgeCount) -- 마찬가지로 Recovery 내부에서만 필요.",
];

export const PLANNER_CHANGE_REQUIRED = false;
export const PLANNER_CHANGE_RATIONALE =
  "Recovery는 Executor 계층에서 완전히 캡슐화되어 있다 -- Planner는 'ENDGAME task가 성공했는가'만 SolverEngine의 for-loop를 통해 간접적으로 볼 뿐, Recovery가 내부적으로 어떤 후보를 시도했는지 전혀 모른다(Planner v2의 simulateStrategy도 executeTask를 allowRecovery=false로만 호출해 Recovery 경로를 아예 타지 않는다 -- 결정론 보장을 위해 의도적으로 설계된 것, fiveByFiveEdgeExecutor.ts의 executeTask 주석 참고). REPAIR 타입 Recovery 후보를 추가해도 Planner의 MacroGoal 생성, Strategy 시뮬레이션, SolveTask 전개 로직은 단 한 줄도 바뀔 필요가 없다.";
