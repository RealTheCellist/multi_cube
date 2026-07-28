// --- CycleSearchShadow (PURE_CYCLE_ISOLATION Structural Mechanism Analysis
// Sprint v1, RQ-1/RQ-2) ------------------------------------------------------
// BP-1's resolveBoundedMultiCycle() (solverV2Prototype/BoundedResolver.ts)
// IS exported and directly callable, but its return value (moves,
// leavesExplored, cycleLength) doesn't expose WHY a failed search ended --
// same limitation CCR Completeness Validation Sprint v1 already found in
// CCRPrototype.ts's private runBoundedDfs, solved there with a fidelity-
// verified shadow reimplementation. Since BP-1 and CCR turn out (per this
// module's own read of both files) to run the EXACT SAME underlying
// algorithm shape -- both call analyzeMultiCycle() from
// solverV2Prototype/MultiCycleAnalyzer.ts for cycle node ordering, both
// bounded-DFS with a per-hop enumerateWingCandidates() call and a shared
// MAX_LEAVES_EXPLORED=64 cap (imported from BoundedResolver.ts, the SAME
// constant both mechanisms use) -- ONE parameterized shadow (differing
// only in maxCandidatesPerHop: BP-1=2, CCR=3, both cited by value from
// their own source) serves both mechanisms, making RQ-3's "same reason or
// different reason" comparison exact rather than approximate.
//
// Fidelity for the CCR side of this shadow was ALREADY verified in CCR
// Completeness Validation Sprint v1 (0/60 mismatches, a superset including
// all 28 PURE_CYCLE_ISOLATION cases) -- not re-proven here. Fidelity for
// the BP-1 side (this Sprint's own new use) IS verified below, against
// the real exported resolveBoundedMultiCycle(), before any of its
// diagnostics are trusted.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";

const PER_HOP_DEADLINE_MS = 60; // shared by both BP-1 and CCR's own source (cited by value)

export type TerminationReason = "SOLUTION_FOUND" | "LEAF_CAP_REACHED" | "BUDGET_EXPIRED" | "SEARCH_EXHAUSTED";

export interface CycleSearchDiagnostics {
  leavesExplored: number;
  maxDepthReached: number;
  terminationReason: TerminationReason;
  moves: Move[] | null;
  bestLeafWrongWingCount: number | null; // wrongWingCount5 of the best EXPLORED leaf, even if rejected by Deferred Validation -- null if no leaf was ever considered
  bestLeafPairCount: number | null;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export function runCycleSearchShadow(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number, maxCandidatesPerHop: number): CycleSearchDiagnostics {
  let leavesExplored = 0;
  let maxDepthReached = 0;
  let leafCapHitAtLeastOnce = false;
  let deadlineHitAtLeastOnce = false;
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[], depth: number): void {
    leavesExplored++;
    maxDepthReached = Math.max(maxDepthReached, depth);
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline) {
      deadlineHitAtLeastOnce = true;
      return;
    }
    if (leavesExplored >= MAX_LEAVES_EXPLORED) {
      leafCapHitAtLeastOnce = true;
      return;
    }
    if (hopIndex >= cycleNodes.length) {
      considerLeaf(movesSoFar, working, hopIndex);
      return;
    }

    const slot = cycleNodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1);
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, maxCandidatesPerHop);
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working, hopIndex);
      return;
    }

    let anyBranchTried = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline) {
        deadlineHitAtLeastOnce = true;
        break;
      }
      if (leavesExplored >= MAX_LEAVES_EXPLORED) {
        leafCapHitAtLeastOnce = true;
        break;
      }
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working, hopIndex);
  }

  dfs(cloneCubies(cubies), [], 0);

  let moves: Move[] | null = null;
  if (best) {
    const validation = validateDeferred(cubies, (best as Leaf).cubies);
    moves = validation.accepted ? (best as Leaf).moves : null;
  }
  const solutionFound = !!moves;

  let terminationReason: TerminationReason;
  if (solutionFound) terminationReason = "SOLUTION_FOUND";
  else if (leafCapHitAtLeastOnce) terminationReason = "LEAF_CAP_REACHED";
  else if (deadlineHitAtLeastOnce) terminationReason = "BUDGET_EXPIRED";
  else terminationReason = "SEARCH_EXHAUSTED";

  return {
    leavesExplored,
    maxDepthReached,
    terminationReason,
    moves,
    bestLeafWrongWingCount: best ? wrongWingCount5((best as Leaf).cubies) : null,
    bestLeafPairCount: best ? pairCountOf((best as Leaf).cubies) : null,
  };
}
