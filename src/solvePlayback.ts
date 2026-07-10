import type { Alg } from "cubing/alg";
import type { ExperimentalMillisecondTimestamp, TwistyPlayer } from "cubing/twisty";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { animateTimestampTo } from "./swipeControls";

const MOVE_ANIMATION_MS = 350;
const HOLD_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SolveHint {
  move: string | null;
  movesRemaining: number;
  // cubing.js's solver can't handle a pattern once an M/E/S middle-slice
  // move has ever been applied (its internal Reid-notation conversion
  // requires centers to stay in their original slots, which those moves
  // break) — set when that happens so the caller can show a clear message
  // instead of the promise hanging or throwing.
  unsupported?: boolean;
}

/**
 * Solves for the puzzle's *current* pattern and previews just its first
 * move: plays it forward, holds briefly so the resulting position is
 * visible, then plays it back in reverse and restores the original alg —
 * a pure preview that leaves the puzzle's actual state untouched, so the
 * user can go perform the move themselves.
 */
export async function computeAndPlayNextSolveMove(player: TwistyPlayer): Promise<SolveHint> {
  const currentPattern = await player.experimentalModel.currentPattern.get();
  let solutionAlg;
  try {
    solutionAlg = await experimentalSolve3x3x3IgnoringCenters(currentPattern);
  } catch {
    return { move: null, movesRemaining: 0, unsupported: true };
  }
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  if (moves.length === 0) return { move: null, movesRemaining: 0 };

  const [move] = moves;

  const originalAlg: Alg = await player.experimentalGet.alg();
  player.timestamp = "end";
  const tStart = await player.experimentalGet.timestamp();
  player.experimentalAddMove(move);
  player.pause();
  player.timestamp = "end";
  const tEnd = await player.experimentalGet.timestamp();
  player.timestamp = tStart;

  await animateTimestampTo(player, tStart, tEnd, () => true, MOVE_ANIMATION_MS);
  player.timestamp = tEnd as ExperimentalMillisecondTimestamp;
  await sleep(HOLD_MS);
  await animateTimestampTo(player, tEnd, tStart, () => true, MOVE_ANIMATION_MS);

  player.timestamp = tStart as ExperimentalMillisecondTimestamp;
  player.alg = originalAlg;

  return { move, movesRemaining: moves.length - 1 };
}
