// --- GoalDescriptor (GOSP prototype) -----------------------------------------
// Goal Candidate / Cluster Goal / Goal Replay Benchmark types (spec sections
// 10, 12, 13, 14).
import type { Move } from "../fiveByFiveEdges";
import type { GoalPrimitiveName } from "./GoalState";

export type GoalConditionFlag = "baseSuccessUp" | "wrongWingDown" | "pairStabilityUp" | "primitiveDiversityUp";

/**
 * One node in a Replay's State Graph that satisfies at least one of spec
 * section 10's 4 conditions, relative to that Replay's own ROOT (the raw
 * Failure State) as baseline.
 */
export interface GoalCandidate {
  replayHash: string;
  clusterKey: string;
  goalHash: string;
  /** Goal signature = same `w{wrongWing}|p{0|1}` vocabulary this whole
   * project already uses for FailureCluster keys -- a Goal State's "kind"
   * is most naturally identified by the WrongWing/Parity it reaches (spec
   * section 6's own worked example identifies the Goal purely as "WrongWing
   * 10"), so reusing this key lets Goal commonality (section 13) and
   * FailureCluster commonality be compared on the same terms. */
  goalSignature: string;
  primitiveSequence: GoalPrimitiveName[]; // root -> this node, in order
  moveSequence: Move[]; // concatenated real moves, root -> this node
  reachCost: number; // = primitiveSequence.length (depth from root)

  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  parityBefore: boolean;
  parityAfter: boolean;
  primitiveDiversityBefore: number; // distinct primitives that succeed AT root
  primitiveDiversityAfter: number; // distinct primitives that succeed AT this node
  baseSuccessBefore: boolean;
  baseSuccessAfter: boolean;

  satisfiedConditions: GoalConditionFlag[];
  goalScore: number | null;
}

/** A Goal signature repeated across multiple replays -- promoted per spec
 * section 13 ("공통 Goal이 존재하면 Cluster Goal로 승격한다"). */
export interface ClusterGoalSignature {
  clusterKey: string;
  goalSignature: string;
  occurrences: number; // distinct replays (within this clusterKey) that reached this signature at least once
  replayHashes: string[];
  representativeCandidate: GoalCandidate;
}

/** Result of spec section 14's Goal Replay verification: re-apply a
 * candidate's move sequence to a FRESH clone of the ORIGINAL Replay state,
 * then re-run the REAL, unmodified Solver from there. */
export interface GoalReplayBenchmarkResult {
  goalHash: string;
  replayHash: string;
  clusterKey: string;
  goalReached: boolean; // sanity check: applying moveSequence actually reaches goalHash
  solverSolvedWithoutGoal: boolean; // baseline: real solve() run directly on the raw Failure State
  wrongWingWithoutGoal: number;
  solverSolvedAfterGoal: boolean; // real solve() run AFTER detouring through the Goal State
  wrongWingAfterGoal: number;
  improved: boolean; // wrongWingAfterGoal < wrongWingWithoutGoal
}

/**
 * The browser-safe, PORTABLE form of a Goal Candidate used at runtime
 * (Solver Integration Sprint v1). Only `primitiveSequence` -- WHICH
 * Primitives to try, in WHICH order -- generalizes across different real
 * cube states; the ORIGINAL candidate's literal `moveSequence` was tailored
 * to the exact scramble it was discovered on and is never replayed at
 * runtime (see GoalAnalyzer.ts's runPrimitiveChain). `originalMoveCount` is
 * kept only as a disclosed, approximate tie-breaker for spec section 5's
 * "Move 수" priority -- the ACTUAL move count at runtime will differ per
 * real application, since the same Primitive can take a different number of
 * moves depending on the live state it's applied to.
 */
export interface PortableGoal {
  id: string; // `${replayHash}::${goalHash}` of the source GoalCandidate
  primitiveSequence: GoalPrimitiveName[];
  wrongWingDecrease: number; // wrongWingBefore - wrongWingAfter, from the candidate's OWN discovery (must be > 0 to pass the gate)
  pairIncrease: number; // pairAfter - pairBefore, from the candidate's OWN discovery
  originalMoveCount: number; // moveSequence.length from the candidate's OWN discovery (approximate proxy, disclosed above)
  replaySuccessRate: number; // computed via the offline 75-Replay reliability benchmark
  replayRegressionRate: number;
  replayInvalidRate: number;
}
