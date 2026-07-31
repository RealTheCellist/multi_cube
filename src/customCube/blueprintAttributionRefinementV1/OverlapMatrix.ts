// --- OverlapMatrix (Solver Primitive Discovery Sprint #4 -- Blueprint
// Attribution Refinement Sprint v1, STEP4) -----------------------------------
// Formats Cluster x Blueprint confidence (the original matchRatesByBlueprint
// from Discovery Sprint #4, cited not recomputed) alongside STEP3's
// resolved Primary Attribution -- no new judgment introduced here, just
// aggregation for STEP5/6.
import type { AmbiguousCluster } from "./AmbiguousClusterExtraction";
import type { ResolvedAttribution } from "./CounterfactualAttribution";

export interface OverlapMatrixRow {
  clusterKey: string;
  size: number;
  confidenceByBlueprint: Record<string, number>;
  primaryAttribution: string;
  marginal: boolean;
}

export function buildOverlapMatrix(clusters: readonly AmbiguousCluster[], resolutions: readonly ResolvedAttribution[]): OverlapMatrixRow[] {
  const resolutionByKey = new Map(resolutions.map((r) => [r.clusterKey, r]));
  return clusters.map((c) => {
    const r = resolutionByKey.get(c.clusterKey)!;
    return {
      clusterKey: c.clusterKey,
      size: c.size,
      confidenceByBlueprint: c.matchRatesByBlueprint,
      primaryAttribution: r.primaryAttribution,
      marginal: r.marginal,
    };
  });
}

export function renderOverlapMatrixTable(rows: readonly OverlapMatrixRow[], blueprintNames: readonly string[]): string {
  const header = ["Cluster", ...blueprintNames, "Primary Attribution"];
  const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
  for (const r of rows) {
    const cells = blueprintNames.map((b) => (r.confidenceByBlueprint[b] === 1 ? "1" : "0"));
    lines.push(`| ${r.clusterKey} | ${cells.join(" | ")} | ${r.primaryAttribution}${r.marginal ? " (marginal)" : ""} |`);
  }
  return lines.join("\n");
}
