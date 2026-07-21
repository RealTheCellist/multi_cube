// --- SuccessOptimizationV2 (Solver Primitive Prototype Refinement Sprint
// v2) -- Strategy B: keeps the NEW baseline's exact gate (A1_wideCycle,
// cycleLength 2~4 AND conflictEdgeCount>0) fixed, and varies the bounded
// DFS's own internal search behavior. Mirrors
// solverPrimitivePrototypeRefinement/SuccessOptimizationVariants.ts's own
// disclosed pattern, but that file hardcodes A0's 2~3 band internally
// (imported from MultiHopBridgePrototypeV3's MIN/MAX_BRIDGE_CYCLE_LENGTH),
// so it cannot be reused directly for A1's wider 2~4 band -- this is an
// independent reimplementation with the updated gate bound, reusing the
// same low-level building blocks (enumerateWingCandidates/applySeq/
// wrongWingCount5/pairCountOf/validateDeferred, all EXISTING exports,
// unmodified) exactly like every prior Sprint's own DFS reimplementation
// in this series.
//
// GATE CHANGE (Solver Primitive Integration Sprint v2, 2026-07-21): the
// `conflictEdgeCount>0` requirement was REMOVED from runSuccessV2's own
// Gate below -- Gate Relaxation Validation Sprint v1 established
// (Standard Evaluation Protocol, N=15, two independent full runs) that
// this requirement was an empirically-chosen Blueprint precondition, not
// a real mechanical necessity: relaxing it resolves 17-19 of the
// 77-snapshot `cycleLength 2~4, conflictEdgeCount=0` population that
// REPAIR could never reach before, with a paired-diff 95% CI excluding
// zero and ZERO regressions in both runs (G1's Gate is a strict superset
// of the old Gate, using the byte-identical search below, so it
// provably cannot perform worse on the cases the old Gate already
// covered). The Gate is now simply `cycleLength 2~4` -- the DFS body
// (runParametrizedSearchV2), the SuccessVariant options
// (W1_REORDERED/W2_WIDER_HOP), and every low-level building block below
// are completely unchanged; this Sprint's own STEP1 change is this file's
// single deleted line (and its now-unused import) and nothing else.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";

const PER_HOP_DEADLINE_MS = 60;
const MIN_CYCLE_LENGTH = 2;
const MAX_CYCLE_LENGTH = 4; // A1_wideCycle's own upper bound -- this Sprint's new baseline gate, unchanged by Strategy B

export interface SearchOptions {
  maxCandidatesPerHop: number;
  reorderByImmediateImprovement: boolean;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

function runParametrizedSearchV2(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number, options: SearchOptions): Move[] | null {
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
      dfs(working, movesSoFar, hopIndex + 1);
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    let candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, options.maxCandidatesPerHop);

    if (options.reorderByImmediateImprovement && candidates.length > 1) {
      const before = wrongWingCount5(working);
      const scored = candidates.map((c) => {
        const trial = cloneCubies(working);
        applySeq(trial, c);
        return { c, improvement: before - wrongWingCount5(trial) };
      });
      scored.sort((a, b) => b.improvement - a.improvement);
      candidates = scored.map((s) => s.c);
    }

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

export interface SuccessVariant {
  name: string;
  options: SearchOptions;
}

export const W1_REORDERED: SuccessVariant = {
  name: "W1_reordered (A1 gate, maxCandidatesPerHop=2, 즉시 개선량 내림차순 정렬)",
  options: { maxCandidatesPerHop: 2, reorderByImmediateImprovement: true },
};
export const W2_WIDER_HOP: SuccessVariant = {
  name: "W2_widerHop (A1 gate, maxCandidatesPerHop=3, 순서 그대로)",
  options: { maxCandidatesPerHop: 3, reorderByImmediateImprovement: false },
};

export interface SearchRunResult {
  matched: boolean;
  moves: Move[] | null;
}

export function runSuccessV2(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: SuccessVariant): SearchRunResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null };
  if (analysis.cycleLength < MIN_CYCLE_LENGTH || analysis.cycleLength > MAX_CYCLE_LENGTH) return { matched: false, moves: null };
  const moves = runParametrizedSearchV2(cubies, analysis.cycleNodes, lib, deadline, variant.options);
  return { matched: true, moves };
}
