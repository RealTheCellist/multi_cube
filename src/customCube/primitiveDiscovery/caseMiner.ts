// --- CaseMiner (Primitive Discovery Engine) ----------------------------------
// Extracts the shared features of a cluster and names a representative
// snapshot -- since ClusterAnalyzer already guarantees every canonical
// entry in a cluster shares (wrongWingCount, parity), and the cluster's
// representativeSignature additionally carries the (histogram,
// swapPairCount) of its LARGEST canonical shape, this module's job is
// mostly to state those already-guaranteed commonalities in the spec's own
// worked-example format, plus point at one concrete snapshot hash a human
// (or Failure Replay) can load to actually look at the case.
import type { DiscoveryCluster, MinedCase } from "./discoveryTypes";

export function mineCase(cluster: DiscoveryCluster): MinedCase {
  const sig = cluster.representativeSignature;
  const commonFeatures = [
    `WrongWing = ${sig.wrongWingCount}`,
    `Parity = ${sig.parity ? "true" : "false"}`,
    `Pair Layout: Unpaired ${sig.patternHistogram.unpaired} / Flipped-pair ${sig.patternHistogram["flipped-pair"]} / Half-paired ${sig.patternHistogram["half-paired"]} (대표 Canonical 기준)`,
    `Cross-slot Swap 쌍: ${sig.swapPairCount}개`,
    `이 클러스터 내 서로 다른 Canonical 형태: ${cluster.canonicalCount}종`,
  ].join(", ");

  return {
    clusterId: cluster.id,
    representativeHash: cluster.snapshotHashes[0],
    commonFeatures,
  };
}

export function mineAllCases(clusters: readonly DiscoveryCluster[]): MinedCase[] {
  return clusters.map((c) => mineCase(c));
}
