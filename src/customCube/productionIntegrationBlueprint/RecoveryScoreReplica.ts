// --- RecoveryScoreReplica (Production Integration Blueprint Sprint v1)
// -----------------------------------------------------------------------
// Replicates fiveByFiveEdgeRecovery.ts's own internal `add()` scoring
// formula EXACTLY (read directly from source, not guessed):
//   futurePotential = scoreWholeState(after) - scoreWholeState(before)
//   score = futurePotential - moves.length * MOVE_COST_WEIGHT   (MOVE_COST_WEIGHT = 2)
// `scoreWholeState`/`DEFAULT_EVALUATOR_WEIGHTS` are reused UNMODIFIED,
// EXPORTED functions from fiveByFiveEdgeEvaluator.ts (not one of this
// Sprint's read-only-restricted files). `MOVE_COST_WEIGHT` itself is a
// private, non-exported constant inside fiveByFiveEdgeRecovery.ts -- its
// value (2) was read directly from source and is reproduced here
// verbatim, disclosed as such, so Mixed Commutator's own candidates can
// be scored on IDENTICAL footing to every existing Recovery candidate
// (DISRUPT/SETUP/REPAIR/CCR) for a genuine, comparable
// chooseBestRecovery()-style selection simulation.
import type { Cubie } from "../cubeState";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS, type EvaluatorWeights } from "../fiveByFiveEdgeEvaluator";
import type { Move } from "../fiveByFiveEdges";

const MOVE_COST_WEIGHT = 2; // read verbatim from fiveByFiveEdgeRecovery.ts's own private constant

export function scoreLikeRecoveryLayer(before: Cubie[], after: Cubie[], moves: readonly Move[], weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS): number {
  const baseScore = scoreWholeState(before, weights);
  const afterScore = scoreWholeState(after, weights);
  const futurePotential = afterScore - baseScore;
  return futurePotential - moves.length * MOVE_COST_WEIGHT;
}
