// --- ParetoFrontier (Incremental Recovery Architecture Prototype
// Refinement Sprint v1, STEP4) ----------------------------------------------
// X axis: Capability Loss (unconstrained ceiling success rate minus this
// budget's success rate). Y axis: Budget Compliance (1 - overrunRate).
// A point is Pareto-optimal if no OTHER swept budget has BOTH lower
// Capability Loss AND equal-or-higher Budget Compliance (i.e. dominates it).
import type { BudgetSweepSummary } from "./BudgetSweep";

export interface ParetoPoint {
  budgetMs: number;
  capabilityLoss: number; // fraction, 0 = no loss vs ceiling
  budgetCompliance: number; // fraction, 1 = perfect compliance
  successRate: number;
  avgRuntimeMs: number;
  isParetoOptimal: boolean;
}

export function computeParetoFrontier(
  sweepSummaries: readonly BudgetSweepSummary[],
  successRateByBudget: ReadonlyMap<number, number>,
  ceilingSuccessRate: number
): ParetoPoint[] {
  const points: ParetoPoint[] = sweepSummaries.map((s) => {
    const successRate = successRateByBudget.get(s.budgetMs) ?? 0;
    return {
      budgetMs: s.budgetMs,
      capabilityLoss: ceilingSuccessRate - successRate,
      budgetCompliance: 1 - s.overrunRate,
      successRate,
      avgRuntimeMs: s.avgRuntimeMs,
      isParetoOptimal: false, // filled in below
    };
  });

  for (const p of points) {
    const dominatedBy = points.some(
      (other) =>
        other.budgetMs !== p.budgetMs &&
        other.capabilityLoss <= p.capabilityLoss &&
        other.budgetCompliance >= p.budgetCompliance &&
        (other.capabilityLoss < p.capabilityLoss || other.budgetCompliance > p.budgetCompliance)
    );
    p.isParetoOptimal = !dominatedBy;
  }
  return points;
}

export interface ParetoAnalysis {
  points: ParetoPoint[];
  optimalBudgets: number[];
  complianceIsBudgetInvariant: boolean; // disclosed finding: if true, the mechanism keeps compliance near-constant at every tested budget, so Compliance does not discriminate between candidates -- the real tradeoff is Runtime cost vs Capability recovered
  complianceRange: { min: number; max: number };
}

export function analyzeParetoFrontier(points: readonly ParetoPoint[]): ParetoAnalysis {
  const optimalBudgets = points.filter((p) => p.isParetoOptimal).map((p) => p.budgetMs).sort((a, b) => a - b);
  const complianceValues = points.map((p) => p.budgetCompliance);
  const min = Math.min(...complianceValues);
  const max = Math.max(...complianceValues);
  // "budget-invariant" disclosed threshold: compliance range under 5 percentage
  // points across the whole sweep is treated as effectively constant, since
  // the mechanism's job is exactly to keep compliance near its own target
  // regardless of what that target is set to.
  const complianceIsBudgetInvariant = max - min < 0.05;
  return { points: [...points], optimalBudgets, complianceIsBudgetInvariant, complianceRange: { min, max } };
}
