// ============================================================================
// Capability Analysis Engine v1 -- shared types.
//
// Answers a different question than the prior two research engines: not
// "what failed" (Failure Analysis Engine) or "which failures share a
// shape" (Primitive Discovery Engine), but "what STRUCTURAL capability is
// missing from the current Solver". Layered on top of both: reuses
// ../failureAnalysis for collected data + Replay, and
// ../primitiveDiscovery's clustering (DiscoveryCluster) rather than
// re-clustering from scratch.
//
// Node-only -- never import from the browser bundle.
// ============================================================================

import type { DiscoveryCluster } from "../primitiveDiscovery/discoveryTypes";

export type WingNodeType = "SolvedPair" | "WingPair" | "BrokenPair";

export interface WingNode {
  slot: string;
  type: WingNodeType;
}

export type ConstraintEdgeType = "SWAP" | "CYCLE" | "CONFLICT";

export interface ConstraintEdge {
  from: string;
  to: string;
  type: ConstraintEdgeType;
}

/**
 * `cycles` is additive beyond the spec's literal 2-field {nodes, edges}
 * interface: ConstraintAnalyzer needs the actual distinct cycles (not just
 * a flat edge list, from which cycle COUNT can't be recovered losslessly),
 * so StateGraphBuilder hands them over directly instead of making every
 * downstream consumer re-detect cycles from edges.
 */
export interface StateGraph {
  nodes: WingNode[];
  edges: ConstraintEdge[];
  cycles: string[][];
}

export interface ConstraintStats {
  cycleCount: number;
  mutualLockCount: number;
  componentCount: number;
  conflictCount: number;
  degree: Record<string, number>;
  dependencyCount: number;
  longestCycleLength: number;
}

/**
 * BASE/FLIP/CASE/PARITY/RECOVERY per spec's own naming (section 3) --
 * distinct from the Failure Analysis Engine's PrimitiveName (which used
 * ENDGAME instead of CASE/PARITY split). Mapping used here: CASE =
 * tryExactCaseMatch (direct case-library lookup), PARITY = the broader
 * ENDGAME grinder (bestFixOverall + tryEndgameMultiPly, i.e. general
 * progress-toward-resolution search) -- these are 2 genuinely distinct
 * existing code paths, not a renamed duplicate.
 */
export type CapabilityPrimitiveName = "BASE" | "FLIP" | "CASE" | "PARITY" | "RECOVERY";

/**
 * Result of ACTUALLY re-running a primitive against a scratch clone of a
 * real captured cube state ("가상 적용" / virtual application per spec) --
 * every field here is a measured before/after, never inferred from a trace
 * log the way the Primitive Discovery Engine had to.
 */
export interface PrimitiveTestResult {
  primitive: CapabilityPrimitiveName;
  applicable: boolean;
  succeeded: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  conflictBefore: number;
  conflictAfter: number;
  cycleBefore: number;
  cycleAfter: number;
}

export type CapabilityLevel = "O" | "△" | "X";

export type CapabilityRowName = "PairCreation" | "PairPreservation" | "CycleRemoval" | "ConflictReduction" | "MultiSwap";

export const CAPABILITY_ROW_LABELS: Record<CapabilityRowName, string> = {
  PairCreation: "Pair 생성",
  PairPreservation: "Pair 유지",
  CycleRemoval: "Cycle 제거",
  ConflictReduction: "Conflict 감소",
  MultiSwap: "Multi Swap",
};

export interface CapabilityMatrix {
  clusterId: number;
  rows: Record<CapabilityRowName, Record<CapabilityPrimitiveName, CapabilityLevel>>;
  testResults: PrimitiveTestResult[];
  hasMultiSwapCycle: boolean;
}

export interface CapabilityGap {
  clusterId: number;
  missingCapabilities: CapabilityRowName[];
  confidence: number; // 0-100, see CapabilityGapAnalyzer
}

export interface CapabilitySimilarityPair {
  clusterA: number;
  clusterB: number;
  similarity: number; // 0-100
}

export interface PrimitiveCandidate {
  name: string;
  affectedClusterIds: number[];
  affectedFailureCount: number;
  totalFailureCount: number;
  impactPercent: number;
  expectedWrongWingReduction: number;
  priorityStars: number; // 1-5
}

export interface ClusterCapabilitySummary {
  cluster: DiscoveryCluster;
  matrix: CapabilityMatrix;
  gap: CapabilityGap;
  representativeHash: string;
}
