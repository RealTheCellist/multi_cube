// --- CounterfactualAttribution (Solver Primitive Discovery Sprint #4 --
// Blueprint Attribution Refinement Sprint v1, STEP3) -------------------------
// Resolves each ambiguous cluster's tied Blueprints down to a single
// Primary Attribution using GlobalSpecificityAnalysis's specificity
// ranking: among the tied candidates, prefer the Blueprint whose FULL
// precondition matches the SMALLEST fraction of the whole 142-population
// (most restrictive/specific -- least likely to be a coincidental
// overlap), tie-broken by which precondition has MORE atomic conditions
// (a more specific claim), and finally by name for determinism.
//
// MARGIN_THRESHOLD flags clusters where the top-2 candidates' specificity
// scores are too close to call confidently -- disclosed as "marginal"
// rather than silently picking a winner, matching this arc's own
// self-correction discipline (never present a forced tie-break as a
// confident result).
import type { AmbiguousCluster } from "./AmbiguousClusterExtraction";
import type { BlueprintGlobalSpecificity } from "./GlobalSpecificityAnalysis";

export const MARGIN_THRESHOLD = 0.05; // disclosed: if top-2 specificity scores differ by less than this, flag as marginal rather than confidently resolved

export interface ResolvedAttribution {
  clusterKey: string;
  size: number;
  tiedBlueprints: string[];
  ranked: { name: string; specificity: number; conditionCount: number }[];
  primaryAttribution: string;
  primarySpecificity: number;
  runnerUp: string | null;
  runnerUpSpecificity: number | null;
  margin: number | null; // primarySpecificity - runnerUpSpecificity
  marginal: boolean;
}

export function resolveClusterAttribution(cluster: AmbiguousCluster, specificityByName: Map<string, BlueprintGlobalSpecificity>): ResolvedAttribution {
  const ranked = cluster.tiedBlueprints
    .map((name) => {
      const spec = specificityByName.get(name)!;
      return { name, specificity: spec.specificity, conditionCount: spec.conditionCount };
    })
    .sort((a, b) => b.specificity - a.specificity || b.conditionCount - a.conditionCount || a.name.localeCompare(b.name));

  const primary = ranked[0];
  const runnerUp = ranked[1] ?? null;
  const margin = runnerUp ? primary.specificity - runnerUp.specificity : null;
  const marginal = margin !== null && margin < MARGIN_THRESHOLD;

  return {
    clusterKey: cluster.clusterKey,
    size: cluster.size,
    tiedBlueprints: cluster.tiedBlueprints,
    ranked,
    primaryAttribution: primary.name,
    primarySpecificity: primary.specificity,
    runnerUp: runnerUp?.name ?? null,
    runnerUpSpecificity: runnerUp?.specificity ?? null,
    margin,
    marginal,
  };
}

export function resolveAllClusters(clusters: readonly AmbiguousCluster[], specificities: readonly BlueprintGlobalSpecificity[]): ResolvedAttribution[] {
  const specificityByName = new Map(specificities.map((s) => [s.name, s]));
  return clusters.map((c) => resolveClusterAttribution(c, specificityByName));
}
