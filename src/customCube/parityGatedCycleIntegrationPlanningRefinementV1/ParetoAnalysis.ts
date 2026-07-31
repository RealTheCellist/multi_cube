// --- ParetoAnalysis (Parity-Gated Cycle Integration Planning Refinement
// Sprint v1, STEP4) ----------------------------------------------------------
// Capability (improvedCount, maximize) vs Runtime (avgRuntimeMsAmongMatched,
// minimize) over BudgetSweep.ts's own 7 tested points. A budget is
// Pareto-efficient iff no OTHER tested budget has both >= improvedCount AND
// <= runtime, with at least one strict inequality -- the standard 2-axis
// Pareto-frontier definition this arc's own EndgameRefinementV2/
// ParetoFrontierRevision.ts already established (same definition,
// reapplied to this Sprint's own metric pair, not re-derived).
import type { BudgetResult } from "./BudgetSweep";

export interface ParetoPoint {
  budgetMs: number;
  improvedCount: number;
  avgRuntimeMsAmongMatched: number;
  paretoEfficient: boolean;
}

export function computeParetoFrontier(results: readonly BudgetResult[]): ParetoPoint[] {
  const points = results.map((r) => ({ budgetMs: r.budgetMs, improvedCount: r.summary.improvedCount, avgRuntimeMsAmongMatched: r.summary.avgRuntimeMsAmongMatched }));
  return points.map((p) => {
    const dominated = points.some(
      (o) =>
        o.budgetMs !== p.budgetMs &&
        o.improvedCount >= p.improvedCount &&
        o.avgRuntimeMsAmongMatched <= p.avgRuntimeMsAmongMatched &&
        (o.improvedCount > p.improvedCount || o.avgRuntimeMsAmongMatched < p.avgRuntimeMsAmongMatched)
    );
    return { ...p, paretoEfficient: !dominated };
  });
}

export function selectTopParetoCandidates(frontier: readonly ParetoPoint[], maxCount: number): ParetoPoint[] {
  return frontier
    .filter((p) => p.paretoEfficient)
    .sort((a, b) => b.improvedCount - a.improvedCount || a.avgRuntimeMsAmongMatched - b.avgRuntimeMsAmongMatched)
    .slice(0, maxCount);
}
