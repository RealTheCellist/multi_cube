// --- StructuralClustering (Primitive Discovery Sprint #2) ------------------
// Groups the CURRENT failure population (post-revalidation) by the richer
// StructuralFeatures representation, one level more specific than
// failureAnalysis/failureCluster.ts's wrongWing+parity-only key. Also
// tags each cluster with whether the CURRENT pipeline (including REPAIR)
// has any real chance at it: a cluster where every member is
// `gateEligible` is one REPAIR should already be handling (not a gap);
// a cluster where NO member is gate-eligible AND the cycle/conflict
// structure doesn't match anything the existing DISRUPT/SETUP/REPAIR
// candidates target is the kind of genuine, unaddressed structural gap
// this Sprint is looking for.
import type { StructuralFeatures } from "./StructuralRepresentation";

export interface StructuralCluster {
  key: string;
  size: number;
  hashes: string[];
  commonWrongWingCount: number | null;
  commonParity: boolean | null;
  commonCycleLength: number | null;
  commonCycleCount: number | null;
  commonConflictEdgeCount: number | null;
  gateEligibleFraction: number; // share of members REPAIR's own Gate would already accept
  description: string;
}

function clusterKey(f: StructuralFeatures): string {
  return `w${f.wrongWingCount}|p${f.parity ? 1 : 0}|cl${f.cycleLength}|cc${f.cycleCount}|ce${f.conflictEdgeCount}`;
}

export function clusterByStructure(features: readonly StructuralFeatures[]): StructuralCluster[] {
  const groups = new Map<string, StructuralFeatures[]>();
  for (const f of features) {
    const key = clusterKey(f);
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  const clusters: StructuralCluster[] = [];
  for (const [key, list] of groups) {
    const wrongWingCounts = new Set(list.map((f) => f.wrongWingCount));
    const parities = new Set(list.map((f) => f.parity));
    const cycleLengths = new Set(list.map((f) => f.cycleLength));
    const cycleCounts = new Set(list.map((f) => f.cycleCount));
    const conflictEdgeCounts = new Set(list.map((f) => f.conflictEdgeCount));
    const gateEligibleFraction = list.filter((f) => f.gateEligible).length / list.length;

    clusters.push({
      key,
      size: list.length,
      hashes: list.map((f) => f.hash),
      commonWrongWingCount: wrongWingCounts.size === 1 ? [...wrongWingCounts][0] : null,
      commonParity: parities.size === 1 ? [...parities][0] : null,
      commonCycleLength: cycleLengths.size === 1 ? [...cycleLengths][0] : null,
      commonCycleCount: cycleCounts.size === 1 ? [...cycleCounts][0] : null,
      commonConflictEdgeCount: conflictEdgeCounts.size === 1 ? [...conflictEdgeCounts][0] : null,
      gateEligibleFraction,
      description: `wrongWing=${list[0].wrongWingCount}, parity=${list[0].parity ? "있음" : "없음"}, cycleLength=${list[0].cycleLength}, cycleCount=${list[0].cycleCount}, conflictEdgeCount=${list[0].conflictEdgeCount}`,
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}

/** Clusters where NO member is REPAIR-gate-eligible -- i.e. not just an
 * under-served slice of what REPAIR already targets, but structurally
 * outside every existing Recovery candidate's own reach. */
export function selectLargestUnaddressedCluster(clusters: readonly StructuralCluster[]): StructuralCluster | null {
  const unaddressed = clusters.filter((c) => c.gateEligibleFraction === 0);
  return unaddressed.length > 0 ? unaddressed[0] : null; // already sorted by size descending
}

// --- Coarse (macro) clustering -------------------------------------------
// The exact-tuple key above reproduces the EXACT over-fragmentation trap
// failureAnalysis/failureCluster.ts's own comment already warned about
// ("키on the exact slot set... fragmented 75 failures into 72 near-
// singleton clusters") -- 335 snapshots split into 173 exact-tuple
// clusters here, the largest only 8 members. Bucketing cycleLength into
// ranges (instead of an exact value) surfaces the actual macro-pattern a
// human would act on, at the cost of losing some precision -- disclosed
// tradeoff, used only as a second, coarser view alongside the fine one
// above, never as a replacement for it.
export type CycleLengthBand = "none" | "2-4 (REPAIR range)" | "5-6" | "7+";

function cycleLengthBand(cycleLength: number): CycleLengthBand {
  if (cycleLength === 0) return "none";
  if (cycleLength <= 4) return "2-4 (REPAIR range)";
  if (cycleLength <= 6) return "5-6";
  return "7+";
}

export interface MacroCluster {
  key: string;
  size: number;
  hashes: string[];
  cycleLengthBand: CycleLengthBand;
  hasConflictEdges: boolean;
  gateEligibleFraction: number;
  avgWrongWingCount: number;
  description: string;
}

export function clusterByMacroStructure(features: readonly StructuralFeatures[]): MacroCluster[] {
  const groups = new Map<string, StructuralFeatures[]>();
  for (const f of features) {
    const band = cycleLengthBand(f.cycleLength);
    const key = `${band}|conflictEdges=${f.conflictEdgeCount > 0 ? "yes" : "no"}`;
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  const clusters: MacroCluster[] = [];
  for (const [key, list] of groups) {
    const gateEligibleFraction = list.filter((f) => f.gateEligible).length / list.length;
    const avgWrongWingCount = list.reduce((a, f) => a + f.wrongWingCount, 0) / list.length;
    clusters.push({
      key,
      size: list.length,
      hashes: list.map((f) => f.hash),
      cycleLengthBand: cycleLengthBand(list[0].cycleLength),
      hasConflictEdges: list[0].conflictEdgeCount > 0,
      gateEligibleFraction,
      avgWrongWingCount,
      description: `cycleLength=${cycleLengthBand(list[0].cycleLength)}, conflictEdges=${list[0].conflictEdgeCount > 0 ? "있음" : "없음"}, 평균 wrongWing=${avgWrongWingCount.toFixed(1)}`,
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}
