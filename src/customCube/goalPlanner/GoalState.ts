// --- GoalState (Architecture Evolution Sprint v1 -- GOSP prototype) ---------
// Shared State Graph types. A "Goal State" is NOT a solved cube (spec section
// 6) -- it's whatever intermediate state makes an EXISTING Primitive start
// working again on a residual it was previously stuck on. Nodes are keyed by
// the same Cube Hash the rest of this codebase already uses
// (computeEdgeSolverStateHash, see fiveByFiveEdgeStateHash.ts), edges are one
// real Primitive execution (spec section 9: "노드: Cube Hash, Edge: Primitive
// 실행").
//
// Scope decision (disclosed): the "기존 Primitive" set explored here is BASE
// (tryFixWing) / FLIP (tryFlipWingsInPlace) / CASE (tryExactCaseMatch) /
// PARITY (bestFixOverall + tryEndgameMultiPly) -- exactly the 4 functions
// fiveByFiveEdgeExecutor.ts's own runPrimaryPipeline calls per real task
// execution. RECOVERY is deliberately excluded: it is not itself an atomic
// Primitive but a meta-layer that generates disruptive setups and then
// retries these same 4 (see fiveByFiveEdgeRecovery.ts), and Adaptive
// Executor v2 already rigorously measured it finding 0/20 usable candidates
// on captured stuck residuals even at 30x its normal budget -- re-including
// it here would mostly multiply search cost without adding a genuinely new
// primitive to branch on.
import type { Move } from "../fiveByFiveEdges";

export type GoalPrimitiveName = "BASE" | "FLIP" | "CASE" | "PARITY";
export const ALL_GOAL_PRIMITIVES: readonly GoalPrimitiveName[] = ["BASE", "FLIP", "CASE", "PARITY"];

export interface GoalStateNode {
  hash: string;
  depth: number;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  parentHash: string | null;
  viaPrimitive: GoalPrimitiveName | null; // null only for the root (the raw Failure State)
  moveCountFromParent: number;
  // Whether the search actually tried expanding this node's own 4
  // primitives (false for nodes only reached right at the node/depth
  // budget cutoff) -- `successfulPrimitivesFromHere` is only meaningful
  // when this is true; an unexplored node must not be read as "0
  // primitives work here", since it simply was never tested.
  explored: boolean;
  successfulPrimitivesFromHere: GoalPrimitiveName[];
}

export interface GoalStateEdge {
  from: string;
  to: string;
  primitive: GoalPrimitiveName;
  moves: Move[]; // the real move sequence this Primitive execution applied
}

/** One representative Failure Replay's fully-explored State Graph (spec
 * section 9). `nodes`/`edges` are plain, JSON-serializable records -- the
 * live Cubie[] per node is kept only in GoalAnalyzer's own search-time
 * memory, never persisted (matches this whole engine series' convention of
 * storing Transition/Cube Hashes, not raw cube states, in any report/DB). */
export interface StateGraph {
  replayHash: string;
  clusterKey: string;
  rootHash: string;
  nodes: GoalStateNode[];
  edges: GoalStateEdge[];
}

export interface GoalSearchOptions {
  maxDepth: number;
  maxNodesPerReplay: number;
  primitiveDeadlineMs: number;
}

export const DEFAULT_GOAL_SEARCH_OPTIONS: GoalSearchOptions = {
  maxDepth: 4,
  maxNodesPerReplay: 60,
  primitiveDeadlineMs: 120,
};

export type Path = readonly Move[];
