// --- IntegrationPointSurvey (Solver Primitive Integration Blueprint
// Sprint v1) -- STEP1: surveys where W2_widerHop (Prototype Refinement
// Sprint v2's confirmed Primitive: A1_wideCycle Gate -- cycleLength 2~4
// AND conflictEdgeCount>0 -- + maxCandidatesPerHop=3 bounded DFS) could
// be wired into the REAL production Solver, grounded in directly
// reading fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/
// fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts (all read-only,
// none modified).
//
// A foundational finding this STEP surfaced: the whole "5 existing
// Primitives" framework this research series has used throughout
// (BASE/FLIP/CASE/PARITY/BP1, testAllAllowedSingleShot/tryPrimitiveOn in
// solverRepresentationPrototype/RepresentationPrimitiveSelector.ts) is a
// RESEARCH/SIMULATION harness, not the live production pipeline.
// Production dispatches by SolveTaskType ("PAIR"|"FLIP"|"PARITY"|
// "ENDGAME", fiveByFiveEdgeSolverTypes.ts) inside
// fiveByFiveEdgeExecutor.ts's runPrimaryPipeline. The real
// correspondence, confirmed by reading tryPrimitiveOn's own dispatch
// (RepresentationPrimitiveSelector.ts:42-90) against runPrimaryPipeline
// (fiveByFiveEdgeExecutor.ts:77-150):
//   research BASE  (tryFixWing per wrong wing, no shuffle)      -> production PAIR task
//   research FLIP  (tryFlipWingsInPlace per wrong wing)         -> production FLIP task
//   research CASE  (tryExactCaseMatch)                          -> production PARITY task
//   research PARITY(bestFixOverall + tryEndgameMultiPly)        -> production ENDGAME task grinder
//   research BP1   (tryBoundedMultiCycleResolver)                -> NOT WIRED INTO PRODUCTION AT ALL
// BP1/multi-cycle resolution (which W2_widerHop directly extends) has
// only ever existed in solverV2Prototype/ -- a research directory never
// imported by fiveByFiveEdgeExecutor.ts. This means W2_widerHop
// introduces a genuinely NEW production capability, not a
// modification/replacement of an existing one -- there is no current
// production code path for "resolve a multi-wing WANTS-cycle via
// bounded backtracking across several hops."
// Also confirmed: goalPlanner/GoalIntegration.ts (Phase-era experimental
// Goal-based planning layer) is NOT imported anywhere in
// fiveByFiveEdgeSolverEngine.ts -- it was built and A/B-benchmarked
// (task #86-88) but never wired into the live solve() path. "The
// Planner" for this Blueprint's purposes is fiveByFiveEdgePlanner.ts's
// planEdgeTasks (Strategy/MacroGoal/SolveTask), confirmed by direct
// read of fiveByFiveEdgeSolverEngine.ts's solve().
export type StatePreservation = "mutates-in-place" | "returns-unapplied-candidate";

export interface IntegrationPointCandidate {
  name: string;
  location: string; // exact file:function this point lives in, as read
  callable: boolean;
  requiredInputs: string;
  requiredOutputs: string;
  statePreservation: StatePreservation;
  conflictsWithExisting: string;
  chosen: boolean;
  rejectionReason?: string; // present only when chosen=false
}

