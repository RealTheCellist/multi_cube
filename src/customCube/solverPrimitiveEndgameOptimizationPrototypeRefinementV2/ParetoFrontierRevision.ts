// --- ParetoFrontierRevision (ENDGAME Optimization Prototype Refinement
// Sprint v2, STEP3) ----------------------------------------------------------
// Recomputes the 3-axis Pareto Frontier (Capability/Runtime/Regression)
// across ALL 16 distinct budget points measured across BOTH Refinement
// Sprints: v1's own cited 400/375/350/325/300/275ms (V1CitedData.ts) plus
// this Sprint's own fresh 450/250/225/200/175/150/125/100/75/50ms. Same
// dominance logic as v1's own ParetoFrontier.ts (reused conceptually, not
// imported, since this module combines two different data sources).
export interface BudgetPoint {
  budgetMs: number;
  avgImprovedCount: number; // Capability -- higher is better
  avgWallMs: number; // Runtime -- lower is better
  avgTrueRegressionRate: number; // Regression -- lower is better
}

export interface ParetoResult {
  point: BudgetPoint;
  dominated: boolean;
  dominatedBy: number[];
}

function dominates(a: BudgetPoint, b: BudgetPoint): boolean {
  const atLeastAsGood = a.avgImprovedCount >= b.avgImprovedCount && a.avgWallMs <= b.avgWallMs && a.avgTrueRegressionRate <= b.avgTrueRegressionRate;
  const strictlyBetter = a.avgImprovedCount > b.avgImprovedCount || a.avgWallMs < b.avgWallMs || a.avgTrueRegressionRate < b.avgTrueRegressionRate;
  return atLeastAsGood && strictlyBetter;
}

export function computeParetoFrontier(points: readonly BudgetPoint[]): ParetoResult[] {
  return points
    .map((p) => {
      const dominatedBy = points.filter((other) => other.budgetMs !== p.budgetMs && dominates(other, p)).map((other) => other.budgetMs);
      return { point: p, dominated: dominatedBy.length > 0, dominatedBy };
    })
    .sort((a, b) => b.point.budgetMs - a.point.budgetMs);
}

export function paretoEfficientSet(results: readonly ParetoResult[]): BudgetPoint[] {
  return results.filter((r) => !r.dominated).map((r) => r.point);
}
