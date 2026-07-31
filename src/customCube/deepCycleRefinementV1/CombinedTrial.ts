// --- CombinedTrial (Solver Primitive Refinement Sprint #2 -- Deep Cycle
// Refinement Sprint v1, STEP4) -----------------------------------------------
// Builds a single trial function combining a Gate config (this Sprint's own
// STEP2) and a Search Contract config -- reuses this Sprint's own
// checkGate() plus bridgeInjectionRefinementV1's own
// resolveBoundedMultiCycleConfigured(), NOT a re-duplicated third copy: it
// is the exact same underlying algorithm (BoundedResolver's bounded DFS
// over cycleNodes, judged only at the leaf via validateDeferred) regardless
// of which Blueprint's gate found those cycleNodes, so reusing the Bridge
// Injection Sprint's own disclosed-duplicate is more honest than writing a
// near-identical copy a third time.
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { checkGate, type GateConfig } from "./GateSweepSimulator";
import { resolveBoundedMultiCycleConfigured, type SearchContractConfig } from "../bridgeInjectionRefinementV1/SearchContractSweepSimulator";
import type { TrialFn } from "./EvaluationRunner";

export function buildCombinedTrial(gateConfig: GateConfig, searchConfig: SearchContractConfig): TrialFn {
  return (cubies: Cubie[], lib: WingLibrary, deadline: number) => {
    const gate = checkGate(cubies, gateConfig);
    if (!gate.gateMatched || !gate.cycleNodes) return { gateMatched: false, moves: null as Move[] | null, leavesExplored: 0 };
    const result = resolveBoundedMultiCycleConfigured(cubies, gate.cycleNodes, lib, deadline, searchConfig);
    return { gateMatched: true, moves: result.moves, leavesExplored: result.leavesExplored };
  };
}
