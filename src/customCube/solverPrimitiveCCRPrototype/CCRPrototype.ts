// --- CCRPrototype (CCR Prototype Sprint v1) --------------------------------
// STEP1. `runCCRPrototype()` -- Primitive #2's first real Prototype. Per
// the Work Order: reuse the bounded DFS + Deferred Validation search core
// AS-IS (a disclosed, independent reimplementation of
// solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts's own DFS
// body -- same established "one axis changed" pattern used throughout
// this whole research arc: enumerateWingCandidates/applySeq/
// wrongWingCount5/pairCountOf/validateDeferred are all EXISTING exports,
// unmodified). What's genuinely NEW here is only: (1) CCRGate.ts's own
// Gate (cycleLength 5~6, conflictEdgeCount=0 -- no relaxation), (2) a
// caller-supplied budget (deadline) instead of REPAIR's own hardcoded
// 75ms reservedBudget slice -- this Sprint's own STEP3 compares several
// candidate budgets rather than assuming one, and (3) a `strategy` switch
// for STEP4's multi-cycle comparison: "singleCycle" traverses only the
// primary (longest) cycle's nodes (REPAIR's own existing approach,
// applied to a longer cycle); "multiCycle" concatenates EVERY disjoint
// cycle's nodes (longest first) into one traversal, so a single bounded
// search can make progress on more than one cycle per attempt. Never
// wired into production Recovery/Executor/Planner/Engine -- this file is
// a standalone, callable Prototype only.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { analyzeCcrGate, type CCRGateAnalysis } from "./CCRGate";

const PER_HOP_DEADLINE_MS = 60; // matches REPAIR's own per-hop sub-budget (SuccessOptimizationV2.ts) -- unrelated to the outer budget under test in STEP3
const MAX_CANDIDATES_PER_HOP = 3; // == W2_WIDER_HOP's own value -- STEP1 explicitly reuses the search core as-is, not a "smarter DFS"

export type CCRStrategy = "singleCycle" | "multiCycle";

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export function traversalNodesFor(gate: CCRGateAnalysis, strategy: CCRStrategy): string[] {
  if (strategy === "singleCycle") return gate.primaryCycleNodes;
  // multiCycle: every disjoint cycle's nodes, longest cycle first -- lets
  // one bounded search make progress across more than one cycle, since
  // Discovery Sprint #3 found 91.9% of this population has multiple
  // disjoint cycles coexisting.
  return gate.allCycles.flat();
}

function runBoundedDfs(cubies: Cubie[], nodes: readonly string[], lib: WingLibrary, deadline: number): Move[] | null {
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
    if (hopIndex >= nodes.length) {
      considerLeaf(movesSoFar, working);
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
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working);
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
    if (!anyBranchTried) considerLeaf(movesSoFar, working);
  }

  dfs(cloneCubies(cubies), [], 0);
  if (!best) return null;
  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return validation.accepted ? (best as Leaf).moves : null;
}

export interface CCRPrototypeResult {
  matched: boolean; // Gate accepted this state
  moves: Move[] | null; // non-null only if Deferred Validation also accepted a net-improving leaf
  gate: CCRGateAnalysis;
}

export function runCCRPrototype(cubies: Cubie[], lib: WingLibrary, deadline: number, strategy: CCRStrategy = "singleCycle"): CCRPrototypeResult {
  const gate = analyzeCcrGate(cubies);
  if (!gate.eligible) return { matched: false, moves: null, gate };
  const nodes = traversalNodesFor(gate, strategy);
  const moves = runBoundedDfs(cubies, nodes, lib, deadline);
  return { matched: true, moves, gate };
}
