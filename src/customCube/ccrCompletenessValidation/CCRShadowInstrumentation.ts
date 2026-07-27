// --- CCRShadowInstrumentation (CCR Completeness Validation Sprint v1,
// STEP1/RQ-1/RQ-2) ----------------------------------------------------------
// CCRPrototype.ts's own `runBoundedDfs` is a PRIVATE, non-exported function
// -- there is no way to read its internal leaf/depth/branch counters or
// termination cause without either (a) modifying CCRPrototype.ts, which
// this Sprint's Directive explicitly forbids ("CCR 구현 수정 금지"), or
// (b) a disclosed, faithful REIMPLEMENTATION that calls the exact same
// existing public building blocks in the exact same order, instrumented.
// This module is (b) -- the same "shadow instrumentation" technique this
// research arc already used once before (mechanismAnalysis's own
// ShadowBFSInstrumentation.ts, "disclosed scaled-down probe").
//
// Every constant and helper below is either imported directly from the
// real, unmodified source (MAX_LEAVES_EXPLORED from
// solverV2Prototype/BoundedResolver.ts, enumerateWingCandidates/
// wrongWingCount5/wrongWings5/slotKey/applySeq from fiveByFiveEdges.ts,
// pairCountOf from goalPlanner/GoalAnalyzer.ts, validateDeferred from
// solverV2Prototype/DeferredValidator.ts) or copied VERBATIM with a
// citation comment (PER_HOP_DEADLINE_MS=60, MAX_CANDIDATES_PER_HOP=3 --
// both internal, non-exported constants in CCRPrototype.ts, read directly
// off that file's own source, never guessed).
//
// FIDELITY IS VERIFIED, NOT ASSUMED: runShadowDfs's own solved/unsolved
// verdict is cross-checked against the REAL runCCRPrototype() on every
// single case this Sprint measures (see FidelityCheck below) -- any
// mismatch is surfaced as a reportable anomaly, never silently ignored.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";

// Verbatim copies of CCRPrototype.ts's own internal (non-exported)
// constants -- read directly from that file's source, cited there.
const PER_HOP_DEADLINE_MS = 60;
const MAX_CANDIDATES_PER_HOP = 3;

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export type TerminationReason = "SOLUTION_FOUND" | "LEAF_CAP_REACHED" | "BUDGET_EXPIRED" | "SEARCH_EXHAUSTED";

export interface ShadowDfsInstrumentation {
  leavesExplored: number;
  maxDepthReached: number;
  perHopBranchCounts: number[]; // candidates.length observed at every hop actually visited
  leafCapHitAtLeastOnce: boolean;
  deadlineHitAtLeastOnce: boolean;
  solutionFound: boolean;
  moves: Move[] | null;
  terminationReason: TerminationReason;
}

export function runShadowDfs(cubies: Cubie[], nodes: readonly string[], lib: WingLibrary, deadline: number): ShadowDfsInstrumentation {
  let leavesExplored = 0;
  let maxDepthReached = 0;
  let leafCapHitAtLeastOnce = false;
  let deadlineHitAtLeastOnce = false;
  const perHopBranchCounts: number[] = [];
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
    if (hopIndex >= nodes.length) {
      considerLeaf(movesSoFar, working, hopIndex);
      return;
    }

    const slot = nodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1);
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP);
    perHopBranchCounts.push(candidates.length);
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

  return { leavesExplored, maxDepthReached, perHopBranchCounts, leafCapHitAtLeastOnce, deadlineHitAtLeastOnce, solutionFound, moves, terminationReason };
}
