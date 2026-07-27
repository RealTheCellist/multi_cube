// --- TaxonomyMapper (Solver Completeness Achievement Program, Phase 2
// STEP1: Structural State Classification) ---------------------------------
// Consumes the Dead State Clusters already computed by the Coverage Hole
// Discovery Sprint v1 (coverageAtlas/data/coverage-hole-discovery-v1-result
// .json) and maps them onto the Master Directive's named mechanism
// taxonomy (Conflict Dominant / Locked Pair / Bridge Missing / Cycle
// Isolation / Deferred Trap / Symmetric Trap).
//
// Deliberately does NOT re-run the expensive pipeline: Phase 1's cluster
// composite key (hasParity, cycle-length bucket, conflict-edge presence,
// wrongWing bucket) is real, verified structural data over the actual 142
// stuck states -- classification here is a naming/consolidation pass over
// that data, not a new simulation. Where the Directive's named categories
// don't have a feature signature that distinguishes them from each other
// (Bridge Missing / Deferred Trap / Symmetric Trap all require causal or
// multi-component structure this dataset's persisted aggregate doesn't
// carry), this module reports them as NOT CONFIRMABLE rather than
// force-mapping clusters onto them.
import type { DeadStateCluster } from "../coverageAtlas/DeadStateClusterAnalysis";

export type TaxonomyClass =
  | "LOCKED_PAIR"
  | "CONFLICT_DOMINANT"
  | "CYCLE_ISOLATION"
  | "PARITY_GATED_CYCLE"
  | "UNCLASSIFIED";

export const TAXONOMY_CLASS_LABELS: Record<TaxonomyClass, string> = {
  LOCKED_PAIR: "Locked Pair (2-cycle mutual lock)",
  CONFLICT_DOMINANT: "Conflict Dominant (one-sided WANTS, no cycle)",
  CYCLE_ISOLATION: "Cycle Isolation (isolated 3+ cycle, no conflict, no parity)",
  PARITY_GATED_CYCLE: "Parity-Gated Cycle (parity flag + a cycle -- NOT in Directive's example list)",
  UNCLASSIFIED: "Unclassified (doesn't match any confirmed mechanism signature)",
};

interface ParsedClusterKey {
  hasParity: boolean;
  cycleTag: "none" | "swap(2)" | "short(3-4)" | "long(5+)";
  hasConflict: boolean;
  wrongWingBucket: string;
}

export function parseClusterKey(key: string): ParsedClusterKey {
  const hasParity = key.startsWith("parity|");
  const cycleMatch = key.match(/cycle=([^|]+)/);
  const cycleTag = (cycleMatch?.[1] ?? "none") as ParsedClusterKey["cycleTag"];
  const hasConflict = key.includes("|conflict|");
  const wrongWingMatch = key.match(/wrongWing=(.+)$/);
  const wrongWingBucket = wrongWingMatch?.[1] ?? "unknown";
  return { hasParity, cycleTag, hasConflict, wrongWingBucket };
}

export function classifyCluster(cluster: DeadStateCluster): TaxonomyClass {
  const { hasParity, cycleTag, hasConflict } = parseClusterKey(cluster.key);

  if (hasParity && cycleTag !== "none") return "PARITY_GATED_CYCLE";
  if (cycleTag === "swap(2)" && !hasParity) return "LOCKED_PAIR";
  if (cycleTag === "none" && hasConflict) return "CONFLICT_DOMINANT";
  if ((cycleTag === "short(3-4)" || cycleTag === "long(5+)") && !hasConflict && !hasParity) return "CYCLE_ISOLATION";
  return "UNCLASSIFIED";
}

export interface TaxonomyAssignment {
  clusterKey: string;
  mechanismLabel: string;
  taxonomyClass: TaxonomyClass;
  size: number;
  anyPrimitiveApplicableCount: number;
  avgWrongWingCount: number;
  avgConflictCount: number;
}

export function assignTaxonomy(clusters: DeadStateCluster[]): TaxonomyAssignment[] {
  return clusters.map((c) => ({
    clusterKey: c.key,
    mechanismLabel: c.mechanismLabel,
    taxonomyClass: classifyCluster(c),
    size: c.size,
    anyPrimitiveApplicableCount: c.anyPrimitiveApplicableCount,
    avgWrongWingCount: c.avgWrongWingCount,
    avgConflictCount: c.avgConflictCount,
  }));
}

export interface TaxonomySummaryRow {
  taxonomyClass: TaxonomyClass;
  label: string;
  clusterCount: number;
  totalCases: number;
  share: number;
  anyPrimitiveApplicableCount: number;
  anyPrimitiveApplicableShare: number;
}

export function summarizeTaxonomy(assignments: TaxonomyAssignment[]): TaxonomySummaryRow[] {
  const totalCases = assignments.reduce((s, a) => s + a.size, 0);
  const groups = new Map<TaxonomyClass, TaxonomyAssignment[]>();
  for (const a of assignments) {
    const list = groups.get(a.taxonomyClass) ?? [];
    list.push(a);
    groups.set(a.taxonomyClass, list);
  }
  const rows: TaxonomySummaryRow[] = [];
  for (const [taxonomyClass, group] of groups) {
    const totalGroupCases = group.reduce((s, g) => s + g.size, 0);
    const anyApplicable = group.reduce((s, g) => s + g.anyPrimitiveApplicableCount, 0);
    rows.push({
      taxonomyClass,
      label: TAXONOMY_CLASS_LABELS[taxonomyClass],
      clusterCount: group.length,
      totalCases: totalGroupCases,
      share: totalCases > 0 ? totalGroupCases / totalCases : 0,
      anyPrimitiveApplicableCount: anyApplicable,
      anyPrimitiveApplicableShare: totalGroupCases > 0 ? anyApplicable / totalGroupCases : 0,
    });
  }
  return rows.sort((a, b) => b.totalCases - a.totalCases);
}

// Directive-named categories this dataset's current features cannot
// confirm or deny -- reported explicitly rather than silently omitted.
export const UNCONFIRMABLE_DIRECTIVE_CATEGORIES = [
  {
    name: "Bridge Missing",
    reason:
      "Would require multi-component structural analysis (is there a piece that could bridge two disjoint WANTS-graph components?) -- componentCount was computed per-case in Phase 1 (HoleStructuralProfile.componentCount) but not persisted at cluster granularity in the final result JSON, and the underlying Cubie[] states themselves were not retained (data-retention bug fixed after this Sprint, see Appendix). Needs a fresh targeted re-run.",
  },
  {
    name: "Deferred Trap",
    reason:
      "Would require observing state evolution over multiple solve() attempts (a trap that only manifests after several turns since a prior fix) -- this Sprint tested each stuck state in isolation (single scratch-clone snapshot), not as a trajectory. Needs a different measurement design entirely.",
  },
  {
    name: "Symmetric Trap",
    reason:
      "Would require checking the stuck state against the cube's symmetry group (states equivalent under rotation/reflection that defeat the same search uniformly) -- no symmetry-detection code exists anywhere in this codebase (verified by search). Would be new infrastructure, not a reclassification of existing data.",
  },
];
