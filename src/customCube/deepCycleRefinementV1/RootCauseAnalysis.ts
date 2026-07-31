// --- RootCauseAnalysis (Solver Primitive Refinement Sprint #2 -- Deep
// Cycle Refinement Sprint v1, STEP6 / Level4) --------------------------------
// Directive: "Capability가 증가한 경우 증가 원인이 Gate 개선/Search 개선 중
// 어디인지 분석한다. 증가하지 않은 경우 왜 증가하지 않았는지 구조적으로
// 분석한다." Reuses numbers STEP2/STEP3 already produced (full-population
// Gap Rescue for the best isolated Gate config and best isolated Search
// Contract config, each measured against baseline while the OTHER axis was
// held fixed) -- no new simulation runs, just attribution over existing
// measurements.
export type RootCause = "GATE_IMPROVEMENT" | "SEARCH_IMPROVEMENT" | "BOTH_CONTRIBUTE" | "PRIMITIVE_LIMITATION";

const NEGLIGIBLE_DELTA = 0.005; // <0.5%p full-population Gap Rescue change counts as "no real contribution" from that axis alone

export interface RootCauseInput {
  baselineGapRescueFull: number;
  bestGateOnlyGapRescueFull: number; // best Gate config (STEP2), Search held at baseline, full population
  bestSearchOnlyGapRescueFull: number; // best Search Contract config (STEP3), Gate held at baseline, full population
  combinedGapRescueFull: number; // STEP4: best Gate + best Search, full population
}

export interface RootCauseResult {
  rootCause: RootCause;
  gateOnlyDelta: number;
  searchOnlyDelta: number;
  combinedDelta: number;
  explanation: string;
}

export function analyzeRootCause(input: RootCauseInput): RootCauseResult {
  const gateOnlyDelta = input.bestGateOnlyGapRescueFull - input.baselineGapRescueFull;
  const searchOnlyDelta = input.bestSearchOnlyGapRescueFull - input.baselineGapRescueFull;
  const combinedDelta = input.combinedGapRescueFull - input.baselineGapRescueFull;

  const gateContributes = gateOnlyDelta > NEGLIGIBLE_DELTA;
  const searchContributes = searchOnlyDelta > NEGLIGIBLE_DELTA;

  let rootCause: RootCause;
  let explanation: string;

  if (combinedDelta <= NEGLIGIBLE_DELTA) {
    rootCause = "PRIMITIVE_LIMITATION";
    explanation = `결합 Candidate(Best Gate+Best Search)도 Baseline 대비 Gap Rescue 개선폭이 ${(combinedDelta * 100).toFixed(2)}%p로 무의미하다 -- Gate 축(${(gateOnlyDelta * 100).toFixed(2)}%p)과 Search Contract 축(${(searchOnlyDelta * 100).toFixed(2)}%p) 모두 단독으로도 개선을 만들지 못했다. 이는 BoundedResolver 알고리즘 자체(DFS 탐색+Deferred Validation 판정 방식)의 구조적 한계로 해석한다 -- Gate나 Search Contract를 더 조정해도 이 30건에서는 근본적인 개선 여지가 없어 보인다.`;
  } else if (gateContributes && !searchContributes) {
    rootCause = "GATE_IMPROVEMENT";
    explanation = `Gate 축 단독 개선(${(gateOnlyDelta * 100).toFixed(2)}%p)이 결합 Candidate의 개선폭(${(combinedDelta * 100).toFixed(2)}%p)을 대부분 설명한다. Search Contract 축 단독 개선은 ${(searchOnlyDelta * 100).toFixed(2)}%p로 무의미했다 -- 개선의 원천은 "어떤 상태를 시도할지"(Gate)이지 "어떻게 탐색할지"(Search Contract)가 아니다.`;
  } else if (searchContributes && !gateContributes) {
    rootCause = "SEARCH_IMPROVEMENT";
    explanation = `Search Contract 축 단독 개선(${(searchOnlyDelta * 100).toFixed(2)}%p)이 결합 Candidate의 개선폭(${(combinedDelta * 100).toFixed(2)}%p)을 대부분 설명한다. Gate 축 단독 개선은 ${(gateOnlyDelta * 100).toFixed(2)}%p로 무의미했다 -- 개선의 원천은 탐색 방식이지 Gate 조건이 아니다.`;
  } else {
    rootCause = "BOTH_CONTRIBUTE";
    explanation = `Gate 축(${(gateOnlyDelta * 100).toFixed(2)}%p)과 Search Contract 축(${(searchOnlyDelta * 100).toFixed(2)}%p) 모두 단독으로 유의미한 개선을 보였다 -- 결합 Candidate(${(combinedDelta * 100).toFixed(2)}%p)의 개선은 두 축의 조합 효과다.`;
  }

  return { rootCause, gateOnlyDelta, searchOnlyDelta, combinedDelta, explanation };
}
