// --- ClusteringV4 (Solver Primitive Discovery Sprint #4 -- State Taxonomy
// Sprint v1, STEP4) -----------------------------------------------------------
// Clusters the Completely-Unknown Hole subset three different ways, per
// the Directive's own "최소 비교" requirement, using the same categorical
// composite-key grouping idiom this codebase already established
// (coverageAtlas/DeadStateClusterAnalysis.ts's clusterDeadStates) rather
// than introducing a new distance-based algorithm (no standalone
// k-means/similarity utility exists in this codebase to reuse -- see this
// Sprint's own research phase).
//
//   Manual Taxonomy    -- groups by the existing, unmodified 4-class
//                         TaxonomyClass (stateTaxonomy/TaxonomyMapper.ts,
//                         computed per-case by CaseTaxonomyClassifier.ts).
//   Feature Similarity -- groups by a composite bucketed key over ALL 12
//                         extracted features (this Sprint's own
//                         StructuralFeatureExtractionV4.ts).
//   Graph Structure    -- groups by ONLY the raw WANTS-graph shape
//                         (componentCount, cycleLength bucket, parity) --
//                         deliberately narrower than Feature Similarity
//                         (excludes conflictEdgeCount/swapEdgeCount/
//                         mutualLockCount) to see whether graph shape ALONE
//                         already explains the same groupings.
import type { StructuralFeatureSetV4 } from "./StructuralFeatureExtractionV4";

export interface ClusterV4 {
  key: string;
  memberLabels: string[];
  size: number;
}

// Same bucket cut this arc has used since Coverage Hole Discovery Sprint
// v1 (DeadStateClusterAnalysis.ts's cycleLengthBucket) -- not a new
// threshold invented for this Sprint.
function cycleLengthBucket(n: number): string {
  if (n === 0) return "none";
  if (n === 2) return "swap(2)";
  if (n <= 4) return "short(3-4)";
  return "long(5+)";
}

function wrongWingBucket(n: number): string {
  if (n <= 2) return "1-2";
  if (n <= 4) return "3-4";
  if (n <= 8) return "5-8";
  return "9+";
}

function groupByKey(features: readonly StructuralFeatureSetV4[], keyFn: (f: StructuralFeatureSetV4) => string): ClusterV4[] {
  const groups = new Map<string, string[]>();
  for (const f of features) {
    const key = keyFn(f);
    const list = groups.get(key) ?? [];
    list.push(f.label);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, memberLabels]) => ({ key, memberLabels, size: memberLabels.length }))
    .sort((a, b) => b.size - a.size);
}

export function clusterByManualTaxonomy(features: readonly StructuralFeatureSetV4[]): ClusterV4[] {
  return groupByKey(features, (f) => f.taxonomyClass);
}

export function clusterByFeatureSimilarity(features: readonly StructuralFeatureSetV4[]): ClusterV4[] {
  return groupByKey(
    features,
    (f) =>
      `parity=${f.parityState}|cycle=${cycleLengthBucket(f.cycleLength)}|cycleCount=${f.cycleCount}|conflict=${f.conflictEdgeCount > 0}|swap=${f.swapEdgeCount > 0}|bridge=${f.disconnectedGraph}|deferred=${f.deferredViolation}|wrongWing=${wrongWingBucket(f.wrongWingCount)}`
  );
}

export function clusterByGraphStructure(features: readonly StructuralFeatureSetV4[]): ClusterV4[] {
  return groupByKey(features, (f) => `component=${f.componentCount}|cycle=${cycleLengthBucket(f.cycleLength)}|parity=${f.parityState}`);
}

export interface ClusteringComparison {
  manualTaxonomy: ClusterV4[];
  featureSimilarity: ClusterV4[];
  graphStructure: ClusterV4[];
}

export function compareClusterings(features: readonly StructuralFeatureSetV4[]): ClusteringComparison {
  return {
    manualTaxonomy: clusterByManualTaxonomy(features),
    featureSimilarity: clusterByFeatureSimilarity(features),
    graphStructure: clusterByGraphStructure(features),
  };
}
