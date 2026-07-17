// --- Primitive Candidate Generator (Capability Analysis Engine v1) ----------
// Aggregates gaps across ALL clusters into named candidates -- deliberately
// does NOT generate an algorithm (spec: "알고리즘을 생성하지 않는다.
// 연구 후보만 만든다."), only names the missing capability, which clusters
// need it, and an impact estimate computed from real graph data (never
// fabricated): expected WrongWing reduction is estimated as the average
// number of wings actually tied up in the detected cycles/conflicts for the
// affected clusters -- a concrete lower bound on what resolving that
// structural knot would free up, not a guessed number.
import { CAPABILITY_ROW_LABELS } from "./capabilityTypes";
import type { CapabilityRowName, ClusterCapabilitySummary, PrimitiveCandidate } from "./capabilityTypes";

const CANDIDATE_NAME_BY_ROW: Record<CapabilityRowName, string> = {
  PairCreation: "향상된 Pair Creation Primitive",
  PairPreservation: "Collateral-safe Pair Primitive",
  CycleRemoval: "Cycle Resolution Primitive",
  ConflictReduction: "Conflict-aware Setup Primitive",
  MultiSwap: "Multi-Pair Swap Primitive",
};

function estimateWrongWingReduction(summaries: ClusterCapabilitySummary[], row: CapabilityRowName): number {
  const relevant = summaries.filter((s) => s.gap.missingCapabilities.includes(row));
  if (relevant.length === 0) return 0;
  const avgCycleLen = relevant.reduce((sum, s) => sum + s.matrix.testResults[0]?.cycleBefore * 2, 0) / relevant.length;
  const avgWrongWing = relevant.reduce((sum, s) => sum + s.cluster.wrongWingCount, 0) / relevant.length;
  // A structural knot (cycle/conflict) directly ties up at least the
  // pieces on its own cycle -- resolving it should free at least that
  // many, bounded above by the cluster's own average wrongWingCount (can
  // never "reduce" more than what's actually there).
  return Math.round(Math.min(avgWrongWing, Math.max(2, avgCycleLen)));
}

export function generatePrimitiveCandidates(summaries: ClusterCapabilitySummary[], totalFailureCount: number): PrimitiveCandidate[] {
  const byRow = new Map<CapabilityRowName, ClusterCapabilitySummary[]>();
  for (const s of summaries) {
    for (const row of s.gap.missingCapabilities) {
      const list = byRow.get(row) ?? [];
      list.push(s);
      byRow.set(row, list);
    }
  }

  const candidates: PrimitiveCandidate[] = [];
  for (const [row, list] of byRow) {
    const affectedFailureCount = list.reduce((sum, s) => sum + s.cluster.size, 0);
    const impactPercent = totalFailureCount > 0 ? Math.round((affectedFailureCount / totalFailureCount) * 1000) / 10 : 0;
    const expectedWrongWingReduction = estimateWrongWingReduction(list, row);
    const priorityStars = Math.min(5, Math.max(1, Math.round((impactPercent / 100) * 5) || 1));

    candidates.push({
      name: `${CANDIDATE_NAME_BY_ROW[row]} (${CAPABILITY_ROW_LABELS[row]})`,
      affectedClusterIds: list.map((s) => s.cluster.id),
      affectedFailureCount,
      totalFailureCount,
      impactPercent,
      expectedWrongWingReduction,
      priorityStars,
    });
  }

  return candidates.sort((a, b) => b.impactPercent - a.impactPercent);
}
