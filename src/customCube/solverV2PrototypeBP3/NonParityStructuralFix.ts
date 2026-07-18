// --- NonParityStructuralFix (Solver v2 Primitive Prototype Sprint v3) -----
// STEP 3: the Non-Parity Structural Fix Primitive itself. Reuses
// enumerateWingCandidates() (fiveByFiveEdges.ts, existing/exported/
// unmodified -- the same real-move-sequence search tryFixWing() uses
// internally) and DeferredValidator.ts's validateDeferred() (Prototype
// Sprint v1, existing/exported/unmodified) exactly as BoundedResolver.ts
// (BP-1) already established: a bounded, deterministic DFS that judges an
// entire walked path only at the end, never per-hop.
//
// How this differs from BP-1 (not a re-run of the same experiment):
//   - BP-1 walks ONLY the single longest WANTS-cycle (length >= 4,
//     MultiCycleAnalyzer.ts's own scope) and returns null on anything
//     shorter or non-cyclic.
//   - BP-3 walks EVERY slot touched by ANY structural WANTS edge --
//     SWAP (2-cycle), CYCLE (3+), and CONFLICT (never closes into a
//     cycle) -- via StructuralMoveSelector.ts's fixed deterministic
//     order, specifically to reach the states BP-1/CycleChase never
//     even attempt.
//   - BP-3 never touches PARITY_ALG (walk candidates come only from
//     enumerateWingCandidates()'s WingLibrary, the same BASE/FLIP/CASE
//     source tryFixWing() itself draws from) and explicitly REJECTS any
//     candidate move that would flip hasParity() away from the ORIGINAL
//     starting state's parity, at every hop -- not just checked once at
//     the end. This operationalizes the spec's "parity를 변화시키지
//     않는다" requirement as a hard per-step filter, not a hope.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { selectStructuralWalkOrder } from "./StructuralMoveSelector";

// Same disclosed bounds as BoundedResolver.ts (BP-1), for the same reason:
// stays orders of magnitude inside Solver Contract Analysis Sprint v1's own
// measured cost ceiling (depth-2 exhaustive ~1.46s at real branching factor
// 5.44). Reused verbatim rather than re-derived.
export const MAX_CANDIDATES_PER_HOP = 2;
export const MAX_LEAVES_EXPLORED = 64;
// Same "unreserved budget starves a later step" fix BoundedResolver.ts
// already needed (and Adaptive Executor v2's Recovery hit before that) --
// a per-hop sub-budget so one slow enumerateWingCandidates() call can never
// consume the entire remaining deadline before any other hop is tried.
const PER_HOP_DEADLINE_MS = 60;

export interface NonParityFixResult {
  moves: Move[] | null;
  leavesExplored: number;
  slotsWalked: number;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export function tryNonParityStructuralFix(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  const result = resolveNonParityStructuralFix(cubies, lib, deadline);
  return result.moves;
}

export function resolveNonParityStructuralFix(cubies: Cubie[], lib: WingLibrary, deadline: number): NonParityFixResult {
  const plan = selectStructuralWalkOrder(cubies);
  if (plan.slots.length === 0) return { moves: null, leavesExplored: 0, slotsWalked: 0 };

  const originalParity = hasParity(cubies);
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
    if (hopIndex >= plan.slots.length) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const slot = plan.slots[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1); // already resolved earlier in this same path
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const rawCandidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP * 2);

    // Per-hop parity-preservation filter -- reject any candidate that would
    // flip parity away from the ORIGINAL starting state, before it's ever
    // branched into. This is the "parity를 변화시키지 않는다" requirement
    // enforced as a hard gate, not a post-hoc check.
    const survivors: Move[][] = [];
    for (const candidate of rawCandidates) {
      if (survivors.length >= MAX_CANDIDATES_PER_HOP) break;
      const probe = cloneCubies(working);
      applySeq(probe, candidate);
      if (hasParity(probe) === originalParity) survivors.push(candidate);
    }

    if (survivors.length === 0) {
      considerLeaf(movesSoFar, working); // dead end (no candidate, or all would flip parity) -- still a valid partial leaf
      return;
    }

    let anyBranchTried = false;
    for (const candidate of survivors) {
      if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) break;
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working); // overall deadline hit before any survivor could be tried
  }

  dfs(cloneCubies(cubies), [], 0);

  if (!best) return { moves: null, leavesExplored, slotsWalked: plan.slots.length };
  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return { moves: validation.accepted ? (best as Leaf).moves : null, leavesExplored, slotsWalked: plan.slots.length };
}
