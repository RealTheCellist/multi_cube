// --- ParetoFrontier (ENDGAME Optimization Prototype Refinement Sprint v1,
// STEP4) --------------------------------------------------------------------
// 3-axis Pareto over the 8 real, measured budget points: Capability
// (avgImprovedCount, maximize), Runtime (avgWallMs, minimize), Regression
// (avgTrueRegressionRate vs the 450ms Baseline, minimize). A budget is
// dominated if some OTHER budget is at least as good on all three axes and
// strictly better on at least one -- dominated budgets are never a
// rational operating choice regardless of how the three axes are weighted.
export interface BudgetPoint {
  budgetMs: number;
  avgImprovedCount: number; // Capability -- higher is better
  avgWallMs: number; // Runtime -- lower is better
  avgTrueRegressionRate: number; // Regression -- lower is better
}

export interface ParetoResult {
  point: BudgetPoint;
  dominated: boolean;
  dominatedBy: number[]; // budgetMs values of every point that dominates this one
}

function dominates(a: BudgetPoint, b: BudgetPoint): boolean {
  const atLeastAsGood = a.avgImprovedCount >= b.avgImprovedCount && a.avgWallMs <= b.avgWallMs && a.avgTrueRegressionRate <= b.avgTrueRegressionRate;
  const strictlyBetter = a.avgImprovedCount > b.avgImprovedCount || a.avgWallMs < b.avgWallMs || a.avgTrueRegressionRate < b.avgTrueRegressionRate;
  return atLeastAsGood && strictlyBetter;
}

export function computeParetoFrontier(points: readonly BudgetPoint[]): ParetoResult[] {
  return points.map((p) => {
    const dominatedBy = points.filter((other) => other.budgetMs !== p.budgetMs && dominates(other, p)).map((other) => other.budgetMs);
    return { point: p, dominated: dominatedBy.length > 0, dominatedBy };
  });
}

export function paretoEfficientSet(results: readonly ParetoResult[]): BudgetPoint[] {
  return results.filter((r) => !r.dominated).map((r) => r.point);
}
