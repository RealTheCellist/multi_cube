// --- MultiCycleTraversal (Parity-Gated Cycle Prototype Sprint v1, STEP1
// "multi-cycle traversal") -------------------------------------------------
// After a bridge candidate has been applied, resolves ALL disjoint cycles
// in the resulting (now-merged) WANTS graph in one bounded search. Reuses
// BoundedResolver.ts's own real search engine (resolveBoundedMultiCycle,
// unmodified) -- the same DFS+Deferred-Validation core BP-1/Bridge
// Injection/Deep Cycle Refinement all already use. The only new piece is
// WHICH nodes to traverse: concatenating every disjoint cycle (longest
// first), matching solverPrimitiveCCRPrototype/CCRPrototype.ts's own
// established "multiCycle" strategy (traversalNodesFor(gate,"multiCycle"),
// cited not imported -- that function needs a CCRGateAnalysis shape this
// Sprint's own Gate doesn't produce, so the same simple concatenation
// idea is reimplemented here directly against the real graph.cycles).
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { resolveBoundedMultiCycle, type BoundedResolverResult } from "../solverV2Prototype/BoundedResolver";

export function traverseAllCycles(cubies: Cubie[], lib: WingLibrary, deadline: number): BoundedResolverResult {
  const graph = buildStateGraph(cubies);
  const sortedCycles = [...graph.cycles].sort((a, b) => b.length - a.length);
  const allNodes = sortedCycles.flat();
  if (allNodes.length === 0) return { moves: null, leavesExplored: 0, cycleLength: 0 };
  return resolveBoundedMultiCycle(cubies, allNodes, lib, deadline);
}
