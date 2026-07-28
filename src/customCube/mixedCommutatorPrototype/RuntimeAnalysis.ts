// --- RuntimeAnalysis (Mixed Commutator Prototype Sprint v1, Required
// Analysis #2, Deliverable #2, RQ-3) -----------------------------------------
import type { CaseResult } from "./CapabilityEvaluation";

export interface RuntimeSummary {
  budgetMs: number;
  n: number;
  avgRuntimeMs: number;
  maxRuntimeMs: number;
  p95RuntimeMs: number;
  timeoutCount: number; // cases where the search never exhausted the full space before the deadline
  timeoutRate: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarizeRuntime(budgetMs: number, cases: CaseResult[]): RuntimeSummary {
  const runtimes = cases.map((c) => c.runtimeMs).sort((a, b) => a - b);
  const timeoutCount = cases.filter((c) => !c.result.exhaustedSearchSpace).length;
  return {
    budgetMs,
    n: cases.length,
    avgRuntimeMs: runtimes.length ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : 0,
    maxRuntimeMs: runtimes.length ? runtimes[runtimes.length - 1] : 0,
    p95RuntimeMs: percentile(runtimes, 95),
    timeoutCount,
    timeoutRate: cases.length ? timeoutCount / cases.length : 0,
  };
}
