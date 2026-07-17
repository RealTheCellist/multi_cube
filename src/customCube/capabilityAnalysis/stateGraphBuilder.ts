// --- StateGraphBuilder (Capability Analysis Engine v1) ----------------------
// Turns a cube state into a real, computed graph over the 12 canonical
// slots, grounded entirely in color-key relationships (the same
// colorKeyOf-based matching fiveByFiveEdges.ts's own matchesTrueEdge uses)
// -- never fabricated. Every wrong wing currently sitting in slot A that
// carries slot B's true-edge color defines a directed "WANTS" relation A
// -> B (this wing belongs in B). Cycles in that relation are the actual
// structural dependency the spec's Cycle/Swap/Conflict edge types describe:
// a 2-cycle (A wants B, B wants A) is a "Mutual Lock"/Swap; a longer cycle
// is a genuine multi-piece rotation; any directed WANTS edge that ISN'T
// part of a detected cycle is a one-sided dependency (fixing A costs B
// something B never gets back) -- a Conflict edge.
//
// "동일 Edge" (spec's own 4th named edge type) is deliberately NOT modeled
// as a separate cross-node edge: a slot's own 2 wings sharing one edge
// identity is already captured by that single node's own `type`
// classification (SolvedPair/WingPair/BrokenPair), so a same-edge edge
// between two DIFFERENT nodes would never occur by definition -- adding it
// would only ever be a no-op.
import { colorKeyOf, wrongWings5 } from "../fiveByFiveEdges";
import type { Cubie } from "../cubeState";
import { analyzeEdgeSlots, detectEdgeSlotPattern, type EdgeSlotStats } from "../fiveByFiveHumanEdges";
import type { ConstraintEdge, StateGraph, WingNode, WingNodeType } from "./capabilityTypes";

interface WantsEdge {
  from: string;
  to: string;
}

const MAX_CYCLE_SEARCH_LENGTH = 6; // 12 slots max, but wrong-wing counts rarely justify searching beyond this

function findCycles(wants: WantsEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const w of wants) {
    const list = adj.get(w.from) ?? [];
    list.push(w.to);
    adj.set(w.from, list);
  }

  const cycles: string[][] = [];
  const seenNormalized = new Set<string>();

  function normalize(cycle: string[]): string[] {
    let minIdx = 0;
    for (let i = 1; i < cycle.length; i++) if (cycle[i] < cycle[minIdx]) minIdx = i;
    return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
  }

  function dfs(start: string, current: string, path: string[], visited: Set<string>): void {
    if (path.length > MAX_CYCLE_SEARCH_LENGTH) return;
    for (const next of adj.get(current) ?? []) {
      if (next === start && path.length >= 2) {
        const normalized = normalize(path);
        const key = normalized.join(",");
        if (!seenNormalized.has(key)) {
          seenNormalized.add(key);
          cycles.push(normalized);
        }
      } else if (!visited.has(next)) {
        visited.add(next);
        path.push(next);
        dfs(start, next, path, visited);
        path.pop();
        visited.delete(next);
      }
    }
  }

  for (const start of adj.keys()) dfs(start, start, [start], new Set([start]));
  return cycles;
}

function classifyNode(stats: EdgeSlotStats): WingNodeType {
  if (stats.pairedCount === 2) return "SolvedPair";
  return detectEdgeSlotPattern(stats) === "unpaired" ? "BrokenPair" : "WingPair";
}

export function buildStateGraph(cubies: Cubie[]): StateGraph {
  const allStats = analyzeEdgeSlots(cubies);
  const nodes: WingNode[] = allStats.map((s) => ({ slot: s.slot, type: classifyNode(s) }));

  const unfinished = allStats.filter((s) => s.pairedCount < 2);
  const wrongIds = new Set(wrongWings5(cubies).map((c) => c.id));
  const trueKeyBySlot = new Map(allStats.map((s) => [s.slot, colorKeyOf(s.trueEdge)]));

  const wants: WantsEdge[] = [];
  for (const a of unfinished) {
    for (const w of a.wings) {
      if (!wrongIds.has(w.id)) continue;
      const wKey = colorKeyOf(w);
      for (const b of unfinished) {
        if (b.slot === a.slot) continue;
        if (trueKeyBySlot.get(b.slot) === wKey) wants.push({ from: a.slot, to: b.slot });
      }
    }
  }

  const cycles = findCycles(wants);
  const edges: ConstraintEdge[] = [];
  const inCycle = new Set<string>();

  for (const cycle of cycles) {
    const type = cycle.length === 2 ? "SWAP" : "CYCLE";
    for (let i = 0; i < cycle.length; i++) {
      const from = cycle[i];
      const to = cycle[(i + 1) % cycle.length];
      edges.push({ from, to, type });
      inCycle.add(`${from}->${to}`);
    }
  }
  for (const w of wants) {
    const key = `${w.from}->${w.to}`;
    if (inCycle.has(key)) continue;
    edges.push({ from: w.from, to: w.to, type: "CONFLICT" });
  }

  return { nodes, edges, cycles };
}
