// --- OpportunitySaturationCurve (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP4) -----------------------------------------------
// Aggregates EndgameCapabilityCeiling.ts's (STEP2) per-snapshot,
// per-budget probes across the full Reachable population into a
// budget-vs-capability saturation curve -- does MORE time for ENDGAME
// actually keep paying off, or does it plateau?
import type { CeilingProbeRecord } from "./EndgameCapabilityCeiling";
import { CEILING_BUDGETS_MS } from "./EndgameCapabilityCeiling";

export interface SaturationPoint {
  budgetMs: number;
  n: number;
  avgImprovement: number;
  solvedRate: number;
  avgRuntimeMs: number;
}

export function computeSaturationCurve(records: readonly CeilingProbeRecord[]): SaturationPoint[] {
  return CEILING_BUDGETS_MS.map((budgetMs) => {
    const atBudget = records.filter((r) => r.budgetMs === budgetMs);
    const n = atBudget.length;
    return {
      budgetMs,
      n,
      avgImprovement: n ? atBudget.reduce((a, r) => a + r.improvement, 0) / n : 0,
      solvedRate: n ? atBudget.filter((r) => r.solved).length / n : 0,
      avgRuntimeMs: n ? atBudget.reduce((a, r) => a + r.runtimeMs, 0) / n : 0,
    };
  });
}

export interface EndgameHeadroom {
  smallestBudgetImprovement: number;
  largestBudgetImprovement: number;
  headroomPerCase: number; // largest - smallest -- how much MORE improvement unlimited time buys vs the tightest real budget
}

export function computeEndgameHeadroom(curve: readonly SaturationPoint[]): EndgameHeadroom {
  const smallest = curve[0];
  const largest = curve[curve.length - 1];
  return {
    smallestBudgetImprovement: smallest.avgImprovement,
    largestBudgetImprovement: largest.avgImprovement,
    headroomPerCase: largest.avgImprovement - smallest.avgImprovement,
  };
}
