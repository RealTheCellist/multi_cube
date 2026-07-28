// --- LowFootprintCoreSearch (Move Representation Prototype Sprint v1,
// "Commutator 생성" core step) -----------------------------------------------
// The genuinely NEW element this Prototype adds over BP-1/CCR (both of
// which already do a bounded DFS across cycle nodes using
// enumerateWingCandidates -- see PURE_CYCLE_ISOLATION Structural
// Mechanism Analysis Sprint v1): at EVERY hop, candidates are explored in
// ASCENDING order of their own immediate affectedWingCount (measured via
// the same technique Move Representation Gap Analysis Sprint v1 used),
// not in whatever raw order enumerateWingCandidates() returns them. This
// directly operationalizes Move Representation Blueprint Sprint v1's own
// finding: the search itself is already cheap (BP-1/CCR explore only
// 5.6/16.3 leaves on average) -- the missing ingredient is preferring
// low-side-effect branches, never tried before in this exact form.
//
// Reuses MAX_LEAVES_EXPLORED (solverV2Prototype/BoundedResolver.ts, the
// SAME constant BP-1 and CCR already share) and the same 60ms per-hop
// sub-deadline convention -- no new low-level move-generation algorithm,
// only a different exploration ORDER over the existing
// enumerateWingCandidates() output.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";

const PER_HOP_DEADLINE_MS = 60; // same convention BP-1/CCR already use
const MAX_CANDIDATES_PER_HOP = 3; // matches CCR's own width -- this Prototype's difference is ORDER, not breadth

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
  affectedWingCount: number;
}

export interface CoreSearchResult {
  moves: Move[] | null;
  leavesExplored: number;
  maxDepthReached: number;
}

export function searchLowFootprintCore(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number): CoreSearchResult {
  let leavesExplored = 0;
  let maxDepthReached = 0;
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestAffected = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[], depth: number): void {
    leavesExplored++;
    maxDepthReached = Math.max(maxDepthReached, depth);
    const wrongWing = wrongWingCount5(working);
    const affected = countAffectedWings(cubies, working);
    const pair = pairCountOf(working);
    // Primary key: wrongWing (the real objective). Secondary key:
    // affectedWingCount (this Prototype's own added preference for
    // low-footprint leaves among otherwise-equal candidates) -- this is
    // the one deliberate change from BP-1/CCR's own tie-break (which uses
    // only pairCount).
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && affected < bestAffected) || (wrongWing === bestWrongWing && affected === bestAffected && pair > bestPair)) {
      best = { moves, cubies: working, affectedWingCount: affected };
      bestWrongWing = wrongWing;
      bestAffected = affected;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) return;
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
    const rawCandidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP * 3); // over-fetch, then re-rank by footprint
    if (rawCandidates.length === 0) {
      considerLeaf(movesSoFar, working, hopIndex);
      return;
    }

    // The one deliberate change vs BP-1/CCR: rank candidates by their OWN
    // immediate affectedWingCount (ascending) before branching, then take
    // only the top MAX_CANDIDATES_PER_HOP -- explore the least-disruptive
    // options FIRST, not whatever order the library happens to return.
    const rankedCandidates = rawCandidates
      .map((candidate) => {
        const probe = cloneCubies(working);
        applySeq(probe, candidate);
        return { candidate, affected: countAffectedWings(working, probe) };
      })
      .sort((a, b) => a.affected - b.affected)
      .slice(0, MAX_CANDIDATES_PER_HOP)
      .map((r) => r.candidate);

    let anyBranchTried = false;
    for (const candidate of rankedCandidates) {
      if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) break;
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working, hopIndex);
  }

  dfs(cloneCubies(cubies), [], 0);

  if (!best) return { moves: null, leavesExplored, maxDepthReached };
  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return { moves: validation.accepted ? (best as Leaf).moves : null, leavesExplored, maxDepthReached };
}
