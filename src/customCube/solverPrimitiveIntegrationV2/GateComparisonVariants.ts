// --- GateComparisonVariants (Solver Primitive Integration Sprint v2) ------
// Baseline: reconstructs REPAIR's PRE-Sprint Gate (cycleLength 2~4 AND
// conflictEdgeCount>0) for comparison purposes -- a thin wrapper that
// pre-checks countConflictEdges (UNMODIFIED, imported from
// MultiHopBridgePrototypeV3.ts) before delegating to the REAL,
// now-production runSuccessV2. No DFS reimplementation needed at all
// (unlike Gate Relaxation Validation Sprint v1's own G1, which had to
// reimplement the search body since the relaxed behavior didn't exist
// yet anywhere callable) -- now that production itself IS the relaxed
// Gate, reconstructing the OLD, narrower Gate is just "check one more
// condition before calling the same function."
//
// Candidate: the ACTUAL production runSuccessV2, called directly,
// unmodified -- this Sprint's own STEP1 change (this file doesn't touch
// or duplicate it).
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import { runSuccessV2, W2_WIDER_HOP, type SearchRunResult } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";

export type GateComparisonVariant = "baseline_strictGate" | "candidate_relaxedGate";

function runBaseline(cubies: Cubie[], lib: WingLibrary, deadline: number): SearchRunResult {
  if (countConflictEdges(cubies) === 0) return { matched: false, moves: null };
  return runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP);
}

function runCandidate(cubies: Cubie[], lib: WingLibrary, deadline: number): SearchRunResult {
  return runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP);
}

export function runGateVariant(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: GateComparisonVariant): SearchRunResult {
  return variant === "baseline_strictGate" ? runBaseline(cubies, lib, deadline) : runCandidate(cubies, lib, deadline);
}

export { countConflictEdges };
