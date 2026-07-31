// --- ComponentDetection (Parity-Gated Cycle Prototype Sprint v1, STEP1
// "component 탐색") -------------------------------------------------------
// Reuses buildStateGraph (capabilityAnalysis/stateGraphBuilder.ts,
// unmodified) for the real WANTS graph, then finds connected components
// via the SAME undirected-adjacency-over-unfinished-slots BFS
// capabilityAnalysis/constraintAnalyzer.ts's analyzeConstraints() and
// deepCycleSubtypeDiscoveryV1/GraphTopologyAnalysis.ts already use
// internally (disclosed re-derivation, not a new graph -- neither file
// exports the raw per-component slot membership this Sprint needs).
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

export interface ComponentInfo {
  components: string[][]; // each entry: the slot labels belonging to that component
  componentOfSlot: Map<string, number>;
}

export function detectComponents(cubies: Cubie[]): ComponentInfo {
  const graph = buildStateGraph(cubies);
  const unfinishedSlots = graph.nodes.filter((n) => n.type !== "SolvedPair").map((n) => n.slot);
  const adj = new Map<string, Set<string>>();
  for (const slot of unfinishedSlots) adj.set(slot, new Set());
  for (const e of graph.edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }

  const visited = new Set<string>();
  const components: string[][] = [];
  const componentOfSlot = new Map<string, number>();
  for (const slot of unfinishedSlots) {
    if (visited.has(slot)) continue;
    const comp: string[] = [];
    const queue = [slot];
    visited.add(slot);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      componentOfSlot.set(cur, components.length);
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    components.push(comp);
  }
  return { components, componentOfSlot };
}

export function countComponents(cubies: Cubie[]): number {
  return detectComponents(cubies).components.length;
}
