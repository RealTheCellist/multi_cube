// --- PrimitiveSuggestionGenerator (Primitive Discovery Engine) --------------
// Heuristic research-direction text, by design (spec: "구체적인 알고리즘을
// 만들 필요는 없다. 연구 방향만 제시한다."). The swapPairCount signal
// StateCanonicalizer computes feeds directly into the two most specific
// suggestions here (2-Pair Swap / Cross Insert, matching the spec's own
// worked example) rather than falling back to generic text whenever
// possible -- a direct response to this session's earlier Failure Analysis
// Engine v1 report calling out that its own recommendations were too
// generic.
import type { DiscoveryCluster, GapAnalysis, PrimitiveSuggestion } from "./discoveryTypes";

export function suggestPrimitive(cluster: DiscoveryCluster, gap: GapAnalysis): PrimitiveSuggestion {
  if (!gap.isUnknown) {
    return {
      clusterId: cluster.id,
      suggestion: "기존 Primitive 중 하나가 이 구조의 다른 사례에서 성공한 적 있음 -- 새 Primitive보다는 기존 케이스 라이브러리 확장으로 충분할 가능성이 높음.",
    };
  }

  const sig = cluster.representativeSignature;
  if (sig.swapPairCount > 0) {
    return {
      clusterId: cluster.id,
      suggestion: `이 클러스터는 서로 다른 슬롯 간 교차 색상-스왑 구조(대표 Canonical 기준 ${sig.swapPairCount}쌍)를 갖고 있다 -- 2-Pair Swap 또는 Cross Insert 계열 Primitive 후보로 유력.`,
    };
  }
  if (sig.patternHistogram["flipped-pair"] > 0 && sig.patternHistogram.unpaired === 0) {
    return {
      clusterId: cluster.id,
      suggestion: "잔여 슬롯이 전부 flipped-pair 패턴인데도 기존 FLIP이 이 규모에서 실패 -- 현재 FLIP_ALG가 커버하는 조합 밖일 가능성, Flip 계열 알고리즘의 setup 범위 확장을 검토.",
    };
  }
  if (sig.parity) {
    return {
      clusterId: cluster.id,
      suggestion: "Parity가 있는데도 현재 Case 라이브러리가 매치되지 않음 -- 새로운 Parity 케이스, 또는 더 일반화된 Diagonal-swap 계열 Primitive 추가를 검토.",
    };
  }
  return {
    clusterId: cluster.id,
    suggestion: "뚜렷한 구조적 신호(스왑/플립/패리티) 없음 -- Failure Replay로 대표 상태를 직접 열어 사람이 눈으로 공통 구조를 확인 필요.",
  };
}

export function suggestForAllClusters(clusters: readonly DiscoveryCluster[], gaps: readonly GapAnalysis[]): PrimitiveSuggestion[] {
  return clusters.map((c, i) => suggestPrimitive(c, gaps[i]));
}
