// --- TargetPopulation (Solver Primitive Refinement Sprint #1 -- Bridge
// Injection Refinement Sprint v1, shared setup) ------------------------------
// Loads the same 142-case Hole Dataset Discovery Sprint #4 / Blueprint
// Attribution Refinement Sprint v1 used (raw-dataset-v4-holes.json,
// unmodified, no re-measurement) and tags each case with whether it
// belongs to the "Bridge Injection" target cluster (disconnectedGraph===
// true, componentCount>1) -- the 50-case, Priority-1 cluster from
// blueprintAttributionRefinementV1's own Blueprint Priority ranking.
//
// Disclosed terminology note (carried over honestly, not silently
// dropped): Discovery Sprint #4's own "Bridge Injection" Blueprint
// precondition was ONLY `disconnectedGraph` -- no cycle requirement at
// all. The only real, already-built prototype code this Sprint can
// actually refine is MultiHopBridgePrototype.ts (a short-cycle,
// analyzeMultiCycle-based mechanism that does NOT check componentCount at
// all -- pickLongestCycle just returns the graph's longest cycle
// wherever it is). So "refining Bridge Injection's Gate" concretely means
// testing whether MultiHopBridgePrototype's existing cycle-based
// mechanism, run un-gated on componentCount, already reaches some of the
// 50 disconnectedGraph=true cases (if their longest cycle happens to sit
// within one still-connected part of the graph) -- not inventing a new
// "sacrifice a piece to connect two components" move, which was never
// actually implemented as a distinct Primitive anywhere in this arc.
import { loadRawHoleDataset } from "../mechanismAnalysis/RawDatasetLoader";
import { extractFeatures, type StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { HoleCase, HoleCaseV4 } from "../solverPrimitiveDiscovery4/HoleCollectionV4";

export const RAW_DATASET_V4_PATH = "src/customCube/solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json";

export interface TaggedCase {
  hole: HoleCase;
  features: StructuralFeatureSetV4;
  isBridgeInjectionTarget: boolean; // disconnectedGraph===true
}

export function loadTargetPopulation(path: string = RAW_DATASET_V4_PATH): TaggedCase[] {
  const holes = loadRawHoleDataset(path) as unknown as HoleCaseV4[];
  return holes.map((hole) => {
    const features = extractFeatures(hole);
    return { hole, features, isBridgeInjectionTarget: features.disconnectedGraph };
  });
}

export function splitPopulation(cases: readonly TaggedCase[]): { target: TaggedCase[]; rest: TaggedCase[] } {
  return { target: cases.filter((c) => c.isBridgeInjectionTarget), rest: cases.filter((c) => !c.isBridgeInjectionTarget) };
}
