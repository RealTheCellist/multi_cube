// --- BlueprintPriority (Solver Primitive Discovery Sprint #4 -- Blueprint
// Attribution Refinement Sprint v1, STEP5) -----------------------------------
// Aggregates case counts per Blueprint across ALL 49 Discovery Sprint #4
// clusters -- the 21 already-unambiguous VARIANT_OF_EXISTING clusters
// (their own bestMatch, cited unmodified) PLUS the 28 now-resolved
// AMBIGUOUS clusters (this Sprint's own Primary Attribution) -- to produce
// a single case-count-based priority ranking across the whole Hole
// population, matching the Directive's own example format
// ("Deep Cycle : 15, Bridge : 8, CCR : 3, Conflict : 2").
import type { ClusterBlueprintMappingLite } from "./AmbiguousClusterExtraction";
import type { ResolvedAttribution } from "./CounterfactualAttribution";

export interface BlueprintPriorityRow {
  blueprint: string;
  caseCount: number;
  clusterCount: number;
  fromUnambiguous: number; // case count from clusters that were already VARIANT_OF_EXISTING pre-Refinement
  fromResolvedAmbiguous: number; // case count from clusters this Sprint resolved
}

export function computeBlueprintPriority(allMappings: readonly ClusterBlueprintMappingLite[], resolutions: readonly ResolvedAttribution[]): BlueprintPriorityRow[] {
  const totals = new Map<string, BlueprintPriorityRow>();
  const ensure = (name: string) => {
    if (!totals.has(name)) totals.set(name, { blueprint: name, caseCount: 0, clusterCount: 0, fromUnambiguous: 0, fromResolvedAmbiguous: 0 });
    return totals.get(name)!;
  };

  for (const m of allMappings) {
    if (m.verdict === "VARIANT_OF_EXISTING" && m.bestMatch) {
      const row = ensure(m.bestMatch);
      row.caseCount += m.size;
      row.clusterCount += 1;
      row.fromUnambiguous += m.size;
    }
  }
  for (const r of resolutions) {
    const row = ensure(r.primaryAttribution);
    row.caseCount += r.size;
    row.clusterCount += 1;
    row.fromResolvedAmbiguous += r.size;
  }

  return [...totals.values()].sort((a, b) => b.caseCount - a.caseCount);
}
