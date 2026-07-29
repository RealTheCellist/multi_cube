// --- RuntimeSummary (Mixed Commutator Production Validation Sprint v2,
// RQ-4) -----------------------------------------------------------------
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { ValidationSolveResult } from "../mixedCommutatorProductionValidation/EndToEndValidationProbe";
import type { CaseMeasurement } from "./CaseMeasurement";

export interface SolveRuntimeSummary {
  n: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  timeoutRate: number;
}

export function summarizeSolveRuntime(results: readonly ValidationSolveResult[]): SolveRuntimeSummary {
  const n = results.length;
  const sorted = [...results.map((r) => r.wallMs)].sort((a, b) => a - b);
  const p95Idx = Math.min(n - 1, Math.floor(n * 0.95));
  return {
    n,
    meanMs: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
    p95Ms: n ? sorted[p95Idx] : 0,
    maxMs: n ? sorted[n - 1] : 0,
    timeoutRate: n ? results.filter((r) => r.deadlineMissed).length / n : 0,
  };
}

/** MIXED_COMMUTATOR's own isolated generation cost -- already isolated at
 * measurement time (CaseMeasurement.ts calls runMixedCommutatorPrototype
 * directly, not the whole generateRecoveryStrategies() call). */
export function summarizeMixedGenCost(cases: readonly CaseMeasurement[]): SampleStats {
  return computeStats(cases.map((c) => c.mixedWallMs));
}
