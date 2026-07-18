// --- ParityStructureAnalyzer (Solver v2 Primitive Prototype Sprint v2) ----
// STEP 1: analyzes Parity + WANTS Graph + Cycle structure together, for one
// cube state. Reuses capabilityAnalysis's buildStateGraph and
// coverageExpansion's pickLongestCycle (both existing, unmodified) and
// goalPlanner's hasParity (existing, unmodified) -- no new structural
// analysis logic, just reading the same real graph every prior engine in
// this series already builds.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";

export interface ParityStructureProfile {
  hasParity: boolean;
  wrongWingCount: number;
  cycleLength: number;
  cycleNodes: string[];
}

export function analyzeParityStructure(cubies: Cubie[]): ParityStructureProfile {
  const cycle = pickLongestCycle(buildStateGraph(cubies).cycles);
  return {
    hasParity: hasParity(cubies),
    wrongWingCount: wrongWingCount5(cubies),
    cycleLength: cycle ? cycle.length : 0,
    cycleNodes: cycle ?? [],
  };
}
