// --- GateRelaxationVariants (Gate Relaxation Validation Sprint v1) --------
// Tests whether REPAIR (W2_widerHop)'s own conflictEdgeCount>0 requirement
// is a real mechanical necessity or just an empirically-chosen Blueprint
// precondition, per Primitive Discovery Sprint #2's own flagged open
// question -- BEFORE committing to a whole new Primitive (CCR).
//
//   G0 (기존/baseline): cycleLength 2~4 AND conflictEdgeCount>0 -- this IS
//     REPAIR's real production Gate, so G0 is measured by calling
//     runSuccessV2 DIRECTLY, UNMODIFIED (no reimplementation risk at all).
//   G1 (Relaxed): cycleLength 2~4 only (conflictEdgeCount check removed).
//     runSuccessV2 itself hardcodes the conflict-edge check inline (not
//     exposed as a swappable parameter) and its own internal DFS engine
//     (runParametrizedSearchV2) isn't exported, so there is no way to get
//     G1's behavior by calling existing exports with different arguments.
//     G1 is therefore a hop-for-hop reimplementation of runSuccessV2's own
//     DFS body -- identical MIN/MAX_CYCLE_LENGTH bounds, identical
//     W2_WIDER_HOP search options (maxCandidatesPerHop=3,
//     reorderByImmediateImprovement=false), identical leaf-selection and
//     validateDeferred call -- with EXACTLY ONE line removed (the
//     `countConflictEdges(cubies) === 0` early return). This mirrors the
//     exact same "independent reimplementation, one axis changed" pattern
//     SuccessOptimizationV2.ts's OWN header comment describes for itself
//     relative to its predecessor -- the established precedent for this
//     whole Sprint series whenever an existing file's gate/search isn't
//     independently swappable. No new search algorithm, no new pruning,
//     no new leaf-selection rule -- every low-level building block
//     (enumerateWingCandidates/applySeq/wrongWingCount5/pairCountOf/
//     validateDeferred/analyzeMultiCycle/countConflictEdges) is imported
//     UNMODIFIED from the existing, protected files.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";

// Identical to SuccessOptimizationV2.ts's own (unexported) constants --
// redeclared here for the same reason that file redeclares
// BoundedResolver.ts's PER_HOP_DEADLINE_MS: not importable, so the
// identical disclosed value is restated rather than invented anew.
const PER_HOP_DEADLINE_MS = 60;
const MIN_CYCLE_LENGTH = 2;
const MAX_CYCLE_LENGTH = 4;
// W2_WIDER_HOP's own SearchOptions, restated -- G1 isolates the Gate as
// the ONLY variable versus G0, so the search behavior must be identical.
const SEARCH_OPTIONS = { maxCandidatesPerHop: 3, reorderByImmediateImprovement: false };

export type GateRelaxationVariant = "G0_existing" | "G1_relaxed";

export interface GateRelaxationResult {
  matched: boolean;
  moves: Move[] | null;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

// Byte-for-byte the same DFS shape as SuccessOptimizationV2.ts's own
// runParametrizedSearchV2 -- see this file's own header comment for why
// it has to be reimplemented rather than imported.
function runRelaxedSearch(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number): Move[] | null {
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
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, SEARCH_OPTIONS.maxCandidatesPerHop);

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

/** G1: cycleLength 2~4 only -- the SAME cycle-length bound as G0/REPAIR,
 * with the conflictEdgeCount>0 requirement removed. Does NOT call
 * countConflictEdges as a gate at all (still computable separately by
 * callers that want to report it, e.g. for STEP4's classification). */
function runG1(cubies: Cubie[], lib: WingLibrary, deadline: number): GateRelaxationResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null };
  if (analysis.cycleLength < MIN_CYCLE_LENGTH || analysis.cycleLength > MAX_CYCLE_LENGTH) return { matched: false, moves: null };
  const moves = runRelaxedSearch(cubies, analysis.cycleNodes, lib, deadline);
  return { matched: true, moves };
}

/** G0: REPAIR's real, unmodified production Gate -- calls runSuccessV2
 * directly (W2_WIDER_HOP), not reimplemented. */
function runG0(cubies: Cubie[], lib: WingLibrary, deadline: number): GateRelaxationResult {
  return runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP);
}

export function runGateRelaxationVariant(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: GateRelaxationVariant): GateRelaxationResult {
  return variant === "G0_existing" ? runG0(cubies, lib, deadline) : runG1(cubies, lib, deadline);
}

// Re-exported for STEP4's classification (ground-truth conflictEdgeCount,
// unmodified, imported once here for convenience).
export { countConflictEdges };
