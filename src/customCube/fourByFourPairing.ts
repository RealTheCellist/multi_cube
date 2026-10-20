import { applyRawQuarterTurn, cloneCubies, type Cubie } from "./cubeState";
import { solveEdgePairing, unpairedWingCount, type SolveEdgePairingResult } from "./fourByFourEdges";
import { solveWingsByCycles4 } from "./fourByFourWingsCycle";

/**
 * Pairs the 4x4x4's wings: the short pure-3-cycle solve first, the older library-based solve if that finds nothing
 * (or somehow leaves a wing unpaired). Applies the chosen moves to `cubies`, like solveEdgePairing does.
 */
export async function pairWings4(cubies: Cubie[], timeBudgetMs = 150000): Promise<SolveEdgePairingResult> {
  try {
    const moves = solveWingsByCycles4(cubies);
    if (moves) {
      const trial = cloneCubies(cubies);
      for (const [axis, layer, sign] of moves) applyRawQuarterTurn(trial, axis, layer, sign);
      if (unpairedWingCount(trial) === 0) {
        for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
        return { solved: true, movesApplied: moves.length, moves: [...moves] };
      }
    }
  } catch (err) {
    console.error("4x4 wing cycle solver failed (non-fatal, using the older pairing):", err);
  }
  return solveEdgePairing(cubies, timeBudgetMs);
}
