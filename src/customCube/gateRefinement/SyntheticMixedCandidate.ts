// --- SyntheticMixedCandidate (Gate Refinement Sprint v1) --------------------
// Builds a RecoveryStrategy object for a Mixed Commutator move sequence,
// scored on IDENTICAL footing to every real Recovery candidate via
// scoreLikeRecoveryLayer (Production Integration Blueprint Sprint v1's own
// exact replica of fiveByFiveEdgeRecovery.ts's private add() formula,
// reused unmodified here). This lets a shadow-computed Mixed candidate
// compete fairly in the REAL, unmodified chooseBestRecovery() alongside
// real DISRUPT/SETUP/REPAIR/CCR candidates -- without ever calling
// generateRecoveryStrategies() with a relaxed Gate (which would require
// modifying fiveByFiveEdgeRecovery.ts, forbidden this Sprint).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import { scoreLikeRecoveryLayer } from "../productionIntegrationBlueprint/RecoveryScoreReplica";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy } from "../fiveByFiveEdgeSolverTypes";

export function buildSyntheticMixedCandidate(before: Cubie[], moves: Move[]): RecoveryStrategy {
  const after = cloneCubies(before);
  applySeq(after, moves);
  const beforeWrong = wrongWingCount5(before);
  const afterWrong = wrongWingCount5(after);
  const baseScore = scoreWholeState(before, DEFAULT_EVALUATOR_WEIGHTS);
  const afterScore = scoreWholeState(after, DEFAULT_EVALUATOR_WEIGHTS);
  return {
    id: -1, // synthetic, never persisted -- real generateRecoveryStrategies() never sees this
    type: "MIXED_COMMUTATOR",
    description: "Mixed Pattern Bracket Commutator (Gate Refinement shadow candidate)",
    moves,
    expectedWrongWingDelta: afterWrong - beforeWrong,
    expectedFuturePotential: afterScore - baseScore,
    score: scoreLikeRecoveryLayer(before, after, moves, DEFAULT_EVALUATOR_WEIGHTS),
  };
}
