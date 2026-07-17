// --- GoalEvaluator (GOSP prototype) ------------------------------------------
// Goal Score formula (spec section 11 -- "계산식은 자유롭게 정의하되
// 문서화한다."), documented here exactly like the earlier
// CAPABILITY_SCORE_WEIGHTS/computeCapabilityScore precedent
// (primitiveDiscovery/PrimitiveEvaluator.ts).
import type { GoalCandidate } from "./GoalDescriptor";

// Goal Score = BASE Success + Primitive Availability + Pair Stability - WrongWing
// (spec's own literal formula shape), weighted so that:
//  - BASE re-activating (the whole point of this Sprint, per section 6's
//    worked example) dominates the score.
//  - Primitive Availability (how many of the 4 existing Primitives newly work
//    from this Goal State) is a meaningful secondary signal.
//  - Pair Stability only rewards a NET gain (pairAfter - pairBefore), never
//    penalizes -- Goal States that merely hold Pair count steady are still
//    useful, they just don't get a bonus for it.
//  - WrongWing is a straightforward penalty on the Goal State's own absolute
//    residual size (smaller remaining WrongWing is strictly better, all else
//    equal), capped in practice by BASE Success + Availability dominating.
export const GOAL_SCORE_WEIGHTS = {
  baseSuccess: 30,
  primitiveAvailability: 10,
  pairStability: 5,
  wrongWingPenalty: 3,
};

export function computeGoalScore(candidate: GoalCandidate): number {
  const w = GOAL_SCORE_WEIGHTS;
  const baseSuccessTerm = candidate.baseSuccessAfter ? 1 : 0;
  const availabilityTerm = candidate.primitiveDiversityAfter;
  const pairStabilityTerm = Math.max(0, candidate.pairAfter - candidate.pairBefore);
  const wrongWingTerm = candidate.wrongWingAfter;

  return (
    w.baseSuccess * baseSuccessTerm +
    w.primitiveAvailability * availabilityTerm +
    w.pairStability * pairStabilityTerm -
    w.wrongWingPenalty * wrongWingTerm
  );
}

export function scoreAll(candidates: readonly GoalCandidate[]): GoalCandidate[] {
  return candidates.map((c) => ({ ...c, goalScore: computeGoalScore(c) }));
}
