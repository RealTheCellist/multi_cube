// --- StructuralProfile (Solver v2 Primitive Prototype Sprint v3) ----------
// STEP 1: extracts the WANTS-graph structure of a state -- not just the
// single longest cycle (MultiCycleAnalyzer.ts's own scope, reused unmodified
// by BP-1/BP-2), but EVERY structural edge type buildStateGraph already
// computes (SWAP 2-cycle, CYCLE 3+, and non-cycle CONFLICT), since this
// Sprint's own hypothesis is that some Hard Gap states are blocked by
// structure BP-1/CycleChase never even attempt (no cycle length >=4 at all,
// or a WANTS relation that never closes into a cycle).
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";

export interface StructuralProfile {
  wrongWingCount: number;
  pairCount: number;
  hasParity: boolean;
  cycleLength: number; // longest detected WANTS-cycle, 0 if none exists at all
  swapEdgeCount: number; // # of SWAP (2-cycle / mutual lock) edges
  cycleEdgeCount: number; // # of CYCLE (3+ piece rotation) edges
  conflictEdgeCount: number; // # of CONFLICT (one-sided, never-closes-into-a-cycle) edges
  structuralSignature: string; // deterministic one-line summary, for reporting only
}

export function analyzeStructuralProfile(cubies: Cubie[]): StructuralProfile {
  const graph = buildStateGraph(cubies);
  const cycle = pickLongestCycle(graph.cycles);

  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }

  const wrongWingCount = wrongWingCount5(cubies);
  const pairCount = pairCountOf(cubies);
  const parity = hasParity(cubies);

  return {
    wrongWingCount,
    pairCount,
    hasParity: parity,
    cycleLength: cycle ? cycle.length : 0,
    swapEdgeCount,
    cycleEdgeCount,
    conflictEdgeCount,
    structuralSignature: `WW${wrongWingCount}|pair${pairCount}|parity=${parity}|swap${swapEdgeCount}|cycle${cycleEdgeCount}(len${cycle ? cycle.length : 0})|conflict${conflictEdgeCount}`,
  };
}
