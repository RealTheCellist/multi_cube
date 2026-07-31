// --- CombinedTrial (Solver Primitive Refinement Sprint #1 -- Bridge
// Injection Refinement Sprint v1, STEP4) -------------------------------------
// Builds a single trial function combining a Gate config (STEP2) and a
// Search Contract config (STEP3) -- reuses GateSweepSimulator's checkGate()
// and SearchContractSweepSimulator's resolveBoundedMultiCycleConfigured(),
// no new logic.
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { checkGate, type GateConfig } from "./GateSweepSimulator";
import { resolveBoundedMultiCycleConfigured, type SearchContractConfig } from "./SearchContractSweepSimulator";
import type { TrialFn } from "./EvaluationRunner";

export function buildCombinedTrial(gateConfig: GateConfig, searchConfig: SearchContractConfig): TrialFn {
  return (cubies: Cubie[], lib: WingLibrary, deadline: number) => {
    const gate = checkGate(cubies, gateConfig);
    if (!gate.gateMatched || !gate.cycleNodes) return { gateMatched: false, moves: null as Move[] | null, leavesExplored: 0 };
    const result = resolveBoundedMultiCycleConfigured(cubies, gate.cycleNodes, lib, deadline, searchConfig);
    return { gateMatched: true, moves: result.moves, leavesExplored: result.leavesExplored };
  };
}
