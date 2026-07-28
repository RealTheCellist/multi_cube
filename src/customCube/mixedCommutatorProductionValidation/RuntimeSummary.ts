// --- RuntimeSummary (Mixed Commutator Production Validation Sprint v1,
// RQ-4) -----------------------------------------------------------------
import type { ValidationSolveResult } from "./EndToEndValidationProbe";

export interface RuntimeSummary {
  n: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  timeoutRate: number; // deadlineMissed rate
}

export function summarizeRuntime(results: readonly ValidationSolveResult[]): RuntimeSummary {
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
