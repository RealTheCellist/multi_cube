// --- PolicyTypes (Policy Generalization Sprint v1) --------------------------
// Shared types for turning Replay-specific Goal Candidates into a
// Replay-independent decision Policy: "at state signature X, which
// Primitive should be tried first (and, if a majority still agrees,
// second/third)?" -- spec section 2's core hypothesis, as opposed to
// reusing a Goal Candidate's own literal primitiveSequence (already shown
// to NOT generalize in Solver Integration Sprint v1).
import type { GoalPrimitiveName } from "../goalPlanner/GoalState";

export type { GoalPrimitiveName };

/**
 * One Goal Candidate with all Replay-identifying information stripped
 * except `sourceReplayHash` (kept ONLY for majority-vote bookkeeping in
 * PolicyNormalizer -- e.g. so 6 candidates from the SAME replay's own
 * branching depth don't get counted as 6 independent votes -- never used
 * as part of the extracted Policy itself).
 */
export interface NormalizedGoalRecord {
  sourceReplayHash: string;
  stateSignature: string; // `w{wrongWingBefore}|p{0|1}`, same key vocabulary as FailureCluster
  primitiveSequence: GoalPrimitiveName[];
  wrongWingDecrease: number;
  pairIncrease: number;
}

/**
 * A generalized decision rule for one state signature: "try
 * primitiveSequence[0] first; if a strict majority of the replays that
 * demonstrated success at position N also agree on position N+1, extend
 * the policy that far." See PolicyNormalizer.ts for the exact algorithm.
 */
export interface Policy {
  stateSignature: string;
  primitiveSequence: GoalPrimitiveName[];
  supportCount: number; // distinct source replays behind the FIRST step
  agreementCounts: number[]; // per position, how many distinct replays agreed (out of however many still had a step to offer)
  votingReplayCounts: number[]; // per position, how many distinct replays were even still voting (the denominator behind agreementCounts)
}

export interface PolicyApplicationResult {
  stateSignature: string;
  primitiveSequence: GoalPrimitiveName[];
  applied: boolean; // every step in primitiveSequence found a fix, in order (spec's "적용 가능")
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
}

export interface PolicyBenchmarkResult {
  stateSignature: string;
  primitiveSequence: GoalPrimitiveName[];
  totalTested: number; // always 75 (all real Failure Replays, spec section 7)
  appliedCount: number; // primitive chain completed, regardless of outcome
  appliedRate: number; // spec Level 1 metric
  successCount: number; // among APPLIED: wrongWing decreased
  regressionCount: number; // among APPLIED: wrongWing increased or pair decreased
  noEffectCount: number; // among APPLIED: neither
  successRateAmongApplied: number; // spec Level 2 metric
  regressionRateAmongApplied: number; // spec Level 3 metric
  avgWrongWingDelta: number; // among APPLIED
  avgPairDelta: number; // among APPLIED
}
