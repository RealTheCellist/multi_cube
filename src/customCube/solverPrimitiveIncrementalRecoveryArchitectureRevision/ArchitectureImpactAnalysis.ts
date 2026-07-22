// --- ArchitectureImpactAnalysis (Incremental Recovery Architecture
// Blueprint Revision Sprint v1) --------------------------------------------
// STEP5. Production change candidates, grounded in DIRECT, read-only
// inspection of fiveByFiveEdges.ts's real source (never modified this
// Sprint or any prior one) -- not speculation. Two real, code-level facts
// established by this inspection, cited throughout:
//   (1) bfsMoveWingToPosition() (fiveByFiveEdges.ts:703) has a NODE-COUNT
//       bound only (nodesExplored > MAX_TRACK_NODES=8000) -- zero
//       Date.now() calls anywhere in the function.
//   (2) bfsMoveWingToPosition has 6 internal call sites within
//       fiveByFiveEdges.ts, including tryFixWing() (the REAL production
//       PAIR-task path fiveByFiveEdgeExecutor.ts calls on every single
//       PAIR/FLIP task, not just Incremental Recovery) and
//       enumerateWingCandidates() (called from 22 files project-wide).
//       tryFixWing's own inner loop nests it TWO levels deep
//       (`for (match1) { ... for (match2) { bfsMoveWingToPosition(...) } }`)
//       with a deadline check only at the OUTER two loop levels, not the
//       innermost -- an even coarser granularity gap than
//       enumerateWingCandidates's own single-level nesting.
export type ProductionChangeCandidateId = "deadlineGranularity" | "traversalInterruptibility" | "budgetCallback" | "searchYieldPoint";

export interface ProductionChangeCandidate {
  id: ProductionChangeCandidateId;
  name: string;
  description: string;
  expectedEffect: string;
  risk: "low" | "medium" | "high";
  existingCodeImpactScope: string;
  priority: 1 | 2 | 3 | 4; // 1 = highest
}

export const PRODUCTION_CHANGE_CANDIDATES: ProductionChangeCandidate[] = [
  {
    id: "deadlineGranularity",
    name: "enumerateWingCandidates/tryFixWing Deadline Granularity",
    description:
      "Add a `Date.now() > deadline` check inside the currently-unchecked inner loops -- enumerateWingCandidates's `for (const match of matches)` loop, and tryFixWing's innermost `for (const match2 of matchesForP3)` loop -- so the OUTER function can bail out between bfsMoveWingToPosition calls, not just between entries.",
    expectedEffect:
      "Prevents MULTIPLE uninterruptible bfsMoveWingToPosition calls from compounding within a single enumerateWingCandidates/tryFixWing invocation (currently possible whenever `matches`/`matchesForP3` has more than one candidate) -- would reduce, but NOT eliminate, overrun, since a single bfsMoveWingToPosition call can still take up to its own ~8000-node budget uninterrupted.",
    risk: "low",
    existingCodeImpactScope:
      "2 functions, both in fiveByFiveEdges.ts (protected, called out separately from 기존 Primitive in this Sprint's own scope) -- a pure addition of early-exit checks inside existing loops, no change to search semantics, no change to any function signature. Affects the real production PAIR-task path (tryFixWing) as well as every Prototype built on enumerateWingCandidates (22 files).",
    priority: 2,
  },
  {
    id: "traversalInterruptibility",
    name: "bfsMoveWingToPosition Traversal Interruptibility",
    description:
      "Add an optional `deadline` parameter to bfsMoveWingToPosition() itself, checked every K nodes (e.g. every 100-200, alongside the existing `nodesExplored > MAX_TRACK_NODES` check) -- directly targets the root cause identified in BottleneckAttribution.ts (the single function with a real, measured single-call time up to 1003ms and ZERO internal time checks).",
    expectedEffect:
      "Directly fixes the dominant root cause -- Prototype Refinement Sprint v1's own STEP2 found this exact function's absence of a time check as the largest single contributor to Budget Overrun (max single-hop 1003ms against a 40ms nominal budget). This is the only candidate that addresses the PRIMARY bottleneck rather than a downstream symptom of it.",
    risk: "medium",
    existingCodeImpactScope:
      "1 function (bfsMoveWingToPosition), but with 6 internal call sites across fiveByFiveEdges.ts needing a deadline argument threaded through -- including tryFixWing (called on EVERY PAIR/FLIP task in real production, not just Incremental Recovery) and enumerateWingCandidates (22 project-wide callers). A signature change here has the WIDEST blast radius of the 4 candidates: every caller needs an explicit decision about what deadline to pass (or a safe default), and any caller that doesn't check for a new possible early-`null`-return outcome needs review.",
    priority: 1,
  },
  {
    id: "budgetCallback",
    name: "Budget Callback (cooperative shouldAbort() pattern)",
    description:
      "Replace direct `Date.now() > deadline` comparisons throughout the search functions with a caller-supplied `shouldAbort(): boolean` callback -- allows composing budget policies (e.g. this Sprint's own reservedSlice/softDeadline/budgetAwareTraversal) without hardcoding a deadline value at every call site, and opens the door to non-time-based abort conditions (e.g. an external cancellation signal).",
    expectedEffect:
      "An architectural improvement to FLEXIBILITY, not a direct fix for Budget Overrun by itself -- would need to be paired with traversalInterruptibility (adding actual abort CHECKS inside bfsMoveWingToPosition) to have any measurable effect; on its own, replacing an existing working deadline check with an equivalent callback changes nothing about WHERE checks happen.",
    risk: "medium",
    existingCodeImpactScope:
      "Touches every function that currently takes a `deadline: number` parameter (both Primitive-layer dfs() bodies and Production-layer enumerateWingCandidates/bfsMoveWingToPosition/tryFixWing) -- a signature-level refactor across the whole search call graph, even though the actual CHECK LOGIC (Date.now() comparison) barely changes. Higher churn-to-benefit ratio than traversalInterruptibility alone.",
    priority: 4,
  },
  {
    id: "searchYieldPoint",
    name: "Search Yield Point (resumable/incremental search state)",
    description:
      "Restructure the recursive DFS/BFS bodies into an explicit, resumable state machine (e.g. a generator function or an explicit frontier/stack object) so a caller can pause a search after any bounded slice of work and resume it later across multiple event-loop turns, rather than blocking synchronously until completion or deadline.",
    expectedEffect:
      "The only candidate that could give TRUE async yielding (letting other work interleave mid-search) rather than just a tighter synchronous deadline check -- but this is a fundamentally different execution model from every search function in this codebase today (all synchronous, recursive, deadline-terminated), and none of this Sprint arc's own real measurements point to 'the search blocks the event loop too long for OTHER reasons' as a problem -- the measured problem is specifically 'the search runs past ITS OWN deadline,' which traversalInterruptibility already solves without an execution-model change.",
    risk: "high",
    existingCodeImpactScope:
      "Would require rewriting bfsMoveWingToPosition, enumerateWingCandidates, tryFixWing, AND every Primitive's own dfs()/runBoundedDfs()/runParametrizedSearchV2() body -- the largest rewrite of the 4 candidates, touching Production, the search library, and every existing Primitive simultaneously, for a benefit (async yielding) this Sprint's own real data does not show a need for.",
    priority: 3,
  },
];

export function sortedByPriority(): ProductionChangeCandidate[] {
  return [...PRODUCTION_CHANGE_CANDIDATES].sort((a, b) => a.priority - b.priority);
}
