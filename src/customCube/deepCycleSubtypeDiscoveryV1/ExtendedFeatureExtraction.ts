// --- ExtendedFeatureExtraction (Deep Cycle Subtype Discovery Sprint v1,
// STEP1) -----------------------------------------------------------------
// Extends StructuralFeatureExtractionV4's already-computed features
// (reused unmodified) with the Directive's own new structural axes, each
// grounded in a real, disclosed computation -- not fabricated:
//   dependencyDepth  -> no literal "dependency depth" feature exists
//                       anywhere in this codebase (same disclosure as
//                       deepCycleRefinementV1/GateSweepSimulator.ts); this
//                       Sprint reuses cycleCount as that same proxy, plus
//                       ADDS cycleLength(longest) as a second, independent
//                       axis (count vs length are different dimensions).
//   cycleOverlap / cycleDensity / conflictAdjacentToCycle / pairGraphDensity
//                    -> GraphTopologyAnalysis.ts, built on the real WANTS
//                       graph (buildStateGraph, unmodified).
//   articulationPoint / biconnectedComponent -> same file, standard
//                       Tarjan's algorithm over that real graph.
//   bridgeAdjacency / shortestBridgeLength -> NOT computed. Disclosed:
//                       this Sprint's own 30-case population is, BY
//                       CONSTRUCTION, the Deep Cycle Primary Cluster,
//                       whose defining clusterKey condition is
//                       `bridge=false` (componentCount===1) for all 30
//                       members -- i.e. a single connected component,
//                       always. "Bridge adjacency"/"shortest bridge
//                       length" describe cross-component structure, which
//                       is Bridge Injection's domain (already investigated
//                       in bridgeInjectionRefinementV1/), not this
//                       population's. Computing them here would return a
//                       constant (0 / N/A) for all 30 cases and add no
//                       information -- faking a non-constant feature would
//                       be worse than omitting it.
//   parityInvolvement -> StructuralFeatureSetV4.parityState, reused.
import type { TaggedCase } from "../deepCycleRefinementV1/TargetPopulation";
import { computeGraphTopology, type GraphTopologyFeatures } from "./GraphTopologyAnalysis";

export interface ExtendedFeatureSet extends GraphTopologyFeatures {
  label: string;
  cycleCount: number; // dependencyDepth proxy (disclosed above)
  cycleLength: number; // longest cycle length -- independent axis from cycleCount
  pairCount: number;
  conflictEdgeCount: number;
  parityState: boolean; // parityInvolvement
}

export function extractExtendedFeatures(tc: TaggedCase): ExtendedFeatureSet {
  const topology = computeGraphTopology(tc.hole.cubies);
  return {
    label: tc.hole.label,
    cycleCount: tc.features.cycleCount,
    cycleLength: tc.features.cycleLength,
    pairCount: tc.features.pairCount,
    conflictEdgeCount: tc.features.conflictEdgeCount,
    parityState: tc.features.parityState,
    ...topology,
  };
}

export function extractAllExtendedFeatures(cases: readonly TaggedCase[]): ExtendedFeatureSet[] {
  return cases.map(extractExtendedFeatures);
}
