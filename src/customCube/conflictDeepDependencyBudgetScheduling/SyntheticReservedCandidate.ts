// --- SyntheticReservedCandidate (CONFLICT_DEEP_DEPENDENCY Budget &
// Scheduling Validation Sprint v1) -------------------------------------------
// Builds a RecoveryStrategy for a DISRUPT or SETUP move sequence produced
// under a RESERVED-SLICE budget (computed off the OUTER deadline, exactly
// like REPAIR_RESERVED_SLICE_MS/MIXED_COMMUTATOR_RESERVED_SLICE_MS's own
// established pattern), scored on IDENTICAL footing to every real Recovery
// candidate via scoreLikeRecoveryLayer (Production Integration Blueprint
// Sprint v1's own exact replica of fiveByFiveEdgeRecovery.ts's private
// add() formula, reused unmodified). This lets a shadow reserved-slice
// candidate compete fairly in the REAL, unmodified chooseBestRecovery()
// alongside real DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR candidates from
// a real generateRecoveryStrategies() call -- without ever modifying
// fiveByFiveEdgeRecovery.ts's own shared-slice scheduling (forbidden this
// Sprint). Mirrors gateRefinement/SyntheticMixedCandidate.ts's own exact
// pattern, generalized to DISRUPT/SETUP.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import { scoreLikeRecoveryLayer } from "../productionIntegrationBlueprint/RecoveryScoreReplica";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export function buildSyntheticReservedCandidate(before: Cubie[], moves: Move[], type: Extract<RecoveryType, "DISRUPT" | "SETUP">, reservationMs: number): RecoveryStrategy {
  const after = cloneCubies(before);
  applySeq(after, moves);
  const beforeWrong = wrongWingCount5(before);
  const afterWrong = wrongWingCount5(after);
  const baseScore = scoreWholeState(before, DEFAULT_EVALUATOR_WEIGHTS);
  const afterScore = scoreWholeState(after, DEFAULT_EVALUATOR_WEIGHTS);
  return {
    id: -1, // synthetic, never persisted -- real generateRecoveryStrategies() never sees this
    type,
    description: `${type} (Budget & Scheduling Sprint reserved-slice shadow candidate, ${reservationMs}ms)`,
    moves,
    expectedWrongWingDelta: afterWrong - beforeWrong,
    expectedFuturePotential: afterScore - baseScore,
    score: scoreLikeRecoveryLayer(before, after, moves, DEFAULT_EVALUATOR_WEIGHTS),
  };
}
