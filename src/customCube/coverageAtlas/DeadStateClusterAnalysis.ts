// --- DeadStateClusterAnalysis (Coverage Hole Discovery Sprint v1, Phase 1
// STEP2) -----------------------------------------------------------------
// Clusters the Hole Dataset's stuck states by structural mechanism, reusing
// existing, unmodified analysis: buildStateGraph/analyzeConstraints
// (capabilityAnalysis/) for cycle/conflict structure, and goalPlanner's
// hasParity. No new structural-detection logic -- only a grouping key over
// features every prior engine in this research arc already computes.
import type { HoleCase } from "./HoleDatasetBuilder";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { hasParity } from "../goalPlanner/GoalAnalyzer";

export interface HoleStructuralProfile {
  label: string;
  wrongWingCount: number;
  hasParity: boolean;
  cycleCount: number;
  longestCycleLength: number;
  mutualLockCount: number;
  conflictCount: number;
  componentCount: number;
  anyPrimitiveApplicable: boolean;
}

export function profileHoleCase(hole: HoleCase): HoleStructuralProfile {
  const graph = buildStateGraph(hole.cubies);
  const stats = analyzeConstraints(graph);
  return {
    label: hole.label,
    wrongWingCount: hole.wrongWingCount,
    hasParity: hasParity(hole.cubies),
    cycleCount: stats.cycleCount,
    longestCycleLength: stats.longestCycleLength,
    mutualLockCount: stats.mutualLockCount,
    conflictCount: stats.conflictCount,
    componentCount: stats.componentCount,
    anyPrimitiveApplicable: hole.anyPrimitiveApplicable,
  };
}

// Bucket boundaries are the same "small/medium/large" cut used elsewhere in
// this research arc's cycle-length reporting (see ParityEntrySelector's own
// commentary) -- not a new threshold invented for this Sprint.
function wrongWingBucket(n: number): string {
  if (n <= 2) return "1-2";
  if (n <= 4) return "3-4";
  if (n <= 8) return "5-8";
  return "9+";
}

function cycleLengthBucket(n: number): string {
  if (n === 0) return "none";
  if (n === 2) return "swap(2)";
  if (n <= 4) return "short(3-4)";
  return "long(5+)";
}

export interface DeadStateCluster {
  key: string;
  mechanismLabel: string;
  members: string[]; // hole case labels
  size: number;
  share: number; // of total hole population
  anyPrimitiveApplicableCount: number;
  avgWrongWingCount: number;
  avgConflictCount: number;
}

/**
 * Clustering key: (hasParity, longestCycleLength bucket, conflict presence,
 * wrongWing bucket) -- a composite tag exactly like buildWorstCaseLibrary's
 * own tag-based grouping (this codebase's established convention for
 * "cluster by shared mechanism" rather than distance-based clustering,
 * appropriate here since the feature space is small and categorical).
 */
export function clusterDeadStates(profiles: HoleStructuralProfile[]): DeadStateCluster[] {
  const groups = new Map<string, HoleStructuralProfile[]>();
  for (const p of profiles) {
    const parityTag = p.hasParity ? "parity" : "no-parity";
    const cycleTag = cycleLengthBucket(p.longestCycleLength);
    const conflictTag = p.conflictCount > 0 ? "conflict" : "no-conflict";
    const wingTag = wrongWingBucket(p.wrongWingCount);
    const key = `${parityTag}|cycle=${cycleTag}|${conflictTag}|wrongWing=${wingTag}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const total = profiles.length;
  const clusters: DeadStateCluster[] = [];
  for (const [key, members] of groups) {
    const avgWrongWingCount = members.reduce((s, m) => s + m.wrongWingCount, 0) / members.length;
    const avgConflictCount = members.reduce((s, m) => s + m.conflictCount, 0) / members.length;
    const anyPrimitiveApplicableCount = members.filter((m) => m.anyPrimitiveApplicable).length;
    clusters.push({
      key,
      mechanismLabel: describeMechanism(key, members),
      members: members.map((m) => m.label),
      size: members.length,
      share: total > 0 ? members.length / total : 0,
      anyPrimitiveApplicableCount,
      avgWrongWingCount,
      avgConflictCount,
    });
  }
  return clusters.sort((a, b) => b.size - a.size);
}

function describeMechanism(key: string, members: HoleStructuralProfile[]): string {
  const parity = key.includes("no-parity") ? false : true;
  const hasConflict = key.includes("|conflict|");
  const cycleTag = key.match(/cycle=([^|]+)/)?.[1] ?? "none";
  const allLocked = members.every((m) => m.componentCount > 0 && m.mutualLockCount === members[0].mutualLockCount && m.mutualLockCount > 0);

  if (parity && cycleTag === "none") return "Parity without a resolvable cycle (parity flag set, but no cyclic wing dependency detected)";
  if (parity) return `Parity + ${cycleTag} cycle`;
  if (cycleTag === "swap(2)" && allLocked) return "Locked Pair (2-cycle mutual lock, no parity)";
  if (hasConflict && cycleTag === "none") return "Conflict-only (one-sided WANTS dependency, no cycle to resolve it)";
  if (cycleTag === "long(5+)") return "Long multi-piece cycle, no parity";
  if (cycleTag === "none" && !hasConflict) return "No structural dependency detected (isolated wrong wings)";
  return `${cycleTag} cycle${hasConflict ? " + conflict" : ""}, no parity`;
}
