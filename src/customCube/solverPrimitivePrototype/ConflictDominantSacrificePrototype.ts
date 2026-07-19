// --- ConflictDominantSacrificePrototype (Solver Primitive Prototype
// Sprint v2) --------------------------------------------------------------
// Priority 2 Primitive from Primitive Blueprint Refinement Sprint v1
// (26.8% precondition-match Coverage on the Gap, complementary to
// Multi-Hop Bridge). Targets replays where a CONFLICT edge (WANTS-graph
// edge NOT part of any cycle -- a one-sided dependency: "A를 고치면 B가
// 대가 없이 손해봄", per capabilityAnalysis/stateGraphBuilder.ts's own
// documented edge semantics) dominates over Swap/Cycle edges, which is
// exactly why BASE (tryFixWing) can never find a net-improving single move
// there.
//
// This is a genuinely NEW composition (no existing Primitive does this):
// 1. Find a CONFLICT edge A->B (A's wrong wing wants slot B).
// 2. SACRIFICE: relocate B's own wrong wing elsewhere (enumerateWingCandidates,
//    existing/unmodified) so B is no longer occupied by a wrong wing.
// 3. INSERT: move A's wrong wing into the now-open B (tryFixWing, existing/
//    unmodified).
// 4. RESTORE (best-effort): try tryFixWing again on whatever's left wrong,
//    including the sacrificed piece, exactly once.
// Only returns a move sequence if the FULL sequence net-improves
// wrongWingCount (Deferred Validation, same discipline BoundedResolver.ts
// already established) -- otherwise tries the next CONFLICT edge.
//
// Contract: the input `cubies` is never mutated -- the caller must
// applySeq() the returned moves themselves (same convention Multi-Hop
// Bridge/BP-1 already use).
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, tryFixWing, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

// Bounded, disclosed constants -- kept small since each candidate/edge
// tried costs at least one tryFixWing() call (already the most expensive
// primitive per-call in this whole project).
const SACRIFICE_CANDIDATES = 3;
const MAX_CONFLICT_EDGES_TRIED = 5;

export type SacrificeStage = "no_occupant" | "sacrifice_failed" | "insert_failed" | "no_net_improvement" | "succeeded";

export interface SacrificeAttemptDetail {
  edgeFrom: string;
  edgeTo: string;
  stage: SacrificeStage;
}

export interface SacrificeResult {
  moves: Move[] | null;
  conflictEdgesAvailable: number;
  attempts: SacrificeAttemptDetail[];
}

export function tryConflictDominantSacrifice(cubies: Cubie[], lib: WingLibrary, deadline: number): SacrificeResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  const graph = buildStateGraph(cubies);
  const conflictEdges = graph.edges.filter((e) => e.type === "CONFLICT").slice(0, MAX_CONFLICT_EDGES_TRIED);
  const attempts: SacrificeAttemptDetail[] = [];

  for (const edge of conflictEdges) {
    if (Date.now() > deadline) break;
    const clone = cloneCubies(cubies);
    const moves: Move[] = [];

    const occupantAtB = wrongWings5(clone).find((w) => slotKey(w) === edge.to);
    if (!occupantAtB) {
      attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "no_occupant" });
      continue;
    }

    const sacrificeCandidates = enumerateWingCandidates(clone, occupantAtB, lib, deadline, SACRIFICE_CANDIDATES);
    let sacrificed = false;
    for (const candidate of sacrificeCandidates) {
      const testClone = cloneCubies(clone);
      applySeq(testClone, candidate);
      // Reject a "sacrifice" that just parks the occupant right back at the
      // slot we're trying to free FOR -- that would immediately undo the
      // very conflict this Primitive exists to resolve.
      const stillBlocking = wrongWings5(testClone).some((w) => w.id === occupantAtB.id && slotKey(w) === edge.from);
      if (stillBlocking) continue;
      applySeq(clone, candidate);
      moves.push(...candidate);
      sacrificed = true;
      break;
    }
    if (!sacrificed) {
      attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "sacrifice_failed" });
      continue;
    }

    const wrongAtA = wrongWings5(clone).find((w) => slotKey(w) === edge.from);
    if (!wrongAtA) {
      attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "insert_failed" });
      continue;
    }
    const insertFix = tryFixWing(clone, wrongAtA, lib, deadline);
    if (!insertFix || insertFix.length === 0) {
      attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "insert_failed" });
      continue;
    }
    applySeq(clone, insertFix);
    moves.push(...insertFix);

    // Best-effort restore pass -- reuses BASE exactly once per remaining
    // wrong wing, no recursion budget beyond this single sweep.
    for (const w of wrongWings5(clone)) {
      const restoreFix = tryFixWing(clone, w, lib, deadline);
      if (restoreFix && restoreFix.length > 0) {
        applySeq(clone, restoreFix);
        moves.push(...restoreFix);
      }
    }

    if (wrongWingCount5(clone) < wrongWingBefore) {
      attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "succeeded" });
      return { moves, conflictEdgesAvailable: conflictEdges.length, attempts };
    }
    attempts.push({ edgeFrom: edge.from, edgeTo: edge.to, stage: "no_net_improvement" });
  }

  return { moves: null, conflictEdgesAvailable: conflictEdges.length, attempts };
}
