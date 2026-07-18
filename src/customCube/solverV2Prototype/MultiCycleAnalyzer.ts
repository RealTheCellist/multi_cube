// --- MultiCycleAnalyzer (Solver v2 Primitive Prototype Sprint v1) ----------
// STEP 1: extracts the WANTS Graph -> Cycle -> Component information the
// Bounded Resolver needs. Reuses capabilityAnalysis's buildStateGraph
// (existing, unmodified, grounded in real colorKeyOf matching) and
// coverageExpansion's pickLongestCycle tie-break rule (existing, unmodified)
// -- no new graph construction logic, just reading the same real structure
// every prior engine in this series has used.
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";

export interface CycleAnalysis {
  cycleLength: number;
  cycleNodes: string[]; // slot keys, in cycle traversal order
}

export function analyzeMultiCycle(cubies: Cubie[]): CycleAnalysis | null {
  const cycle = pickLongestCycle(buildStateGraph(cubies).cycles);
  if (!cycle) return null;
  return { cycleLength: cycle.length, cycleNodes: cycle };
}
