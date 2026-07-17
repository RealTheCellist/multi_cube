// --- ExpansionAnalysis (Coverage Expansion Sprint v1) -----------------------
// Spec STEP 3: for each observed inactivity cause, what (if anything) could
// plausibly raise Coverage -- grounded in the REAL tally from
// CoverageBreakdown.ts, not assumed in the abstract.
import type { CoverageBreakdownResult } from "./CoverageBreakdown";

export interface CauseAnalysis {
  cause: string;
  count: number;
  expansionIdea: string;
  testedInSimulation: boolean;
}

export function analyzeExpansionPotential(breakdown: CoverageBreakdownResult): CauseAnalysis[] {
  const t = breakdown.causeTally;
  return [
    {
      cause: "FIRST_HOP_FAIL",
      count: t.FIRST_HOP_FAIL,
      expansionIdea:
        "4+ 길이 Cycle은 감지됐지만 고정된 시작 slot(사전순 최소)에서 tryFixWing()이 즉시 실패한다. " +
        "같은 Cycle의 다른 멤버부터 시작을 시도하면(alternateStart) 그중 하나는 성공할 가능성이 있다.",
      testedInSimulation: true,
    },
    {
      cause: "ONLY_3_CYCLE",
      count: t.ONLY_3_CYCLE,
      expansionIdea:
        "이미 tryFixWing() 자체가 3-cycle까지는 한 번의 호출로 처리하므로, CycleChase의 최소 길이 조건을 " +
        "4에서 3으로 낮추면(minimumCycleLength) 이 케이스들도 활성화될 수 있다 -- 다만 tryFixWing() 자체가 " +
        "이미 다루는 영역이라 CycleChase가 하는 일이 사실상 없거나(즉시 성공) 중복될 가능성도 있다.",
      testedInSimulation: true,
    },
    {
      cause: "BROKEN_BY_PARITY",
      count: t.BROKEN_BY_PARITY,
      expansionIdea:
        "체인이 일부 진행됐지만 순 개선이 없었고 Parity가 남아있는 경우 -- Cycle을 쫓기 전에 PARITY " +
        "Primitive를 한 번 먼저 시도하면(parityPreTry) 상태가 바뀌어 이후 Cycle chase가 더 잘 통할 가능성이 있다.",
      testedInSimulation: true,
    },
    {
      cause: "INSUFFICIENT_PAIR",
      count: t.INSUFFICIENT_PAIR,
      expansionIdea:
        "체인이 일부 진행됐지만 순 개선이 없었고 Parity와 무관한 경우 -- tryFixWing() 자체의 도너 매칭 로직을 " +
        "손대야 근본적으로 해결되는데, 이는 이번 Sprint의 보호 대상(fiveByFiveEdges.ts)이라 시뮬레이션 대상에서 " +
        "제외한다. 낮은 위험으로 확장할 뚜렷한 방법이 없다는 것 자체가 이 원인의 결론이다.",
      testedInSimulation: false,
    },
    {
      cause: "NO_WANTS_CYCLE",
      count: t.NO_WANTS_CYCLE,
      expansionIdea:
        "WANTS-Cycle 자체가 없는 상태 -- CycleChase는 구조적으로 적용 불가능하다. 조건을 아무리 조정해도 " +
        "Cycle이 없는 상태에서는 활성화될 수 없으므로 시뮬레이션 대상에서 제외한다 (CycleChase의 명확한 한계).",
      testedInSimulation: false,
    },
    {
      cause: "UNKNOWN",
      count: t.UNKNOWN,
      expansionIdea: "분류 불가 -- 별도 조사가 필요하며 이번 Sprint의 시뮬레이션 대상에서 제외한다.",
      testedInSimulation: false,
    },
  ];
}
