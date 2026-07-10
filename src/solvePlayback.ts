import type { TwistyPlayer } from "cubing/twisty";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { animateTimestampTo } from "./swipeControls";

const MOVE_ANIMATION_MS = 350;

export interface SolveHint {
  move: string | null;
  movesRemaining: number;
}

/**
 * Solves for the puzzle's *current* pattern from scratch and plays just its
 * first move — a step-through hint rather than an auto-played full solve, so
 * pressing the button again re-solves from wherever the cube actually is
 * (including any manual turns made in between) and reveals the next move.
 */
export async function computeAndPlayNextSolveMove(player: TwistyPlayer): Promise<SolveHint> {
  const currentPattern = await player.experimentalModel.currentPattern.get();
  const solutionAlg = await experimentalSolve3x3x3IgnoringCenters(currentPattern);
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  if (moves.length === 0) return { move: null, movesRemaining: 0 };

  const [move] = moves;

  player.timestamp = "end";
  const tStart = await player.experimentalGet.timestamp();
  player.experimentalAddMove(move);
  player.pause();
  player.timestamp = "end";
  const tEnd = await player.experimentalGet.timestamp();
  player.timestamp = tStart;

  await animateTimestampTo(player, tStart, tEnd, () => true, MOVE_ANIMATION_MS);
  player.timestamp = "end";

  return { move, movesRemaining: moves.length - 1 };
}
