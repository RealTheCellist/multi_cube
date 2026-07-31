// --- PrimitiveRefinementOpportunityMap (Solver Primitive Discovery Sprint
// #4 -- Blueprint Attribution Refinement Sprint v1, STEP6) -------------------
// Final deliverable: | Blueprint | Target Cluster | Expected Gain | Priority |
// built directly from BlueprintPriority's totals plus the per-cluster
// assignment lists -- no new judgment, just formatting.
import type { ClusterBlueprintMappingLite } from "./AmbiguousClusterExtraction";
import type { ResolvedAttribution } from "./CounterfactualAttribution";
import type { BlueprintPriorityRow } from "./BlueprintPriority";

export interface OpportunityMapRow {
  blueprint: string;
  targetClusters: string[];
  expectedGain: number; // total case count across target clusters
  priority: number; // 1 = highest
}

export function buildRefinementOpportunityMap(
  allMappings: readonly ClusterBlueprintMappingLite[],
  resolutions: readonly ResolvedAttribution[],
  priority: readonly BlueprintPriorityRow[]
): OpportunityMapRow[] {
  const clustersByBlueprint = new Map<string, string[]>();
  for (const m of allMappings) {
    if (m.verdict === "VARIANT_OF_EXISTING" && m.bestMatch) {
      const list = clustersByBlueprint.get(m.bestMatch) ?? [];
      list.push(m.clusterKey);
      clustersByBlueprint.set(m.bestMatch, list);
    }
  }
  for (const r of resolutions) {
    const list = clustersByBlueprint.get(r.primaryAttribution) ?? [];
    list.push(r.clusterKey);
    clustersByBlueprint.set(r.primaryAttribution, list);
  }

  return priority.map((p, i) => ({
    blueprint: p.blueprint,
    targetClusters: clustersByBlueprint.get(p.blueprint) ?? [],
    expectedGain: p.caseCount,
    priority: i + 1,
  }));
}

export function renderOpportunityMapTable(rows: readonly OpportunityMapRow[]): string {
  const lines = ["| Blueprint | Target Cluster | Expected Gain | Priority |", "|---|---|---:|---:|"];
  for (const r of rows) {
    lines.push(`| ${r.blueprint} | ${r.targetClusters.length}개 클러스터 | ${r.expectedGain} | ${r.priority} |`);
  }
  return lines.join("\n");
}
