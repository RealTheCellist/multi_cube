// Shared "plan-once/consume-many" cursor logic, factored out of
// FourByFourSolverEngine (customSolvePlayback.ts) and
// FiveByFiveEdgeSolverEngine (fiveByFiveEdgeSolverEngine.ts) -- both solve a
// plan once, cache its move queue, and step through it one press at a time
// rather than recomputing from scratch every press (see either engine's own
// header comment for why: multi-move algorithm combos only pair/place
// pieces once applied in full, so committing just one move per press only
// works if the SAME plan is continued across presses). Both engines needed
// the identical 3-way check to stay correct if the live cube diverges from
// what the cached plan expects (a scramble, reset, undo, or an off-plan
// move) -- this is that check, pulled out once instead of kept as two
// separately-maintained copies.
//
// Deliberately pure and stateless: it decides what the cursor SHOULD be and
// what move (if any) to hand out, but never owns the plan or decides what an
// exhausted-with-nothing-left-to-offer plan means -- the two engines differ
// there (5x5 invalidates immediately on exhaustion; 4x4 leaves the plan
// valid so its caller can read the plan's own solved verdict first). That
// policy call stays with each engine's own wrapper.
import type { Axis } from "./cubeMath";
import { applyRawQuarterTurn, type Cubie, cloneCubies } from "./cubeState";

export type Move = readonly [Axis, number, 1 | -1];

function applyMoveSeq(cubies: Cubie[], moves: readonly Move[]): void {
  for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
}

/** True if `liveCubies` looks exactly like `startCubies` with `moves` applied on top. */
export function isCubiesStateAt(
  startCubies: Cubie[],
  moves: readonly Move[],
  liveCubies: readonly Cubie[],
  stateHash: (cubies: readonly Cubie[]) => number,
): boolean {
  const expected = cloneCubies(startCubies);
  applyMoveSeq(expected, moves);
  return stateHash(liveCubies) === stateHash(expected);
}

export type PlanCursorDecision =
  // The live cube matches the plan replayed through `currentMove` -- this is
  // where the cursor should sit; `move` is the next one to offer, or null if
  // the queue is exhausted at that point.
  | { readonly kind: "ok"; readonly currentMove: number; readonly move: Move | null }
  // The live cube matches neither "replayed through currentMove" nor
  // "...through currentMove+1" -- an off-plan move, scramble, reset, or undo
  // happened. The plan can no longer be trusted at all.
  | { readonly kind: "stale" };

/**
 * The 3-way check both engines run on every press (mirrors each engine's own
 * prior syncAndPeekNextMove docstring):
 * 1. Live cube matches "plan replayed through move N+1" (the engine's own
 *    previous press committed the previously-offered move) -> the cursor
 *    should advance to N+1; offer the move after that.
 * 2. Live cube matches "plan replayed through move N" (nothing changed since
 *    the last call) -> cursor stays at N; re-offer move N.
 * 3. Neither -> "stale": an off-plan move, scramble, reset, or undo. The
 *    caller must discard the plan.
 */
export function decideNextPlanMove(
  planStartCubies: Cubie[],
  moveQueue: readonly Move[],
  currentMove: number,
  liveCubies: readonly Cubie[],
  stateHash: (cubies: readonly Cubie[]) => number,
): PlanCursorDecision {
  const liveHash = stateHash(liveCubies);

  const atCurrent = cloneCubies(planStartCubies);
  applyMoveSeq(atCurrent, moveQueue.slice(0, currentMove));
  if (stateHash(atCurrent) === liveHash) {
    return { kind: "ok", currentMove, move: currentMove < moveQueue.length ? moveQueue[currentMove] : null };
  }

  if (currentMove < moveQueue.length) {
    const atNext = cloneCubies(atCurrent);
    applyMoveSeq(atNext, [moveQueue[currentMove]]);
    if (stateHash(atNext) === liveHash) {
      const next = currentMove + 1;
      return { kind: "ok", currentMove: next, move: next < moveQueue.length ? moveQueue[next] : null };
    }
  }

  return { kind: "stale" };
}
