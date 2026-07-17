// --- ClusterAnalyzer (Primitive Discovery Engine) ---------------------------
// Two levels, matching spec's own report flow ("실패 상태 482 -> Canonical
// 91 -> Cluster 8"): first collapse raw failures down to distinct
// CanonicalSignatures (exact-shape dedup), then group THOSE into broader
// (wrongWingCount, parity) buckets for reporting -- coarser than exact
// canonical identity, since many distinct canonical shapes at the same
// severity/parity are still worth analyzing together.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { computeCanonicalSignature } from "./stateCanonicalizer";
import type { CanonicalEntry, DiscoveryCluster } from "./discoveryTypes";

export function canonicalizeAll(snapshots: readonly FailureSnapshot[]): CanonicalEntry[] {
  const byHash = new Map<string, CanonicalEntry>();
  for (const s of snapshots) {
    const signature = computeCanonicalSignature(s);
    const entry = byHash.get(signature.hash) ?? { signature, snapshotHashes: [] };
    entry.snapshotHashes.push(s.hash);
    byHash.set(signature.hash, entry);
  }
  return [...byHash.values()];
}

export function clusterCanonicalEntries(entries: readonly CanonicalEntry[]): DiscoveryCluster[] {
  const groups = new Map<string, CanonicalEntry[]>();
  for (const e of entries) {
    const key = `w${e.signature.wrongWingCount}|p${e.signature.parity ? 1 : 0}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const clusters: DiscoveryCluster[] = [];
  let id = 1;
  for (const [key, list] of groups) {
    const snapshotHashes = list.flatMap((e) => e.snapshotHashes);
    const representative = [...list].sort((a, b) => b.snapshotHashes.length - a.snapshotHashes.length)[0];
    clusters.push({
      id: id++,
      key,
      wrongWingCount: representative.signature.wrongWingCount,
      parity: representative.signature.parity,
      canonicalCount: list.length,
      size: snapshotHashes.length,
      snapshotHashes,
      representativeSignature: representative.signature,
    });
  }
  return clusters.sort((a, b) => b.size - a.size);
}
