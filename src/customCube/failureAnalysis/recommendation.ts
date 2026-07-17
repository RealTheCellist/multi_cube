// --- Primitive Recommendation (Failure Analysis Engine v1) ------------------
// Heuristic, by design (spec: "추천은 휴리스틱이어도 된다") -- this is a
// human-readable hint about WHERE to look, not a generated algorithm.
import type { ClusterRecommendation, FailureCluster, FailureSnapshot } from "./failureTypes";

function recommendationText(cluster: FailureCluster, sample: FailureSnapshot | undefined): string {
  if (!sample) return "표본 없음 -- 추천 불가";

  const attemptedPrimitives = new Set(sample.primitiveAttempts.map((a) => a.primitive));
  const everSucceeded = sample.primitiveAttempts.some((a) => a.succeeded);

  if (!everSucceeded && cluster.commonParity === true) {
    return "이 클러스터는 Parity가 있는데도 기존 PARITY 케이스 라이브러리가 전혀 매치되지 않았다 -- 새로운 Parity 케이스(또는 더 일반화된 Diagonal-swap 계열) 추가를 우선 검토.";
  }
  if (!everSucceeded && cluster.commonParity === false && (cluster.commonWrongWingCount ?? 99) <= 4) {
    return "Parity 없이 소수(4개 이하)만 남았는데 BASE/FLIP/ENDGAME/RECOVERY 전부 실패 -- 현재 BFS 기반 setup 탐색이 도달 못 하는 조합. 새로운 Edge Swap 계열 Primitive(예: 3-cycle 이상을 한 번에 처리하는 알고리즘) 후보로 유력.";
  }
  if (attemptedPrimitives.has("RECOVERY") && !sample.recoverySucceeded) {
    return "Recovery(Disruption/Setup)까지 시도했지만 실패 -- 현재 라이브러리가 알고 있는 교란 패턴 밖의 상태일 가능성. 이 클러스터의 remainingEdges 조합을 직접 살펴보고 전용 알고리즘을 유도해볼 것.";
  }
  return "공통 특징이 뚜렷하지 않음 -- 개별 샘플을 Failure Replay로 직접 확인 필요.";
}

export function recommendForCluster(cluster: FailureCluster, allSnapshots: readonly FailureSnapshot[]): ClusterRecommendation {
  const byHash = new Map(allSnapshots.map((s) => [s.hash, s]));
  const sample = byHash.get(cluster.hashes[0]);
  return {
    clusterId: cluster.id,
    size: cluster.size,
    commonFeatures: cluster.description,
    recommendation: recommendationText(cluster, sample),
  };
}

export function recommendForAllClusters(clusters: readonly FailureCluster[], allSnapshots: readonly FailureSnapshot[]): ClusterRecommendation[] {
  return clusters.map((c) => recommendForCluster(c, allSnapshots));
}
