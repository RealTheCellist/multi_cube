// ============================================================================
// Failure Analysis Engine v1 -- shared types.
//
// This whole directory is RESEARCH INFRASTRUCTURE, not solver code: it never
// imports anything from fiveByFiveEdges.ts/fiveByFiveEdgePlanner.ts/
// fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts in a way that changes
// their behavior -- only their existing PUBLIC exports, read-only, exactly
// as any other caller (e.g. customSolvePlayback.ts) already does. Its job is
// to observe solver failures and turn them into data a human can use to
// design the NEXT primitive, not to fix anything itself.
//
// Node-only: uses `fs` for persistence (see failureDatabase.ts), so this
// directory must never be imported from the browser bundle (App.tsx,
// customSolvePlayback.ts, etc.) -- it's driven by standalone tsx scripts.
// ============================================================================

import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";

/**
 * One failed solve() attempt's terminal state -- captured only when the
 * plan's own tasks have all been tried (including ENDGAME and any Recovery
 * attempt) and wrongWingCount is still > 0 (spec section "FailureCollector").
 *
 * `cubeState`/`wrongWingCount`/`pairedEdges`/`parity`/`remainingEdges`/
 * `timestamp` are exactly the spec's literal interface. `trace` and
 * `primitiveAttempts` are an explicit, disclosed ADDITION beyond that literal
 * interface -- section "Trace 연동" and PrimitiveCoverage both require
 * knowing WHICH primitives were tried and failed, which isn't recoverable
 * from the 6 base fields alone, so this file stores the engine's own Trace
 * log (already produced by the unmodified SolverEngine) alongside the
 * snapshot rather than re-deriving it later from thin air.
 */
export interface FailureSnapshot {
  cubeState: string;
  wrongWingCount: number;
  pairedEdges: number;
  parity: boolean;
  remainingEdges: number[];
  timestamp: number;

  // --- additions (disclosed above) ---
  hash: string;
  trace: TraceEntry[];
  primitiveAttempts: PrimitiveAttempt[];
  recoveryAttempted: boolean;
  recoverySucceeded: boolean;
}

export type PrimitiveName = "BASE" | "FLIP" | "PARITY" | "ENDGAME" | "RECOVERY";

export interface PrimitiveAttempt {
  primitive: PrimitiveName;
  succeeded: boolean;
  detail?: string;
}

export interface FailureCluster {
  id: number;
  key: string;
  size: number;
  hashes: string[];
  commonWrongWingCount: number | null;
  commonParity: boolean | null;
  description: string;
}

export interface PrimitiveCoverageReport {
  totalFailures: number;
  byPrimitive: Record<PrimitiveName, number>;
  byPrimitivePercent: Record<PrimitiveName, number>;
  unknownCount: number;
  unknownPercent: number;
}

export interface HeatMapReport {
  bySlot: Record<string, number>;
  maxCount: number;
}

export interface FailureStatisticsReport {
  totalFailures: number;
  wrongWingDistribution: Record<number, number>;
  parityRate: number;
  recoveryFailureRate: number;
  primitiveUsageFrequency: Record<PrimitiveName, number>;
  averageTraceLength: number;
  averageRecoveryAttempts: number;
}

export interface ClusterRecommendation {
  clusterId: number;
  size: number;
  commonFeatures: string;
  recommendation: string;
}
