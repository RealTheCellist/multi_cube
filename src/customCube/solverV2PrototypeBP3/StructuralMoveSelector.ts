// --- StructuralMoveSelector (Solver v2 Primitive Prototype Sprint v3) -----
// STEP 2: decides a FIXED, deterministic order of wrong-wing slots to walk
// -- no brute force, no randomization, no re-picking mid-search. This is
// the concrete way BP-3 differs in scope from BP-1's MultiCycleAnalyzer.ts
// (which only ever returns the single longest WANTS-cycle, length >=4):
// here EVERY slot touched by ANY structural edge -- SWAP, CYCLE, or
// CONFLICT -- is included, because CONFLICT edges (one-sided WANTS
// relations that never close into a cycle) and short SWAP/CYCLE edges
// (length 2-3) are exactly the structures BP-1 and CycleChase never
// attempt at all (BP-1 requires cycleLength >= 4; CycleChase the same).
//
// Deterministic priority: CONFLICT-involved slots first (structurally
// unreachable by every existing/prior Primitive), then SWAP, then CYCLE --
// each group internally sorted lexicographically by slot key. A slot
// touched by more than one edge type keeps only its first (highest-
// priority) appearance.
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

export interface StructuralWalkPlan {
  slots: string[]; // deterministic, deduplicated walk order
}

function sortedUnique(s: Set<string>): string[] {
  return [...s].sort();
}

export function selectStructuralWalkOrder(cubies: Cubie[]): StructuralWalkPlan {
  const graph = buildStateGraph(cubies);

  const conflictSlots = new Set<string>();
  const swapSlots = new Set<string>();
  const cycleSlots = new Set<string>();
  for (const e of graph.edges) {
    if (e.type === "CONFLICT") {
      conflictSlots.add(e.from);
      conflictSlots.add(e.to);
    } else if (e.type === "SWAP") {
      swapSlots.add(e.from);
      swapSlots.add(e.to);
    } else {
      cycleSlots.add(e.from);
      cycleSlots.add(e.to);
    }
  }

  const seen = new Set<string>();
  const slots: string[] = [];
  for (const group of [sortedUnique(conflictSlots), sortedUnique(swapSlots), sortedUnique(cycleSlots)]) {
    for (const slot of group) {
      if (seen.has(slot)) continue;
      seen.add(slot);
      slots.push(slot);
    }
  }

  return { slots };
}
