// --- TestDesign (Solver Long-term Reliability Validation Sprint v1,
// STEP1) --------------------------------------------------------------------
// Honest methodology disclosure. This project has no live production
// traffic or historical telemetry (it is a research repository, not a
// deployed service with real users over calendar time) -- so "Long-term"
// cannot mean "observed over months of real usage." The operational proxy
// this Sprint uses instead: MULTIPLE INDEPENDENT real solve() population
// replays (full 142-case Hole Dataset, real production defaults,
// recoveryReserveMsOverride=250ms) executed within this Sprint, all under
// the CURRENT frozen production code (unchanged since commit e386da8, the
// Short-Circuit fix -- confirmed by zero production-file diff across
// every one of the 6 Sprints run after it: MCM Production Validation,
// MCM Validation Methodology Qualification, Protocol Standardization,
// PARITY Validation Protocol Qualification, Solver Research Closeout).
// Repeated independent real runs of the SAME frozen code stand in for
// "repeated real-world invocation over time" -- this substitutes breadth
// of independent real executions for breadth of calendar time, which is
// the best honest proxy available without inventing synthetic telemetry.
export interface TestDesignV1 {
  methodology: string;
  proxyJustification: string;
  frozenCodeBaseline: string;
  protectedFiles: string[];
  forbiddenActions: string[];
  realRunCount: number;
}

export const TEST_DESIGN_V1: TestDesignV1 = {
  methodology:
    "전체 142케이스 Hole Dataset에 대해 real FiveByFiveEdgeSolverEngine.solve() E2E를 real production 기본값(recoveryReserveMsOverride=250ms)으로 독립적으로 N회(이번 Sprint에서는 2회) 반복 실행한다. 각 실행은 서로 다른 real wall-clock 시점에 수행되며, 동일한 고정 코드 상태 위에서 shuffle() 기반 확률 요소가 만드는 real variance를 관측한다.",
  proxyJustification:
    "이 프로젝트는 실사용자 트래픽이나 캘린더 시간에 걸친 운영 원격측정(telemetry) 이력이 없는 연구 저장소다 -- 따라서 '수개월간 실사용으로 관측됨'을 의미하는 진짜 Long-term 검증은 불가능하다. 이번 Sprint는 이를 숨기지 않고, '동일한 고정 코드 위에서의 독립적인 반복 real 실행'을 시간 축의 정직한 대체 지표로 명시적으로 채택한다.",
  frozenCodeBaseline:
    "commit e386da8(Short-Circuit fix) 이후 production 파일 diff 0건이 이후 6개 Sprint(MCM Production Validation, MCM Validation Methodology Qualification, Protocol Standardization, PARITY Validation Protocol Qualification, Solver Research Closeout, 그리고 이번 Sprint 자신)에서 연속 확인됨 -- 현재 HEAD가 그 고정 코드 상태다.",
  protectedFiles: [
    "fiveByFiveEdgeRecovery.ts",
    "fiveByFiveEdgePlanner.ts",
    "fiveByFiveEdgeExecutor.ts",
    "fiveByFiveEdgeSolverEngine.ts",
    "fiveByFiveEdges.ts",
    "solverPostReleaseValidationFramework/*",
    "모든 Primitive 구현 파일",
  ],
  forbiddenActions: ["Production Solver 수정", "Primitive 수정", "Budget/Scheduler 수정", "Validation Framework 수정"],
  realRunCount: 2,
};
