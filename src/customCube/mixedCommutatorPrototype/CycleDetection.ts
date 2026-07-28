// --- CycleDetection (Mixed Commutator Prototype Sprint v1, Architecture
// STEP 1) -------------------------------------------------------------------
// Thin wrapper around the existing, unmodified analyzeMultiCycle() --
// same reuse pattern Move Representation Prototype Sprint v1's own
// AdaptiveCycleDetection.ts established. Used here as a precondition gate
// (confirms a cycle exists) and to obtain cycleLength for footprintRatio
// bookkeeping -- the bracket-commutator mechanism itself (validated in
// Mixed Commutator Design Space Validation Sprint v1) does not target
// individual cycle nodes, it searches over the whole state directly, so
// cycleNodes are recorded but not otherwise used by BracketSearch.
import type { Cubie } from "../cubeState";
import { analyzeMultiCycle, type CycleAnalysis } from "../solverV2Prototype/MultiCycleAnalyzer";

export function detectCycle(cubies: Cubie[]): CycleAnalysis | null {
  return analyzeMultiCycle(cubies);
}
