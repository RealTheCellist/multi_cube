// --- PrimitiveOpportunityMapV4 (Solver Primitive Discovery Sprint #4 --
// State Taxonomy Sprint v1, STEP6) -------------------------------------------
// Final deliverable table: | Cluster | Cases | Existing Primitive | New
// Mechanism Needed |, built directly from BlueprintMappingV4's per-cluster
// verdicts -- no new judgment introduced here, just formatting +
// aggregation for the Decision (STEP6/Decision Matrix).
import type { ClusterBlueprintMapping } from "./BlueprintMappingV4";

export interface OpportunityRow {
  cluster: string;
  cases: number;
  existingPrimitive: string;
  newMechanismNeeded: string;
}

export function buildOpportunityMap(mappings: readonly ClusterBlueprintMapping[]): OpportunityRow[] {
  return mappings.map((m) => ({
    cluster: m.clusterKey,
    cases: m.size,
    existingPrimitive: m.verdict === "VARIANT_OF_EXISTING" && m.bestMatch ? `${m.bestMatch} (${(m.bestMatchRate * 100).toFixed(0)}% match)` : "-",
    newMechanismNeeded:
      m.verdict === "NEW_MECHANISM_NEEDED"
        ? `YES -- no existing Blueprint precondition covers a majority of this cluster (best=${m.bestMatch ?? "none"} @ ${(m.bestMatchRate * 100).toFixed(0)}%)`
        : m.verdict === "AMBIGUOUS"
          ? `AMBIGUOUS -- multiple Blueprints both clear majority (best=${m.bestMatch} @ ${(m.bestMatchRate * 100).toFixed(0)}%)`
          : "no",
  }));
}

export function renderOpportunityMapTable(rows: readonly OpportunityRow[]): string {
  const lines = ["| Cluster | Cases | Existing Primitive | New Mechanism Needed |", "|---|---:|---|---|"];
  for (const r of rows) {
    lines.push(`| ${r.cluster} | ${r.cases} | ${r.existingPrimitive} | ${r.newMechanismNeeded} |`);
  }
  return lines.join("\n");
}

export interface OpportunitySummary {
  totalClusters: number;
  newMechanismClusterCount: number;
  newMechanismCaseCount: number;
  variantClusterCount: number;
  ambiguousClusterCount: number;
}

export function summarizeOpportunities(mappings: readonly ClusterBlueprintMapping[]): OpportunitySummary {
  return {
    totalClusters: mappings.length,
    newMechanismClusterCount: mappings.filter((m) => m.verdict === "NEW_MECHANISM_NEEDED").length,
    newMechanismCaseCount: mappings.filter((m) => m.verdict === "NEW_MECHANISM_NEEDED").reduce((s, m) => s + m.size, 0),
    variantClusterCount: mappings.filter((m) => m.verdict === "VARIANT_OF_EXISTING").length,
    ambiguousClusterCount: mappings.filter((m) => m.verdict === "AMBIGUOUS").length,
  };
}
