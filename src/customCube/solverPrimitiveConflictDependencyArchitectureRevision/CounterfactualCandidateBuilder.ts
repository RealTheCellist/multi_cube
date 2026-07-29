// --- CounterfactualCandidateBuilder (CONFLICT_DEEP_DEPENDENCY Architecture
// Revision Sprint v1, STEP4) --------------------------------------------------
// generateRecoveryStrategies() has no toggle to omit SETUP entirely (only
// includeRepair/includeCCR/includeMixedCommutator exist), and adding one
// would be a production edit -- forbidden this Sprint ("Production Solver
// Algorithm 수정 금지", "계측만 수행한다"). This module instead replicates the
// EXACT same "reservedBudget" generation order (DISRUPT, DISRUPT, [SETUP
// skipped], REPAIR, CCR, MIXED_COMMUTATOR) by calling the SAME already-
// exported search primitives generateRecoveryStrategies() itself calls
// internally (tryEndgameThroughDisruption/runSuccessV2/runCCRPrototype/
// tryMixedCommutatorPrototype/buildStateGraph/analyzeConstraints), scored via
// scoreLikeRecoveryLayer (Production Integration Blueprint Sprint v1's own
// disclosed replica of the private add()/MOVE_COST_WEIGHT formula, reused
// unmodified). Every budget rule (REPAIR_RESERVED_SLICE_MS=75,
// MIXED_COMMUTATOR_RESERVED_SLICE_MS=300 -- both private constants in
// fiveByFiveEdgeRecovery.ts, read verbatim from source and disclosed here
// exactly like ProductionContractConstants.ts's own SETUP_RESERVED_SLICE_MS_
// FOR_REPORT precedent) and the shared genDeadline/4 slice() formula for
// DISRUPT are reproduced identically -- this file only OMITS the genSetup()
// call, nothing else differs from what generateRecoveryStrategies() would
// have done. The one disclosed approximation: CCR's own remainingTime budget
// here naturally reflects only DISRUPT+REPAIR's elapsed time (since SETUP
// never runs) -- a genuine, intentional difference from a run WITH SETUP,
// not a bug, since that is exactly the counterfactual this Sprint asks for
// ("SETUP 제거" -- what would CCR's actual available time have been without
// it consuming any).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, tryEndgameThroughDisruption, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { RECOVERY_GEN_BUDGET_MS } from "../fiveByFiveEdgeRecovery";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS, type EvaluatorWeights } from "../fiveByFiveEdgeEvaluator";
import { scoreLikeRecoveryLayer } from "../productionIntegrationBlueprint/RecoveryScoreReplica";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { tryMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

const REPAIR_RESERVED_SLICE_MS = 75; // read verbatim from fiveByFiveEdgeRecovery.ts's own private constant
const MIXED_COMMUTATOR_RESERVED_SLICE_MS = 300; // read verbatim from fiveByFiveEdgeRecovery.ts's own private constant

export type CounterfactualExclusion = "NONE" | "SETUP" | "CCR" | "MIXED_COMMUTATOR" | "RESERVED";

let nextId = -1000;

function buildCandidate(before: Cubie[], type: RecoveryType, description: string, moves: ReturnType<typeof tryEndgameThroughDisruption>, weights: EvaluatorWeights): RecoveryStrategy | null {
  if (!moves || moves.length === 0) return null;
  const after = cloneCubies(before);
  applySeq(after, moves);
  const beforeWrong = wrongWingCount5(before);
  const afterWrong = wrongWingCount5(after);
  return {
    id: nextId--,
    type,
    description,
    moves,
    expectedWrongWingDelta: afterWrong - beforeWrong,
    expectedFuturePotential: scoreWholeState(after, weights) - scoreWholeState(before, weights),
    score: scoreLikeRecoveryLayer(before, after, moves, weights),
  };
}

/** Rebuilds the "reservedBudget" candidate set with SETUP's own generation
 * step entirely omitted (the ONLY counterfactual this module needs external
 * reconstruction for -- CCR/MIXED_COMMUTATOR/RESERVED-removal counterfactuals
 * are all just the real generateRecoveryStrategies() called with its own
 * EXISTING toggles, see CounterfactualReplay.ts). */
export function buildCandidatesWithoutSetup(cubies: Cubie[], libs: ExecutorLibraries, deadline: number, weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS): RecoveryStrategy[] {
  const { lib, flipLib, caseLib } = libs;
  const genDeadline = Math.min(deadline, Date.now() + RECOVERY_GEN_BUDGET_MS);
  const slice = () => Math.max(5, Math.floor((genDeadline - Date.now()) / 4));
  const candidates: RecoveryStrategy[] = [];

  if (Date.now() < genDeadline) {
    const d = Math.min(genDeadline, Date.now() + slice());
    const c = buildCandidate(cubies, "DISRUPT", "가벼운 Disruption (교란 1개 이하, 재귀 없음)", tryEndgameThroughDisruption(cubies, lib, flipLib, d, 1, 0, caseLib), weights);
    if (c) candidates.push(c);
  }
  if (Date.now() < genDeadline) {
    const d = Math.min(genDeadline, Date.now() + slice());
    const c = buildCandidate(cubies, "DISRUPT", "확장 Disruption (교란 3개, 재귀 1단계)", tryEndgameThroughDisruption(cubies, lib, flipLib, d, 3, 1, caseLib), weights);
    if (c) candidates.push(c);
  }
  // SETUP intentionally omitted -- this is the counterfactual.
  {
    const d = Math.min(deadline, Date.now() + REPAIR_RESERVED_SLICE_MS);
    const w2Result = runSuccessV2(cubies, lib, d, W2_WIDER_HOP);
    const c = buildCandidate(cubies, "REPAIR", "구조적 Cycle 해결 (W2_widerHop, reservedBudget scheduling)", w2Result.matched ? w2Result.moves : null, weights);
    if (c) candidates.push(c);
  }
  {
    const result = runCCRPrototype(cubies, lib, deadline, "singleCycle");
    const c = buildCandidate(cubies, "CCR", `Clean-Cycle Resolution (remainingTime=${Math.max(0, deadline - Date.now())}ms 남음, SETUP 제거)`, result.matched ? result.moves : null, weights);
    if (c) candidates.push(c);
  }
  {
    const stats = analyzeConstraints(buildStateGraph(cubies));
    if (stats.cycleCount === 1 && stats.componentCount === 1) {
      const d = Math.min(deadline, Date.now() + MIXED_COMMUTATOR_RESERVED_SLICE_MS);
      const moves = tryMixedCommutatorPrototype(cubies, lib, d);
      const c = buildCandidate(cubies, "MIXED_COMMUTATOR", "Mixed Pattern Bracket Commutator (cycleCount=1 AND componentCount=1 Gate, reserved-slice scheduling)", moves, weights);
      if (c) candidates.push(c);
    }
  }

  return candidates;
}
