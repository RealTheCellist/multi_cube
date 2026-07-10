import type { TwistyPlayer } from "cubing/twisty";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import { animateTimestampTo } from "./swipeControls";

const MOVE_ANIMATION_MS = 350;
const PAUSE_BETWEEN_MOVES_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SolveProgress {
  movesDone: number;
  movesTotal: number;
}

/**
 * Finds a solution for the puzzle's current pattern and plays it back one
 * move at a time (not an instant snap to solved), so the user can follow
 * along with what each move does. `isCancelled` is polled between moves so a
 * scramble/reset mid-playback can stop it early.
 */
export async function playSolve(
  player: TwistyPlayer,
  onProgress: (progress: SolveProgress) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const currentPattern = await player.experimentalModel.currentPattern.get();
  const solutionAlg = await experimentalSolve3x3x3IgnoringCenters(currentPattern);
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());

  onProgress({ movesDone: 0, movesTotal: moves.length });

  for (let i = 0; i < moves.length; i++) {
    if (isCancelled()) return;

    player.timestamp = "end";
    const tStart = await player.experimentalGet.timestamp();
    player.experimentalAddMove(moves[i]);
    player.pause();
    player.timestamp = "end";
    const tEnd = await player.experimentalGet.timestamp();
    player.timestamp = tStart;

    await animateTimestampTo(player, tStart, tEnd, () => !isCancelled(), MOVE_ANIMATION_MS);
    if (isCancelled()) return;
    player.timestamp = "end";

    onProgress({ movesDone: i + 1, movesTotal: moves.length });
    if (i < moves.length - 1) await sleep(PAUSE_BETWEEN_MOVES_MS);
  }
}
