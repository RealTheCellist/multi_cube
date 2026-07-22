// --- RegressionCurve (Incremental Recovery Architecture Prototype
// Refinement Sprint v1, STEP3) ----------------------------------------------
// Per-budget True/False/Abort Regression, all computed against the SAME
// unconstrained (no-deadline) baseline used throughout this Sprint --
// exact, not estimated, for the same deterministic-traversal reason
// established in Architecture Prototype Sprint v1's own
// CapabilityRegressionAnalysis.ts:
//   True Regression  = baseline found a path, this budget's call didn't
//                       (can only happen if the deadline fired -- see
//                       BudgetSweep.ts's own abort-detection proof)
//   False Regression = baseline ALSO found nothing (no capability lost)
//   Abort Regression = ALL cases where the deadline fired, whether or not
//                       it cost a real success -- a strict superset of
//                       True Regression, reported separately per the work
//                       order's own STEP3 list, to show not every abort is
//                       a real capability loss
//   Duplicate impact = not-applicable-at-this-layer (Visited Registry
//                       untouched this Sprint, same disclosure as
//                       Architecture Prototype Sprint v1)
import type { BudgetSweepRecord } from "./BudgetSweep";

export interface RegressionCurvePoint {
  budgetMs: number;
  n: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  falseRegressionCount: number;
  abortRegressionCount: number; // == BudgetSweep's own abortRate * n, repeated here for the STEP3 regression-breakdown context
  abortRegressionRate: number;
  duplicateImpact: "not-applicable-at-this-layer";
}

export function analyzeRegressionCurve(
  sweepByBudget: ReadonlyMap<number, readonly BudgetSweepRecord[]>,
  baselineNoDeadline: readonly BudgetSweepRecord[]
): RegressionCurvePoint[] {
  const baselineByKey = new Map(baselineNoDeadline.map((r) => [`${r.hash}:${r.pieceId}`, r]));
  const budgets = [...sweepByBudget.keys()].sort((a, b) => a - b);

  return budgets.map((budgetMs) => {
    const records = sweepByBudget.get(budgetMs)!;
    const n = records.length;
    let trueRegressionCount = 0;
    let falseRegressionCount = 0;
    let abortRegressionCount = 0;
    for (const r of records) {
      if (r.aborted) abortRegressionCount++;
      const baseline = baselineByKey.get(`${r.hash}:${r.pieceId}`);
      const baselineFound = baseline?.foundPath ?? false;
      if (!r.foundPath) {
        if (baselineFound) trueRegressionCount++;
        else falseRegressionCount++;
      }
    }
    return {
      budgetMs,
      n,
      trueRegressionCount,
      trueRegressionRate: n ? trueRegressionCount / n : 0,
      falseRegressionCount,
      abortRegressionCount,
      abortRegressionRate: n ? abortRegressionCount / n : 0,
      duplicateImpact: "not-applicable-at-this-layer",
    };
  });
}
