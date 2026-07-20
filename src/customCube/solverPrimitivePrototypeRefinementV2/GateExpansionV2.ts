// --- GateExpansionV2 (Solver Primitive Prototype Refinement Sprint v2) ---
// Strategy A: further widens the Gate beyond A1_wideCycle -- the NEW
// baseline this Sprint adopts, confirmed statistically better than the
// old A0 baseline by Evaluation Stabilization Sprint v2's paired-diff CI
// (excluded zero at every N=5/10/15 checkpoint, replicated across two
// independent full runs). V0_BASELINE is A1_wideCycle itself, reused
// UNMODIFIED from solverPrimitivePrototypeRefinement/GateExpansionVariants.ts
// (GATE_VARIANTS[1]) as this Sprint's own reference point. V1 extends
// the cycle-length upper bound by one more step (2~5) while KEEPING the
// validated conflictEdgeCount>0 precondition -- no attempt to drop that
// precondition again (that was already identified and excluded as a
// "coarsening trap" in Refinement Sprint v1).
import type { Cubie } from "../cubeState";
import type { WingLibrary, Move } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges, runInstrumentedBoundedSearch } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import { GATE_VARIANTS, type GateVariant } from "../solverPrimitivePrototypeRefinement/GateExpansionVariants";

export const V0_BASELINE: GateVariant = GATE_VARIANTS[1]; // A1_wideCycle: cycleLength 2~4 AND conflictEdgeCount>0

export const V1_WIDE_CYCLE_5: GateVariant = {
  name: "V1_wideCycle5 (cycleLength 2~5 AND conflictEdgeCount>0)",
  matches: (cl, ce) => cl >= 2 && cl <= 5 && ce > 0,
};

export interface GateRunResult {
  matched: boolean;
  moves: Move[] | null;
}

export function runGateV2(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: GateVariant): GateRunResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null };
  const conflictEdgeCount = countConflictEdges(cubies);
  if (!variant.matches(analysis.cycleLength, conflictEdgeCount)) return { matched: false, moves: null };
  const search = runInstrumentedBoundedSearch(cubies, analysis.cycleNodes, lib, deadline);
  return { matched: true, moves: search.moves };
}
