// --- ConstraintAnalyzer (Capability Analysis Engine v1) ---------------------
import type { ConstraintStats, StateGraph } from "./capabilityTypes";

export function analyzeConstraints(graph: StateGraph): ConstraintStats {
  const unfinishedSlots = new Set(graph.nodes.filter((n) => n.type !== "SolvedPair").map((n) => n.slot));
  const degree: Record<string, number> = {};
  for (const slot of unfinishedSlots) degree[slot] = 0;

  let mutualLockCount = 0;
  let conflictCount = 0;
  const adjUndirected = new Map<string, Set<string>>();
  for (const slot of unfinishedSlots) adjUndirected.set(slot, new Set());

  for (const e of graph.edges) {
    degree[e.from] = (degree[e.from] ?? 0) + 1;
    degree[e.to] = (degree[e.to] ?? 0) + 1;
    if (e.type === "CONFLICT") conflictCount++;
    adjUndirected.get(e.from)?.add(e.to);
    adjUndirected.get(e.to)?.add(e.from);
  }
  // Each 2-cycle produces exactly 2 SWAP edges (A->B, B->A) -- halve to get
  // the actual Mutual Lock count rather than double-counting.
  mutualLockCount = graph.cycles.filter((c) => c.length === 2).length;

  const visited = new Set<string>();
  let componentCount = 0;
  for (const slot of unfinishedSlots) {
    if (visited.has(slot)) continue;
    componentCount++;
    const queue = [slot];
    visited.add(slot);
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjUndirected.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  const longestCycleLength = graph.cycles.reduce((max, c) => Math.max(max, c.length), 0);

  return {
    cycleCount: graph.cycles.length,
    mutualLockCount,
    componentCount,
    conflictCount,
    degree,
    dependencyCount: graph.edges.length,
    longestCycleLength,
  };
}
