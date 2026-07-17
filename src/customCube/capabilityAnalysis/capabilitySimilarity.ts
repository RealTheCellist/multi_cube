// --- Capability Similarity (Capability Analysis Engine v1) ------------------
// Compares two clusters' MISSING-capability sets (from CapabilityGapAnalyzer)
// via exact Jaccard overlap -- a real, computed set-similarity metric, not a
// fabricated percentage. Two clusters with identical missing-capability sets
// score 100; disjoint sets score 0.
import type { CapabilityGap, CapabilitySimilarityPair } from "./capabilityTypes";

function jaccard(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 100;
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 100 : Math.round((intersection / union) * 100);
}

export function computeSimilarityPairs(gaps: readonly CapabilityGap[], threshold = 50): CapabilitySimilarityPair[] {
  const pairs: CapabilitySimilarityPair[] = [];
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i].missingCapabilities.length === 0) continue;
    for (let j = i + 1; j < gaps.length; j++) {
      if (gaps[j].missingCapabilities.length === 0) continue;
      const similarity = jaccard(gaps[i].missingCapabilities, gaps[j].missingCapabilities);
      if (similarity >= threshold) pairs.push({ clusterA: gaps[i].clusterId, clusterB: gaps[j].clusterId, similarity });
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

/** Union-find over similarity pairs -- groups of cluster IDs whose missing
 * capabilities are similar enough to plausibly need the SAME new
 * Primitive (spec: "비슷한 Cluster는 자동 병합한다"). */
export function mergeSimilarClusters(clusterIds: readonly number[], pairs: readonly CapabilitySimilarityPair[]): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of clusterIds) find(id);
  for (const p of pairs) union(p.clusterA, p.clusterB);

  const groups = new Map<number, number[]>();
  for (const id of clusterIds) {
    const root = find(id);
    const list = groups.get(root) ?? [];
    list.push(id);
    groups.set(root, list);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}
