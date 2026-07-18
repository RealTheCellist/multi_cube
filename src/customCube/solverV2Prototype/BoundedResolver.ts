// --- BoundedResolver (Solver v2 Primitive Prototype Sprint v1) ------------
// STEP 2: the Bounded Multi-Cycle Resolver itself. Calls ONLY the existing,
// exported, unmodified enumerateWingCandidates() (fiveByFiveEdges.ts) --
// the same real-move-sequence search tryFixWing() itself uses internally,
// just without tryFixWing()'s own immediate-improvement gate. No new
// rotation algorithm is written anywhere in this file.
//
// Design, and how it differs from both CycleChase and Contract Analysis
// Sprint v1's own "relaxedCycleChase" counterfactual:
//   - CycleChase (primitivePrototype/CycleChasePrototype.ts, untouched):
//     greedy, ONE candidate per hop (whatever tryFixWing finds first),
//     requires each hop to individually improve.
//   - relaxedCycleChase (contractAnalysis/, prior Sprint): also greedy, ONE
//     candidate per hop (the FIRST enumerateWingCandidates result), no
//     exploration -- found to make Coverage WORSE (20.0% vs 22.7%) because
//     a bad early pick can foreclose the rest of the chain with nothing to
//     fall back on.
//   - BoundedResolver (this file): a bounded, deterministic BACKTRACKING
//     search -- tries up to MAX_CANDIDATES_PER_HOP options at EACH hop (not
//     just the first), explores multiple resulting paths through the same
//     cycle, and judges every complete path ONLY at its end (Deferred
//     Validation), keeping whichever explored leaf ends up best. This is
//     the concrete difference "결정적 순서 + 마지막에만 검증" (spec
//     section 3) adds beyond blind greedy acceptance: real exploration,
//     bounded so it never becomes the brute-force/cost-explosion pattern
//     Solver Contract Analysis Sprint v1 already measured as infeasible.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "./DeferredValidator";
import { analyzeMultiCycle } from "./MultiCycleAnalyzer";

// Mirrors CycleChasePrototype.ts's own scoping decision: only worth
// activating on the genuinely uncovered case (a 4+ length cycle) --
// tryFixWing() already natively handles up to a 3-leg cycle in one call.
const MIN_CYCLE_LENGTH = 4;

/**
 * Top-level entry point, matching CycleChasePrototype.ts's own
 * `tryCycleChase(cubies, lib, deadline): Move[] | null` shape exactly, so
 * ReplayBenchmark.ts can compare the two as drop-in alternatives.
 */
export function tryBoundedMultiCycleResolver(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis || analysis.cycleLength < MIN_CYCLE_LENGTH) return null;
  const result = resolveBoundedMultiCycle(cubies, analysis.cycleNodes, lib, deadline);
  return result.moves;
}

// Bounded, disclosed constants -- chosen to stay well inside Solver
// Contract Analysis Sprint v1's own measured cost ceiling (that Sprint's
// exhaustive depth-2 estimate alone was ~1.46s using the REAL average
// branching factor of 5.44; MAX_CANDIDATES_PER_HOP=2 keeps this Sprint's
// own search several orders of magnitude cheaper: 2^6 = 64 leaves max,
// each a handful of clone+apply calls, not a fresh multi-hundred-ms BFS).
export const MAX_CANDIDATES_PER_HOP = 2;
export const MAX_LEAVES_EXPLORED = 64;
// A per-call sub-budget for each enumerateWingCandidates() invocation --
// without this, a single slow hop (that function's own internal
// bfsMoveWingToPosition search can cost well over 100ms on a hard case,
// see Solver Contract Analysis Sprint v1's own measured ~49ms AVERAGE,
// implying a heavier tail) could consume the ENTIRE remaining deadline
// before any other candidate or hop is ever tried, silently discarding
// this whole branch with nothing recorded -- the same "unreserved budget
// starves the later step" bug Adaptive Executor v2 already hit once with
// Recovery.
const PER_HOP_DEADLINE_MS = 60;

export interface BoundedResolverResult {
  moves: Move[] | null; // null if no explored leaf net-improves WrongWing (Deferred Validation rejects)
  leavesExplored: number;
  cycleLength: number;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

/**
 * Traverses `cycleNodes` (a fixed, already-decided order from
 * MultiCycleAnalyzer.ts -- never re-picks a different cycle mid-search) via
 * a bounded DFS: at each hop, tries up to MAX_CANDIDATES_PER_HOP real move
 * candidates from enumerateWingCandidates() REGARDLESS of whether that
 * candidate alone improves anything (no per-hop gate), branching into each.
 * A hop with no wrong wing left to fix, or no candidate at all, simply ends
 * that branch there (partial progress is still a valid leaf to judge).
 * Every complete branch is a "leaf"; the caller judges leaves via
 * DeferredValidator only after this function returns the best one found.
 */
export function resolveBoundedMultiCycle(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number): BoundedResolverResult {
  let leavesExplored = 0;
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[]): void {
    leavesExplored++;
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) return;
    if (hopIndex >= cycleNodes.length) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const slot = cycleNodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1); // already resolved earlier in this same path -- move on
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP);
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working); // dead end -- still a valid (partial) leaf to judge
      return;
    }

    let anyBranchTried = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) break;
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working); // overall deadline hit before any candidate could be tried -- still record current progress
  }

  dfs(cloneCubies(cubies), [], 0);

  if (!best) return { moves: null, leavesExplored, cycleLength: cycleNodes.length };
  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return { moves: validation.accepted ? (best as Leaf).moves : null, leavesExplored, cycleLength: cycleNodes.length };
}
