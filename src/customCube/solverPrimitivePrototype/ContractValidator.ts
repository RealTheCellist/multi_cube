// --- ContractValidator (Solver Primitive Prototype Sprint v2) ------------
// Verification item 1: does each replay satisfy the Preconditions
// Primitive Blueprint Refinement Sprint v1 actually defined for these two
// candidates? Cited verbatim (Level 2 relaxed preconditions for Multi-Hop
// Bridge, original precondition for Conflict-Dominant Sacrifice Move) --
// not re-derived or reinterpreted.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";

interface StructuralFeatures {
  wrongWingCount: number;
  cycleCount: number;
  swapEdgeCount: number;
  cycleEdgeCount: number;
  conflictEdgeCount: number;
}

function computeFeatures(cubies: ReturnType<typeof deserializeCube>): StructuralFeatures {
  const graph = buildStateGraph(cubies);
  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }
  return { wrongWingCount: wrongWingCount5(cubies), cycleCount: graph.cycles.length, swapEdgeCount, cycleEdgeCount, conflictEdgeCount };
}

export interface PreconditionCheck {
  hash: string;
  matchesMultiHopBridge: boolean;
  matchesConflictSacrifice: boolean;
}

// Blueprint Refinement Sprint v1's own Level 2 relaxed precondition
// (solverPrimitiveBlueprintRefinement/CandidateExpansion.ts, cited).
export function matchesMultiHopBridgeContract(f: StructuralFeatures): boolean {
  return f.wrongWingCount >= 3 && f.wrongWingCount <= 11 && f.cycleCount <= 2 && f.swapEdgeCount <= 1;
}

// Primitive Blueprint Sprint v1's own original precondition
// (solverPrimitiveBlueprint/CandidateExpansion.ts's Conflict-Dominant
// Sacrifice Move design, cited) -- never relaxed in Refinement Sprint v1.
export function matchesConflictSacrificeContract(f: StructuralFeatures): boolean {
  return f.conflictEdgeCount > f.swapEdgeCount + f.cycleEdgeCount;
}

export function checkPreconditions(failuresDbPath: string): PreconditionCheck[] {
  const all150 = loadAll75(failuresDbPath);
  return all150.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const f = computeFeatures(cubies);
    return { hash: s.hash, matchesMultiHopBridge: matchesMultiHopBridgeContract(f), matchesConflictSacrifice: matchesConflictSacrificeContract(f) };
  });
}
