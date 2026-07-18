// --- WantsGraphReview (Solver v3 Research Kickoff Sprint v1) -------------
// STEP4: a grounded KEEP/REPLACE recommendation for
// capabilityAnalysis/stateGraphBuilder.ts's WANTS Graph (existing,
// unmodified, reused everywhere in this project since Capability Analysis
// Engine v1). Synthesizes STEP2 (StateRepresentationCandidates.ts) and
// STEP3 (PrimitiveCapabilityGapReport.ts) findings -- no new computation,
// only interpretation of already-measured real numbers.
import type { StateRepresentationComparison } from "./StateRepresentationCandidates";
import type { PrimitiveCapabilityGapFindings } from "./PrimitiveCapabilityGapReport";

export type WantsGraphVerdict = "KEEP" | "REPLACE" | "KEEP_WITH_COARSER_GRAIN";

export interface WantsGraphRecommendation {
  verdict: WantsGraphVerdict;
  reasoning: string;
  evidence: string[];
}

export function reviewWantsGraph(representations: StateRepresentationComparison, gapFindings: PrimitiveCapabilityGapFindings): WantsGraphRecommendation {
  const { baseline, coarseShape, capabilityFingerprint } = representations;
  const { rescuedGroup, stillHardGroup } = gapFindings;

  const evidence: string[] = [
    `Coarse Structural Shape(WANTS Graph 그대로 사용, 구간만 조정)의 재등장률 ${(coarseShape.reentryRate * 100).toFixed(1)}%는 BP-4의 정밀 Shape Key(${(baseline.reentryRate * 100).toFixed(1)}%)보다 훨씬 높다 -- 그래프 구조 자체가 아니라 그것을 소비하는 grain이 지나치게 세밀했던 것이 BP-4 실패의 원인이었음을 시사.`,
    `Capability Fingerprint(구조를 아예 버리고 능력 성공/실패로만 군집화)는 재등장률이 가장 높지만(${(capabilityFingerprint.reentryRate * 100).toFixed(1)}%), 여전히 풀리지 않는 상태는 전부 동일한 "000000000" 지문 하나로 뭉쳐 그 이상 구분하지 못한다 -- 새 Primitive를 설계하려는 목적에는 오히려 정보량이 0에 가깝다.`,
    `WANTS Graph 파생 지표(Cycle 개수/최장 Cycle 길이/Conflict 엣지 수)는 "BP-1/2/3로 구제된 그룹"과 "여전히 Hard Gap인 그룹" 사이에 실측으로 뚜렷한 차이를 보인다: 평균 Cycle 개수 ${rescuedGroup.avgCycleCount.toFixed(2)} vs ${stillHardGroup.avgCycleCount.toFixed(2)}, 평균 최장 Cycle 길이 ${rescuedGroup.avgLongestCycleLength.toFixed(2)} vs ${stillHardGroup.avgLongestCycleLength.toFixed(2)}, 평균 Conflict 엣지 수 ${rescuedGroup.avgConflictEdgeCount.toFixed(2)} vs ${stillHardGroup.avgConflictEdgeCount.toFixed(2)} -- 그래프가 실제로 두 그룹을 구분해내는 신호를 담고 있다는 뜻이다.`,
  ];

  return {
    verdict: "KEEP_WITH_COARSER_GRAIN",
    reasoning:
      "WANTS Graph 구조 자체는 유지한다. BP-4의 실패는 그래프가 무의미해서가 아니라, 그 출력을 정밀한 exact-match Key로 소비한 것이 75개 표본에 비해 지나치게 세밀했기 때문이다 (STEP2). 반면 Capability Fingerprint처럼 구조를 완전히 버리는 대안은 재등장률은 높지만 남은 Hard Gap을 전부 하나로 뭉개 새 Primitive 설계에 필요한 구분력을 잃는다. WANTS Graph 파생 지표는 실제로 '구제 가능' 그룹과 '여전히 어려운' 그룹을 구분하는 real signal을 담고 있다 (STEP3). 따라서 그래프 구조는 유지하되, 그것을 소비하는 State Representation은 STEP2의 Coarse Structural Shape처럼 더 거친 grain으로 바꿔야 한다.",
    evidence,
  };
}