export const INTEGRATION_POINT_CANDIDATES: IntegrationPointCandidate[] = [
  {
    name: "PAIR task, before tryFixWing loop",
    location: "fiveByFiveEdgeExecutor.ts runPrimaryPipeline() -- task.type==='PAIR' branch, before the tryFixWing loop",
    callable: true,
    requiredInputs: "cubies(scoped to ONE task.targetEdge slot), lib, localDeadline(120ms TASK_LOCAL_BUDGET_MS)",
    requiredOutputs: "Move[] (mutates cubies in place on success, matching this branch's own convention)",
    statePreservation: "mutates-in-place",
    conflictsWithExisting: "없음(BP-1급 로직이 production에 전혀 없음) -- 다만 W2의 Gate(cycleLength 2~4)는 특정 slot 하나가 아니라 cube 전체의 WANTS-그래프 구조를 보는 조건이라, 'task.targetEdge 슬롯 하나만 다룬다'는 이 지점의 기존 계약과 근본적으로 안 맞는다.",
    chosen: false,
    rejectionReason: "PAIR task는 slot 하나만 다루도록 설계되어 있는데(task.targetEdge), W2는 여러 slot에 걸친 cycle을 다룬다 -- Task 단위와 Primitive의 실제 동작 범위가 어긋난다. TASK_LOCAL_BUDGET_MS=120ms도 hop당 예산(60ms)+candidatesPerHop=3 탐색에는 여유가 빠듯하다.",
  },
  {
    name: "ENDGAME task, inside grinder loop (alongside bestFixOverall/tryEndgameMultiPly)",
    location: "fiveByFiveEdgeExecutor.ts runPrimaryPipeline() -- task.type==='ENDGAME' branch's while-loop",
    callable: true,
    requiredInputs: "cubies(전체), lib, deadline(공유, guard<50회 루프 안에서 남은 시간)",
    requiredOutputs: "Move[] | null, deferred-validation 이미 내부에 있음 (net-improvement만 채택)",
    statePreservation: "mutates-in-place",
    conflictsWithExisting: "이 grinder loop은 이미 bestFixOverall(단일 wing 그리디)을 반복 호출한다 -- W2는 이와 다른 메커니즘(cycle 구조 인식)이라 진짜 신규 capability지만, guard<50 루프 안에 섞어 넣으면 어떤 반복에서 어느 메커니즘이 이겼는지 Trace로 구분하기 어려워진다.",
    chosen: false,
    rejectionReason: "동작은 가능하지만, 기존 grinder loop의 '단순 반복' 구조에 섞이면 Trace 가독성이 떨어지고, ENDGAME 태스크가 이미 성공하는 흔한 경우(bestFixOverall 만으로 충분한 경우)에도 매번 W2의 게이트 체크(analyzeMultiCycle/countConflictEdges)가 선행되어 불필요한 오버헤드가 생긴다.",
  },
  {
    name: "New RecoveryStrategy type \"REPAIR\" (RecoveryType이 이미 정의만 되어 있고 미사용)",
    location: "fiveByFiveEdgeRecovery.ts generateRecoveryStrategies() -- 새 후보로 추가",
    callable: true,
    requiredInputs: "cubies, libs(ExecutorLibraries), deadline(RECOVERY_GEN_BUDGET_MS=300ms를 후보 수만큼 나눈 slice())",
    requiredOutputs: "RecoveryStrategy 객체 (id/type/description/moves/expectedWrongWingDelta/expectedFuturePotential/score) -- generateRecoveryStrategies의 add() 헬퍼와 동일한 형태",
    statePreservation: "returns-unapplied-candidate",
    conflictsWithExisting: "없음. DISRUPT는 일부러 상태를 악화시키고, SETUP은 당장 도움 안 되는 수를 둔다 -- 둘 다 '그 자체로는 개선이 아닐 수 있음'을 전제한다. W2는 반대로 항상 net-improvement만 채택하는 것이 기존 계약(Deferred Validation)이라 REPAIR라는 이름 그대로의 의미(즉시 구조적 문제를 고친다)에 정확히 들어맞고, 기존 두 타입과 성격이 겹치지 않는다.",
    chosen: true,
  },
  {
    name: "Recovery 이전 (attemptRecovery 호출 전 사전 체크)",
    location: "fiveByFiveEdgeExecutor.ts executeTask() -- attemptRecovery 호출 직전",
    callable: true,
    requiredInputs: "cubies, lib, deadline",
    requiredOutputs: "Move[] | null",
    statePreservation: "mutates-in-place",
    conflictsWithExisting: "attemptRecovery는 이미 runPrimaryPipeline이 완전히 실패했을 때만 불린다 -- 그 앞에 W2를 끼워 넣으면 Recovery 자체의 '한 번 더 기존 파이프라인을 재시도' 계약과 별개의 새로운 단계가 생겨 Executor의 단계 수만 늘어난다.",
    chosen: false,
    rejectionReason: "REPAIR 타입으로 Recovery 후보 풀에 넣는 것과 사실상 같은 효과를 내면서, 별도 단계를 추가하는 것보다 기존 'Recovery는 다중 후보를 만들어 점수로 고른다'는 설계를 그대로 재사용하는 REPAIR 방식이 더 낫다.",
  },
  {
    name: "Recovery 이후 (attemptRecovery가 실패한 경우의 최후 수단)",
    location: "fiveByFiveEdgeExecutor.ts executeTask() -- attemptRecovery 반환 이후",
    callable: true,
    requiredInputs: "cubies, lib, deadline(이미 소진된 나머지)",
    requiredOutputs: "Move[] | null",
    statePreservation: "mutates-in-place",
    conflictsWithExisting: "attemptRecovery 자체가 이미 300ms(생성)+150ms(재시도)를 쓰고 나면 남은 예산이 거의 없을 가능성이 크다 -- W2 자체가 hop당 60ms를 쓰는 탐색이라 이 시점에는 예산이 부족해 거의 항상 조기 종료될 것으로 예상된다.",
    chosen: false,
    rejectionReason: "REPAIR 타입으로 Recovery 후보 풀 안에 넣으면 이 지점에서 굳이 별도로 다시 시도할 필요가 없어진다 -- 이미 Recovery 생성 단계에서 W2도 함께 평가되었을 것이기 때문.",
  },
];

export const CHOSEN_INTEGRATION_POINT = INTEGRATION_POINT_CANDIDATES.find((c) => c.chosen)!;
