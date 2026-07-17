// ============================================================================
// Primitive Discovery Engine -- shared types.
//
// Layered on TOP of the existing Failure Analysis Engine (../failureAnalysis)
// rather than re-implementing collection: that engine's FailureCollector/
// FailureDatabase already satisfy this spec's own FailureCollector
// requirement verbatim ("Plan 종료 / Recovery 실패 / WrongWing>0", "동일한
// 상태는 중복 저장하지 않는다") -- reusing it avoids duplicating already-
// built, already-verified code, and keeps this directory's job purely to
// the NEW analysis this spec actually asks for: canonicalization,
// clustering, gap analysis, mining, and suggestion.
//
// Node-only (imports failureAnalysis's `fs`-backed database) -- never
// import this from the browser bundle.
// ============================================================================

import type { PrimitiveName } from "../failureAnalysis/failureTypes";

export type EdgePatternName = "unpaired" | "flipped-pair" | "half-paired";

/**
 * A rotation/edge-ordering/wing-ordering-INVARIANT description of one
 * failure's residual shape. Never references which of the 12 physical
 * slots is stuck (that's what rotation/edge-ordering would change) or
 * which of a slot's 2 wings is "first" (wing-ordering) -- only how MANY
 * slots of each pattern type remain, and how many cross-slot color-swap
 * relationships exist among them. Two snapshots produce the identical
 * signature hash if and only if their residuals have the same abstract
 * shape, regardless of which specific slots/faces/wing-order a given
 * scramble happened to produce.
 */
export interface CanonicalSignature {
  hash: string;
  wrongWingCount: number;
  parity: boolean;
  patternHistogram: Record<EdgePatternName, number>;
  swapPairCount: number;
}

/** All FailureSnapshots (by hash) that reduce to the exact same
 * CanonicalSignature. */
export interface CanonicalEntry {
  signature: CanonicalSignature;
  snapshotHashes: string[];
}

/**
 * A broader grouping of CanonicalEntries by (wrongWingCount, parity) alone
 * -- coarser than exact canonical identity, matching spec's own report flow
 * ("실패 상태 482 -> Canonical 91 -> Cluster 8"): many distinct canonical
 * SHAPES (different histogram/swapPairCount combinations) can still belong
 * to the same broad severity bucket worth reporting on together.
 */
export interface DiscoveryCluster {
  id: number;
  key: string;
  wrongWingCount: number;
  parity: boolean;
  canonicalCount: number;
  size: number;
  snapshotHashes: string[];
  representativeSignature: CanonicalSignature;
}

export type PrimitiveGapStatus = "OK" | "FAIL" | "UNTESTED";

export interface PrimitiveGapEntry {
  primitive: PrimitiveName;
  status: PrimitiveGapStatus;
}

export interface GapAnalysis {
  clusterId: number;
  entries: PrimitiveGapEntry[];
  isUnknown: boolean;
}

export interface MinedCase {
  clusterId: number;
  representativeHash: string;
  commonFeatures: string;
}

export interface PrimitiveSuggestion {
  clusterId: number;
  suggestion: string;
}
