// --- TargetPopulation (Solver Primitive Refinement Sprint #2 -- Deep
// Cycle Refinement Sprint v1, shared setup) ----------------------------------
// Loads the same 142-case Hole Dataset (raw-dataset-v4-holes.json,
// unmodified) used throughout this whole Refinement track, and tags each
// case with whether it belongs to the "Deep Cycle (BP-1/REPAIR)" Primary
// Cluster -- extracted directly from Blueprint Attribution Refinement
// Sprint v1's OWN resolved output
// (blueprintAttributionRefinementV1/data/blueprint-attribution-refinement-v1-result.json,
// read unmodified, not recomputed): the 8 resolved-ambiguous clusters whose
// `primaryAttribution === "Deep Cycle (BP-1/REPAIR)"`, 30 cases total. This
// mirrors bridgeInjectionRefinementV1/TargetPopulation.ts's own "extract by
// membership, don't re-derive" discipline.
import * as fs from "fs";
import { loadRawHoleDataset } from "../mechanismAnalysis/RawDatasetLoader";
import { extractFeatures, type StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { HoleCase, HoleCaseV4 } from "../solverPrimitiveDiscovery4/HoleCollectionV4";

export const RAW_DATASET_V4_PATH = "src/customCube/solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json";
export const BLUEPRINT_ATTRIBUTION_RESULT_PATH = "src/customCube/blueprintAttributionRefinementV1/data/blueprint-attribution-refinement-v1-result.json";
const DEEP_CYCLE_BLUEPRINT_NAME = "Deep Cycle (BP-1/REPAIR)";

interface AmbiguousClusterRecord {
  clusterKey: string;
  memberLabels: string[];
}
interface ResolutionRecord {
  clusterKey: string;
  primaryAttribution: string;
}
interface BlueprintAttributionResult {
  ambiguousClusters: AmbiguousClusterRecord[];
  resolutions: ResolutionRecord[];
}

// Extracted once, exported so the driver/doc can report the exact label
// set this Sprint targeted.
export function loadDeepCyclePrimaryClusterLabels(path: string = BLUEPRINT_ATTRIBUTION_RESULT_PATH): Set<string> {
  const raw: BlueprintAttributionResult = JSON.parse(fs.readFileSync(path, "utf-8"));
  const deepCycleClusterKeys = new Set(raw.resolutions.filter((r) => r.primaryAttribution === DEEP_CYCLE_BLUEPRINT_NAME).map((r) => r.clusterKey));
  const labels = new Set<string>();
  for (const cluster of raw.ambiguousClusters) {
    if (deepCycleClusterKeys.has(cluster.clusterKey)) {
      for (const label of cluster.memberLabels) labels.add(label);
    }
  }
  return labels;
}

export interface TaggedCase {
  hole: HoleCase;
  features: StructuralFeatureSetV4;
  isDeepCycleTarget: boolean;
}

export function loadTargetPopulation(datasetPath: string = RAW_DATASET_V4_PATH, attributionPath: string = BLUEPRINT_ATTRIBUTION_RESULT_PATH): TaggedCase[] {
  const targetLabels = loadDeepCyclePrimaryClusterLabels(attributionPath);
  const holes = loadRawHoleDataset(datasetPath) as unknown as HoleCaseV4[];
  return holes.map((hole) => {
    const features = extractFeatures(hole);
    return { hole, features, isDeepCycleTarget: targetLabels.has(hole.label) };
  });
}

export function splitPopulation(cases: readonly TaggedCase[]): { target: TaggedCase[]; rest: TaggedCase[] } {
  return { target: cases.filter((c) => c.isDeepCycleTarget), rest: cases.filter((c) => !c.isDeepCycleTarget) };
}
