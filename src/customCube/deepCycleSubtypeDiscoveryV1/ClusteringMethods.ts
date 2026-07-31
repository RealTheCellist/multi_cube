// --- ClusteringMethods (Deep Cycle Subtype Discovery Sprint v1, STEP2)
// -------------------------------------------------------------------------
// Three independent, deterministic clustering methods over the 30-case
// Extended Feature set -- same "3-way comparison" discipline
// solverPrimitiveDiscovery4/ClusteringV4.ts already established for the
// broader Hole Dataset (manual taxonomy / feature similarity / graph
// structure), applied here to the narrower Deep Cycle population with
// this Sprint's own richer feature set. Each method is a cheap, disclosed
// bucketing/distance rule -- not a black-box ML library -- so every
// cluster assignment is traceable back to specific feature values.
import type { ExtendedFeatureSet } from "./ExtendedFeatureExtraction";

export interface Cluster {
  key: string;
  memberLabels: string[];
}

function toClusters(assignment: Map<string, string>): Cluster[] {
  const byKey = new Map<string, string[]>();
  for (const [label, key] of assignment) {
    const list = byKey.get(key) ?? [];
    list.push(label);
    byKey.set(key, list);
  }
  return [...byKey.entries()].map(([key, memberLabels]) => ({ key, memberLabels })).sort((a, b) => b.memberLabels.length - a.memberLabels.length);
}

// (a) Manual (structural) Taxonomy -- categorical bucketing over the
// Directive's own named axes, each bucketed coarsely enough that small
// noise doesn't fragment the population into 30 singleton clusters.
export function clusterByStructuralTaxonomy(features: readonly ExtendedFeatureSet[]): Cluster[] {
  const assignment = new Map<string, string>();
  for (const f of features) {
    const cycleCountBucket = f.cycleCount <= 2 ? "2" : f.cycleCount <= 4 ? "3-4" : "5+";
    const cycleLengthBucket = f.cycleLength <= 4 ? "short(<=4)" : "long(5+)";
    const artBucket = f.articulationPointCount === 0 ? "0" : f.articulationPointCount === 1 ? "1" : "2+";
    const key = `cycleCount=${cycleCountBucket}|cycleLength=${cycleLengthBucket}|articulationPoints=${artBucket}|overlap=${f.cycleOverlap}|conflictAdjCycle=${f.conflictAdjacentToCycle}`;
    assignment.set(f.label, key);
  }
  return toClusters(assignment);
}

// (b) Feature Similarity -- deterministic k=2 nearest-seed partition over
// min-max-normalized numeric features. Seeds are the two most mutually
// distant cases (a fixed, reproducible choice, not a random init) --
// disclosed as a SIMPLE single-pass nearest-seed assignment, not full
// iterative k-means/Lloyd's algorithm, matching this Sprint's own scope
// (deciding whether >=2 subtypes exist, not optimally partitioning them).
const NUMERIC_KEYS: (keyof ExtendedFeatureSet)[] = ["cycleCount", "cycleLength", "pairCount", "conflictEdgeCount", "articulationPointCount", "biconnectedComponentCount", "cycleDensity", "pairGraphDensity"];

function normalize(features: readonly ExtendedFeatureSet[]): Map<string, number[]> {
  const ranges = NUMERIC_KEYS.map((k) => {
    const values = features.map((f) => f[k] as number);
    return { min: Math.min(...values), max: Math.max(...values) };
  });
  const vectors = new Map<string, number[]>();
  for (const f of features) {
    const vec = NUMERIC_KEYS.map((k, i) => {
      const { min, max } = ranges[i];
      const v = f[k] as number;
      return max > min ? (v - min) / (max - min) : 0;
    });
    vectors.set(f.label, vec);
  }
  return vectors;
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, ai, i) => sum + (ai - b[i]) ** 2, 0));
}

export function clusterByFeatureSimilarity(features: readonly ExtendedFeatureSet[]): Cluster[] {
  const vectors = normalize(features);
  const labels = [...vectors.keys()];
  if (labels.length < 2) return toClusters(new Map(labels.map((l) => [l, "singleton"])));

  let seedA = labels[0];
  let seedB = labels[1];
  let maxDist = -Infinity;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const d = euclidean(vectors.get(labels[i])!, vectors.get(labels[j])!);
      if (d > maxDist) {
        maxDist = d;
        seedA = labels[i];
        seedB = labels[j];
      }
    }
  }

  const assignment = new Map<string, string>();
  for (const label of labels) {
    const dA = euclidean(vectors.get(label)!, vectors.get(seedA)!);
    const dB = euclidean(vectors.get(label)!, vectors.get(seedB)!);
    assignment.set(label, dA <= dB ? `seedA(${seedA})` : `seedB(${seedB})`);
  }
  return toClusters(assignment);
}

// (c) Graph Topology -- buckets purely on graph-shape features
// (articulation points / biconnected components / cycle overlap),
// deliberately ignoring parity/cycle-length/conflict so this method
// isolates whether graph SHAPE alone already separates the population,
// independent of the other two methods' axes.
export function clusterByGraphTopology(features: readonly ExtendedFeatureSet[]): Cluster[] {
  const assignment = new Map<string, string>();
  for (const f of features) {
    const key = `articulationPoints=${f.articulationPointCount}|biconnectedComponents=${f.biconnectedComponentCount}|overlap=${f.cycleOverlap}`;
    assignment.set(f.label, key);
  }
  return toClusters(assignment);
}

// Pairwise agreement between two clusterings, Rand-Index style: over all
// label pairs, fraction where "same cluster under A" matches "same
// cluster under B" (both same or both different) -- 1.0 = perfect
// agreement, ~0.5 = no better than chance for a 2-cluster split.
export function pairwiseAgreement(a: Cluster[], b: Cluster[]): number {
  const keyOfA = new Map<string, string>();
  for (const c of a) for (const label of c.memberLabels) keyOfA.set(label, c.key);
  const keyOfB = new Map<string, string>();
  for (const c of b) for (const label of c.memberLabels) keyOfB.set(label, c.key);

  const labels = [...keyOfA.keys()];
  let agree = 0;
  let total = 0;
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const sameA = keyOfA.get(labels[i]) === keyOfA.get(labels[j]);
      const sameB = keyOfB.get(labels[i]) === keyOfB.get(labels[j]);
      if (sameA === sameB) agree++;
      total++;
    }
  }
  return total > 0 ? agree / total : 1;
}
