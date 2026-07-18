// --- ResearchTimeline (Solver v3 Strategy Review Sprint v1) ---------------
// STEP1: every Sprint's goal/real result/outcome/final conclusion, taken
// directly from already-committed prior Sprint artifacts (never re-run,
// per this Sprint's own "새 실험은 수행하지 않는다" rule). Each entry
// cites the exact committed report file(s) its numbers come from, so every
// claim here is traceable to a real, already-existing artifact --
// `runSolverV3Review.ts` verifies every citation still exists on disk.
export type SprintOutcome = "SUCCESS" | "PARTIAL" | "FAILURE" | "REJECTED" | "CONDITIONAL";

export interface ResearchTimelineEntry {
  id: string;
  name: string;
  goal: string;
  realResult: string;
  outcome: SprintOutcome;
  finalConclusion: string;
  sourceFiles: string[];
}

export const RESEARCH_TIMELINE: ResearchTimelineEntry[] = [
  {
    id: "PLANNER_V2",
    name: "Planner v2 (Strategy/MacroGoal)",
    goal: "여러 후보 전략을 생성하고 Simulation Layer로 평가해 더 나은 Solver 행동을 선택",
    realResult: "전략별 개선폭이 특정 replay에 과적합 -- 다른 replay로 일반화되지 않음 (이후 Sprint들에서 반복 인용된 정성적 결론, 이 Sprint 자체의 정량 리포트는 이번 Review 범위 밖의 더 이른 세션에서 생성됨)",
    outcome: "FAILURE",
    finalConclusion: "일반화 실패 -- Solver v2 Research Kickoff Sprint v1의 자체 트랙 비교표에도 동일하게 기록됨",
    sourceFiles: ["src/customCube/goalPlanner/data/goal-planner-report.txt"],
  },
  {
    id: "GOAL_INTEGRATION",
    name: "Solver Integration Sprint v1 (Goal Integration)",
    goal: "Goal-oriented Planning을 실제 Solver Loop에 통합해 성능 개선 여부 검증",
    realResult: "75-replay A/B에서 Goal 0/75 실제 발동. GOAL_INTEGRATION_RESERVE_MS 시간 예약만으로 avg WrongWing 9.16->9.49 악화 (사용되지도 않은 예약이 순수 비용으로만 작용)",
    outcome: "FAILURE",
    finalConclusion: "과적합/역효과 -- fiveByFiveEdgeSolverEngine.ts 변경 git checkout으로 완전 되돌림, goalPlanner/ 실험 코드만 유지",
    sourceFiles: ["src/customCube/goalPlanner/data/solver-integration-benchmark.txt", "src/customCube/goalPlanner/data/solver-integration-conclusion.txt"],
  },
  {
    id: "POLICY_GENERALIZATION",
    name: "Policy Generalization Sprint v1",
    goal: "Goal Candidate를 일반화 가능한 Solver Policy(위치별 Primitive Sequence)로 변환할 수 있는지 검증",
    realResult: "DISTINCT REPLAY 기준 다수결 정규화 결과 대부분 null 또는 소수 사례로만 성립 (w13|p1->[PARITY] 4/5, w10|p1->[BASE] 2/3, w9|p1->null 1-1 tie). EligibleGoals.generated.ts 최종 0/32 후보만 60% 게이트 통과 -> 사실상 빈 배열",
    outcome: "PARTIAL",
    finalConclusion: "안전하지만(오탐 없음) Coverage 부족 -- 제품에 통합할 만큼 일반화되는 Policy가 거의 없음",
    sourceFiles: ["src/customCube/policyPlanner/data/policy-report.txt", "src/customCube/policyPlanner/data/next-sprint-proposal.txt"],
  },
  {
    id: "CYCLECHASE",
    name: "Primitive Invention Sprint v1 (CycleChase)",
    goal: "WANTS-Graph에서 감지된 4+ 길이 Cycle을 tryFixWing() 반복 호출로 해소하는 새 Primitive 발명",
    realResult: "MIN_CYCLE_LENGTH_TO_CHASE=4로 스코프 한정 (3-cycle 이하는 BASE가 이미 처리). 이후 모든 Sprint에 걸쳐 전체 75건 Coverage 약 24~25% (24.0~25.3%)로 반복 측정됨 -- 안정적이지만 상한이 뚜렷함",
    outcome: "PARTIAL",
    finalConclusion: "0% Regression으로 안전, 이후 모든 Blueprint(BP-1~4)의 baseline/비교 대상으로 재사용됨. Coverage 자체는 낮은 상한에 머무름",
    sourceFiles: ["src/customCube/primitivePrototype/data/prototype-benchmark.txt"],
  },
  {
    id: "COVERAGE_EXPANSION",
    name: "Coverage Expansion Sprint v1",
    goal: "CycleChase가 비활성화되는 replay들을 원인별로 분류 (InactivityClassifier)",
    realResult: "비활성 원인 분류(NO_WANTS_CYCLE/ONLY_3_CYCLE/FIRST_HOP_FAIL/BROKEN_BY_PARITY/INSUFFICIENT_PAIR/UNKNOWN) 중 FIRST_HOP_FAIL이 다수를 차지 -- 즉 Cycle을 걷기 시작하기도 전에 첫 hop부터 막히는 경우가 지배적",
    outcome: "PARTIAL",
    finalConclusion: "근본 원인이 '탐색 부족'이 아니라 '첫 수부터 막힘'이라는 것을 확인 -- 다음 Sprint(First-Hop Failure Analysis)의 직접적 동기가 됨",
    sourceFiles: ["src/customCube/coverageExpansion/data/coverage-breakdown.txt", "src/customCube/coverageExpansion/data/coverage-expansion-report.txt"],
  },
  {
    id: "FIRST_HOP_ANALYSIS",
    name: "First-Hop Failure Analysis Sprint v1",
    goal: "FIRST_HOP_FAIL이 '경로가 아예 없음(NO_VALID_PATH)'인지 '경로는 있지만 즉시 개선 안 됨(PAIR_CONFLICT)'인지 구분, ShadowBFS로 탐색 예산/깊이를 늘려도 구제되는지 확인",
    realResult: "ShadowBFS를 1500 -> 8000 -> 30000 노드, 깊이 6 -> 8까지 늘려도 NO_VALID_PATH 6건 중 rescue 0건 (전 구간에서 NODE_BUDGET_EXCEEDED로 실패)",
    outcome: "FAILURE",
    finalConclusion: "탐색 예산/깊이를 늘리는 것은 이 실패 모드에 도움이 안 됨 -- 명확하고 반복 검증된 부정적 결과",
    sourceFiles: ["src/customCube/firstHopAnalysis/data/counterfactual-simulation.txt", "src/customCube/firstHopAnalysis/data/root-cause-report.txt"],
  },
  {
    id: "CONTRACT_ANALYSIS",
    name: "Solver Contract Analysis Sprint v1",
    goal: "tryFixWing()의 '즉시 순 개선' 계약을 완화(지연된 개선 허용)했을 때 실제 비용이 얼마인지 실측",
    realResult: "실측 avgBranchingFactor=5.44, avgMsPerCandidateCheck=49.291ms. depth=2 추정 1461.1ms (Task 120ms의 12배, Plan 1000ms도 초과), depth=4 추정 43309.2ms",
    outcome: "FAILURE",
    finalConclusion: "계약을 전역적으로 완화하는 것은 실측으로 비용이 과도함이 증명됨 -- '현재 계약 유지' 결정. 이 결론은 이후 BP-1(Deferred/끝에서만 검증)과 BP-5(실측 재확인)에서 반복 인용/재검증됨",
    sourceFiles: ["src/customCube/contractAnalysis/data/cost-estimation.txt", "src/customCube/contractAnalysis/data/architecture-decision-report.txt"],
  },
  {
    id: "SOLVER_V2_KICKOFF",
    name: "Solver v2 Research Kickoff Sprint v1",
    goal: "Hard Gap(6개 기존 capability 전부 실패) 상태를 프로파일링하고, 새 Primitive Blueprint 후보를 도출",
    realResult: "Hard Gap 29~31/75건(38.7%, 이 Sprint 자체 run 기준), Cluster Coverage 72.7%, 평균 WrongWing 9.07, Parity 51.7%, 평균 Cycle 길이 4.24. 4개 Blueprint(BP-1~BP-4) 설계 산출",
    outcome: "SUCCESS",
    finalConclusion: "Level 1~3 전부 PASS -- 4개 Blueprint를 다음 Prototype Sprint들의 검증 대상으로 확정",
    sourceFiles: ["src/customCube/solverV2Research/data/research-report.txt"],
  },
  {
    id: "BP1",
    name: "Solver v2 Primitive Prototype Sprint v1 (BP-1: Bounded Multi-Cycle Resolver)",
    goal: "탐지된 WANTS-Cycle 전체를 결정적 bounded DFS + Deferred Validation(끝에서만 검증)으로 한 번에 해소",
    realResult: "Hard Gap 29-31: CycleChase 4/31(12.9%) == Bounded 4/31(12.9%) 동률. 전체 75: CycleChase 25.3% -> Bounded 28.0%(+2.7pp), 0% Regression 양쪽 모두. (이 Sprint 고유 기준: Level1 목표 10건, Level3 목표 32.7% -- 이후 BP-2~4는 Level1 8건/Level3 35%로 통일됨, 축 간 기준값이 Sprint마다 조금씩 다름)",
    outcome: "PARTIAL",
    finalConclusion: "Level1 FAIL(4<10), Level2 PASS, Level3 FAIL(28.0%<32.7%). 이 트랙 전체에서 유일하게 실측 Coverage가 CycleChase 대비 실제로 상승한 사례(+2.7pp) -- 이후 BP-2/3/5의 baseline이자 재사용 대상이 됨",
    sourceFiles: ["src/customCube/solverV2Prototype/data/prototype-benchmark-report.txt"],
  },
  {
    id: "BP2",
    name: "Solver v2 Primitive Prototype Sprint v2 (BP-2: Parity-Aware Cycle Breaker)",
    goal: "PARITY_ALG를 Cycle 구조에 맞춰 conjugate -- Parity 해소와 동시에 Cycle 일부도 줄이기",
    realResult: "Hard Gap 31: CycleChase 2(6.5%), Bounded(BP-1) 6(19.4%), ParityAware 0(0.0%). 전체 75: CycleChase 25.3%, BP-1 32.0%, BP-2 9.3% (CycleChase보다도 낮음)",
    outcome: "REJECTED",
    finalConclusion: "Level1 FAIL(0<8), Level3 FAIL(9.3%<35%, CycleChase 대비도 낮음) -- Parity가 Hard Gap의 실질 병목이 아님을 확인, BP-2 보류",
    sourceFiles: ["src/customCube/solverV2PrototypeBP2/data/prototype-benchmark-report.txt"],
  },
  {
    id: "BP3",
    name: "Solver v2 Primitive Prototype Sprint v3 (BP-3: Non-Parity Structural Fix)",
    goal: "WANTS-Graph의 CONFLICT/SWAP 엣지까지 포함해 BP-1보다 넓은 범위의 구조를 재배치",
    realResult: "Hard Gap 29: CycleChase 2(6.9%), BP-1 5(17.2%), BP-2 0(0.0%), BP-3 1(3.4%). 전체 75: CycleChase 25.3%, BP-1 32.0%, BP-2 9.3%, BP-3 25.3%(CycleChase와 동률)",
    outcome: "REJECTED",
    finalConclusion: "Level1 FAIL(1<8), Level3 FAIL(25.3%<35%) -- 탐색 범위를 넓히는 것이 BP-1보다 오히려 낮은 결과, 구조 확장 자체는 해법이 아님을 확인",
    sourceFiles: ["src/customCube/solverV2PrototypeBP3/data/prototype-benchmark-report.txt"],
  },
  {
    id: "BP4",
    name: "Solver v2 Primitive Prototype Sprint v4 (BP-4: Precomputed Cycle-Shape Lookup)",
    goal: "런타임 탐색을 포기하고, 동일 Cycle Shape에는 사전 계산된 Primitive를 조회해 즉시 적용",
    realResult: "Hard Gap 33: 전원 낮은 개선(BP-4 0/33). 전체 75 Coverage: CycleChase 24.0%, BP-1 18.7%, BP-2 9.3%, BP-3 22.7%, BP-4 0.0%. 근본 원인: 75건이 69개 고유 Shape로 분산(Singleton 64/69=92.8%), 2개 이상 멤버를 가진 Shape는 5개뿐 -- leave-one-out 시 대부분 훈련 증거 0",
    outcome: "REJECTED",
    finalConclusion: "Level1 FAIL(0<8), Level3 FAIL(0.0%<35%) -- Shape 공간이 75개 표본 대비 지나치게 희소함을 확인. BP-1~4 전원 Level 미달로 Blueprint 트랙 공식 종료",
    sourceFiles: ["src/customCube/solverV2PrototypeBP4/data/prototype-benchmark-report.txt", "src/customCube/solverV2PrototypeBP4/data/shape-report.txt"],
  },
  {
    id: "SOLVER_V3_KICKOFF",
    name: "Solver v3 Research Kickoff Sprint v1",
    goal: "BP-1~4 전원 실패 이후, Hard Gap의 측정/표현 방식 자체가 문제인지를 Gate로 먼저 검증 후 새 Blueprint를 재도출",
    realResult:
      "STEP0 Gate=CONDITIONAL (Shape 재등장률 14.7%/CONDITIONAL, Cluster 안정성 88.5%/PASS, Replay 다양성 92.0%/FAIL). " +
      "STEP1: BP-1/2/3 결합 테스트로 원본 Hard Gap의 평균 23.6%(7.0/29.7건, range 20.0~25.9%)가 측정 window 문제로 구제됨 -- 나머지 76.4%는 실제로 남는 Hard Gap. " +
      "STEP2: Coarse Structural Shape(Singleton 66.7%/재등장률 60.0%/평균그룹 1.67)와 Capability Fingerprint(38.1%/89.3%/3.57) 모두 BP-4 baseline(92.8%/14.7%/1.09) 대비 Level1 기준 크게 상회, 단 Fingerprint는 남은 Hard Gap을 전부 하나로 뭉개 설계에 무용. " +
      "STEP3: 구제된 그룹(n=6, 평균WW11.0/Cycle2.83/Conflict1.17/Parity83.3%) vs 여전히 Hard Gap(n=24, 평균WW8.58/Cycle1.92/Conflict1.96/Parity45.8%) 뚜렷이 다른 프로파일. " +
      "STEP4: WANTS Graph KEEP_WITH_COARSER_GRAIN.",
    outcome: "SUCCESS",
    finalConclusion: "Level1~3 전부 PASS, 8-1 결론 A -- 새 Blueprint BP-5(Sparse Wrongness Bounded Lookahead) 제안, 비용 검증은 명시적으로 미완료 상태로 다음 Sprint에 위임",
    sourceFiles: ["src/customCube/solverV3Research/data/kickoff-report.txt", "src/customCube/solverV3Research/data/step0-gate-report.txt"],
  },
  {
    id: "BP5",
    name: "Solver v3 Primitive Prototype Sprint v1 (BP-5: Sparse Wrongness Bounded Lookahead)",
    goal: "BP-5가 실제 Solver Contract(Task 120ms/Plan 1000ms) 안에서 실행 가능한지, 가장 좁혀진 표적 부분집합에서 실측으로 검증",
    realResult:
      "Candidate 18/75건(Extended Hard Gap 21건 AND Sparse 프로파일 29건의 교집합). 실제 depth=2 bounded 탐색 실행 결과: 평균 Branching Factor 3.70(최대20/최소0), 평균 방문 노드 6.78개(64개 cap 대비 훨씬 낮음), 평균 탐색 시간 561.6ms/최대 670ms, Deadline 도달률 100%. Task Budget(120ms, 평균 기준) 초과, Plan Budget(1000ms, 최대 기준) 충족",
    outcome: "REJECTED",
    finalConclusion:
      "Contract FAIL -- Level1 PASS, Level2 FAIL, Level3(FAIL 분기) PASS. 결론 C: BP-5 기각. 핵심 발견: 비용 폭증의 원인이 branching factor(측정상 평균 6.78개 노드로 64개 cap에 전혀 도달하지 않음)가 아니라 enumerateWingCandidates() 호출 1회 자체의 실측 비용(~83ms/call, Contract Analysis Sprint v1의 49.29ms와 동일 자릿수)이었음 -- 표적을 아무리 좁혀도 이 병목은 줄지 않음",
    sourceFiles: ["src/customCube/solverV3PrototypeBP5/data/prototype-report.txt"],
  },
];
