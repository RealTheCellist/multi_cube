// --- EndgameEfficiencyOpportunity (ENDGAME Optimization Blueprint Sprint
// v1, STEP4) -----------------------------------------------------------------
// DESIGN ONLY -- no implementation. Compares non-Budget efficiency
// candidates for ENDGAME's own real functions (bestFixOverall/
// tryEndgameMultiPly/tryEndgameThroughDisruption, all in fiveByFiveEdges.ts,
// read-only this Sprint), grounded in direct inspection of their REAL
// current structure:
//   - bestFixOverall: tries the cheap tryFlipWingsInPlace first, then loops
//     shuffle(wrongWings5(cubies)) calling tryFixWing per wing until one
//     succeeds (or none do).
//   - tryEndgameMultiPly: loops shuffle(wrongWings5(cubies)), calls
//     enumerateWingCandidates(maxResults=12) per wing, applies each
//     candidate speculatively (tolerating ENDGAME_PLY1_SLACK=2 regression)
//     then re-tries bestFixOverall as the follow-up ply.
//   - runPrimaryPipeline's ENDGAME branch: loops bestFixOverall up to
//     guard<50 times (continuing on success), falling back to
//     tryEndgameMultiPly only once wrongWingCount5<=ENDGAME_MULTIPLY_THRESHOLD,
//     then one unconditional tryEndgameThroughDisruption attempt at the end.
export type EfficiencyCandidateId = "candidateOrdering" | "earlyExit" | "branchPruning" | "duplicateSkip" | "searchReordering";

export interface EfficiencyCandidateRow {
  id: EfficiencyCandidateId;
  name: string;
  realCodeContext: string;
  productionChangeScope: string;
  expectedEffect: string;
  risk: "low" | "medium" | "high";
}

export const EFFICIENCY_CANDIDATES: EfficiencyCandidateRow[] = [
  {
    id: "candidateOrdering",
    name: "Candidate Ordering (replace shuffle() with a heuristic order)",
    realCodeContext:
      "bestFixOverall/tryEndgameMultiPly both call shuffle(wrongWings5(cubies)) -- a real, unmodified Math.random()-based order, not a heuristic one. Every wrong wing gets an equal, random chance of being tried first.",
    productionChangeScope: "2 call sites (bestFixOverall, tryEndgameMultiPly) -- replace shuffle() with a scored sort (e.g. by candidatesForWing(lib,w).length, or by proximity to a completable 2-3-cycle).",
    expectedEffect: "Could reach a winning candidate sooner within the SAME budget, converting some of the 120-500ms Saturation Curve's own low-improvement region into more successes -- but the real magnitude is unmeasured (this Sprint's own Saturation Curve varied BUDGET, not ordering, on the same random order).",
    risk: "medium",
  },
  {
    id: "earlyExit",
    name: "Early Exit (stop bestFixOverall's per-wing loop the instant ANY improving move is found)",
    realCodeContext:
      "bestFixOverall's own for-loops already return immediately on the FIRST improving fix (both the flip loop and the tryFixWing loop) -- this is already the real, current behavior, not a gap.",
    productionChangeScope: "None -- already implemented.",
    expectedEffect: "No additional gain available here; this candidate is effectively already captured by the existing code.",
    risk: "low",
  },
  {
    id: "branchPruning",
    name: "Branch Pruning (skip candidatesForWing entries that can't possibly help before running the expensive bfsMoveWingToPosition setup search)",
    realCodeContext:
      "tryFixWing (called from bestFixOverall) already prunes disruptive entries via its own otherDisruptionsSafe check BEFORE calling bfsMoveWingToPosition -- real, existing pruning. tryEndgameMultiPly's own enumerateWingCandidates call does the SAME pruning (shared code path). No additional un-pruned branch was found by direct inspection.",
    productionChangeScope: "None identified beyond what's already implemented -- would need a NEW pruning signal (e.g. a cheap lower-bound heuristic on remaining cycle length) that doesn't exist in the codebase today.",
    expectedEffect: "Speculative -- no measured baseline for a lower-bound heuristic exists in this whole research arc; would need its own Prototype Sprint to even estimate a real number.",
    risk: "high",
  },
  {
    id: "duplicateSkip",
    name: "Duplicate Skip (avoid re-trying a wing/candidate combination already tried this ENDGAME call)",
    realCodeContext:
      "Within a SINGLE bestFixOverall call, each wrong wing is tried at most once per invocation (no duplication inside one call). Across the outer while(guard<50) loop, each iteration operates on a NEW cube state (only reached after a successful prior fix), so there is no repeated-failure duplication there either -- a failure inside bestFixOverall causes the whole ENDGAME branch to fall through/break, not retry the same state. The one place real duplication COULD occur is across genDisrupt1/genDisrupt2 in Recovery (tryEndgameThroughDisruption called twice with different maxDisruptions/recurseDepth) -- but that's Recovery-layer, out of this Sprint's ENDGAME-focused scope.",
    productionChangeScope: "None identified within ENDGAME's own real call structure -- the premise (redundant re-tries within one ENDGAME invocation) does not match the real code.",
    expectedEffect: "Not applicable at the ENDGAME layer as currently structured -- disclosed rather than fabricated.",
    risk: "low",
  },
  {
    id: "searchReordering",
    name: "Search Reordering (try tryEndgameMultiPly BEFORE exhausting bestFixOverall's own guard<50 loop)",
    realCodeContext:
      "runPrimaryPipeline's real ENDGAME branch only reaches tryEndgameMultiPly once EITHER bestFixOverall fails outright OR wrongWingCount5<=ENDGAME_MULTIPLY_THRESHOLD -- meaning the more powerful (but more expensive) multi-ply search is always a fallback, never tried first even when the residual is already small enough to qualify.",
    productionChangeScope: "1 call site (runPrimaryPipeline's ENDGAME branch) -- reorder the two calls, or interleave them by residual size from the start rather than only after bestFixOverall exhausts its own guard budget.",
    expectedEffect: "Could reach a multi-ply-only-solvable state earlier within the SAME wall-clock budget on small-residual snapshots -- directly relevant given this Sprint's own Reachability Sprint found most Reachable snapshots' residual is already small by the time ENDGAME is dequeued.",
    risk: "medium",
  },
];
