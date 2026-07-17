// ============================================================================
// Capability Expansion Sprint v2 -- shared types.
//
// A PrimitiveCandidate is a REAL move sequence (Quarter/Half/Wide/Inner-layer
// turns only -- see PrimitiveSearch.ts's fragment generator) discovered by
// brute-force search against actual captured Failure Replay states. Nothing
// here is an abstract operation: every sequence is applied via the existing,
// unmodified applySeq()/Cubie rotation machinery, exactly like any other
// real move sequence in this project.
// ============================================================================
import type { Move } from "../fiveByFiveEdges";

export type ReplayOutcome = "success" | "no-effect" | "regression";

export interface ReplayBenchmarkTally {
  success: number;
  noEffect: number;
  regression: number;
  totalTested: number;
  avgWrongWingDelta: number;
  avgPairDelta: number;
}

export interface PrimitiveCandidate {
  id: string;
  sequence: Move[];
  moveLength: number;
  // Measured on the ONE seed Replay state this candidate was first found
  // against (see PrimitiveSearch.ts) -- the full 50+-Replay validation
  // pass fills in `benchmark` separately.
  wrongWingDelta: number;
  pairDelta: number;
  parityDelta: number; // -1 = parity resolved, 0 = unchanged, 1 = parity introduced
  affectedSlots: string[];
  changedLayers: string[];
  beforeHash: string;
  afterHash: string;
  transitionHash: string;
  frequency: number; // how many times this exact Transition Hash was independently rediscovered during search
  benchmark: ReplayBenchmarkTally | null;
  capabilityScore: number | null;
  discoveredFromClusterKey: string;
}
