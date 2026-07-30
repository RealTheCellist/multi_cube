// --- BlueprintMappingV4 (Solver Primitive Discovery Sprint #4 -- State
// Taxonomy Sprint v1, STEP5) -------------------------------------------------
// For each Feature-Similarity cluster (ClusteringV4.clusterByFeatureSimilarity),
// checks what fraction of its members satisfy each EXISTING Blueprint's own
// disclosed structural precondition, to distinguish "variant of an existing
// mechanism" from "genuinely new mechanism needed." Preconditions cited
// from this arc's own already-built Blueprint/Gate code, not invented:
//
//   Deep Cycle (BP-1 / production REPAIR)
//     -- solverV2Prototype/BoundedResolver.ts's own MIN_CYCLE_LENGTH=4 gate
//        + componentCount===1 (single WANTS-graph component) + no conflict.
//   CCR (Clean-Cycle Resolution)
//     -- solverPrimitiveCCRPrototype/CCRGate.ts's own gate: componentCount===1
//        && conflictEdgeCount===0, isolated single cycle length 4-6.
//   Multi-Hop Bridge (short-cycle variant of BP-1)
//     -- solverPrimitivePrototype/MultiHopBridgePrototype.ts's own restriction:
//        same single-component/no-conflict shape as BP-1, but cycle length
//        BELOW BP-1's MIN_CYCLE_LENGTH gate (2-3) -- exactly this Sprint's
//        own `deferredViolation` feature.
//   Bridge Injection (multi-component variant)
//     -- disconnectedGraph===true (componentCount>1) -- CycleIsolationSubtypes.ts's
//        own "BRIDGE_MISSING" precondition.
//   Conflict-Breaking Sacrifice
//     -- solverPrimitivePrototype/ConflictDominantSacrificePrototype.ts's own
//        precondition: a CONFLICT edge with no cycle (conflictEdgeCount>0,
//        cycleCount===0) -- same shape as CaseTaxonomyClassifier's own
//        CONFLICT_DOMINANT taxonomy class.
//   Parity-Cycle Specialist (BP-2)
//     -- solverV2PrototypeBP2/ParityAwareResolver.ts's own precondition:
//        parityState===true && cycleCount>0.
import type { ClusterV4 } from "./ClusteringV4";
import type { StructuralFeatureSetV4 } from "./StructuralFeatureExtractionV4";

export type BlueprintName = "Deep Cycle (BP-1/REPAIR)" | "CCR" | "Multi-Hop Bridge" | "Bridge Injection" | "Conflict-Breaking Sacrifice" | "Parity-Cycle Specialist (BP-2)";

const BLUEPRINT_PRECONDITIONS: Record<BlueprintName, (f: StructuralFeatureSetV4) => boolean> = {
  "Deep Cycle (BP-1/REPAIR)": (f) => f.cycleCount > 0 && f.cycleLength >= 4 && f.componentCount === 1 && f.conflictEdgeCount === 0,
  CCR: (f) => f.componentCount === 1 && f.conflictEdgeCount === 0 && f.cycleCount === 1 && f.cycleLength >= 4 && f.cycleLength <= 6,
  "Multi-Hop Bridge": (f) => f.componentCount === 1 && f.conflictEdgeCount === 0 && f.deferredViolation,
  "Bridge Injection": (f) => f.disconnectedGraph,
  "Conflict-Breaking Sacrifice": (f) => f.conflictEdgeCount > 0 && f.cycleCount === 0,
  "Parity-Cycle Specialist (BP-2)": (f) => f.parityState && f.cycleCount > 0,
};

export interface ClusterBlueprintMapping {
  clusterKey: string;
  size: number;
  matchRatesByBlueprint: Record<BlueprintName, number>; // fraction (0-1) of members satisfying each precondition
  bestMatch: BlueprintName | null;
  bestMatchRate: number;
  verdict: "VARIANT_OF_EXISTING" | "NEW_MECHANISM_NEEDED" | "AMBIGUOUS";
}

const MAJORITY_THRESHOLD = 0.5; // disclosed: a clear majority of a cluster's members must satisfy a Blueprint's precondition to call it "a variant," not a new invented bar

export function mapClusterToBlueprints(cluster: ClusterV4, featuresByLabel: Map<string, StructuralFeatureSetV4>): ClusterBlueprintMapping {
  const members = cluster.memberLabels.map((l) => featuresByLabel.get(l)).filter((f): f is StructuralFeatureSetV4 => f !== undefined);
  const matchRatesByBlueprint = {} as Record<BlueprintName, number>;
  for (const [name, pred] of Object.entries(BLUEPRINT_PRECONDITIONS) as [BlueprintName, (f: StructuralFeatureSetV4) => boolean][]) {
    matchRatesByBlueprint[name] = members.length ? members.filter(pred).length / members.length : 0;
  }

  let bestMatch: BlueprintName | null = null;
  let bestMatchRate = 0;
  for (const [name, rate] of Object.entries(matchRatesByBlueprint) as [BlueprintName, number][]) {
    if (rate > bestMatchRate) {
      bestMatch = name;
      bestMatchRate = rate;
    }
  }

  const aboveThresholdCount = Object.values(matchRatesByBlueprint).filter((r) => r >= MAJORITY_THRESHOLD).length;
  let verdict: ClusterBlueprintMapping["verdict"];
  if (bestMatchRate < MAJORITY_THRESHOLD) verdict = "NEW_MECHANISM_NEEDED";
  else if (aboveThresholdCount > 1) verdict = "AMBIGUOUS";
  else verdict = "VARIANT_OF_EXISTING";

  return { clusterKey: cluster.key, size: cluster.size, matchRatesByBlueprint, bestMatch, bestMatchRate, verdict };
}

export function mapAllClusters(clusters: readonly ClusterV4[], features: readonly StructuralFeatureSetV4[]): ClusterBlueprintMapping[] {
  const featuresByLabel = new Map(features.map((f) => [f.label, f]));
  return clusters.map((c) => mapClusterToBlueprints(c, featuresByLabel));
}
