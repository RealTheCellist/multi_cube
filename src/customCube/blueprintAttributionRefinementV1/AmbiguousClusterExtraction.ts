// --- AmbiguousClusterExtraction (Solver Primitive Discovery Sprint #4 --
// Blueprint Attribution Refinement Sprint v1, STEP1) -------------------------
// Loads Discovery Sprint #4's own already-computed result JSON (unmodified
// -- that Sprint's own results are read-only input here, not recomputed)
// and extracts exactly the 28 clusters it marked AMBIGUOUS. No new solve()
// calls, no re-clustering -- this Sprint disambiguates an existing result,
// it does not redo Discovery.
import * as fs from "fs";

const DISCOVERY4_RESULT_PATH = "src/customCube/solverPrimitiveDiscovery4/data/solver-primitive-discovery-4-v1-result.json";

export interface ClusterBlueprintMappingLite {
  clusterKey: string;
  size: number;
  matchRatesByBlueprint: Record<string, number>;
  bestMatch: string | null;
  bestMatchRate: number;
  verdict: "VARIANT_OF_EXISTING" | "NEW_MECHANISM_NEEDED" | "AMBIGUOUS";
}

export interface FeatureSimilarityClusterLite {
  key: string;
  memberLabels: string[];
  size: number;
}

export interface Discovery4Result {
  blueprintMappings: ClusterBlueprintMappingLite[];
  clustering: { featureSimilarity: FeatureSimilarityClusterLite[] };
}

export function loadDiscovery4Result(path: string = DISCOVERY4_RESULT_PATH): Discovery4Result {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

export interface AmbiguousCluster {
  clusterKey: string;
  size: number;
  memberLabels: string[];
  tiedBlueprints: string[]; // blueprints with matchRatesByBlueprint===1 for this cluster
  matchRatesByBlueprint: Record<string, number>;
}

export function extractAmbiguousClusters(result: Discovery4Result): AmbiguousCluster[] {
  const clustersByKey = new Map(result.clustering.featureSimilarity.map((c) => [c.key, c]));
  return result.blueprintMappings
    .filter((m) => m.verdict === "AMBIGUOUS")
    .map((m) => {
      const cluster = clustersByKey.get(m.clusterKey);
      const tiedBlueprints = Object.entries(m.matchRatesByBlueprint)
        .filter(([, rate]) => rate === 1)
        .map(([name]) => name);
      return {
        clusterKey: m.clusterKey,
        size: m.size,
        memberLabels: cluster?.memberLabels ?? [],
        tiedBlueprints,
        matchRatesByBlueprint: m.matchRatesByBlueprint,
      };
    });
}
