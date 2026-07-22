// --- StatisticalValidation (Incremental Recovery Architecture Prototype
// Refinement Sprint v1, STEP5) -----------------------------------------------
// Paired-diff CI + Cohen's d_z per swept budget vs the 40ms baseline, reusing
// the project's Standard Evaluation Protocol (computeStats/analyzeEffectSize)
// read-only, over the full n=3801 real-case population -- same
// deterministic-population disclosure as Architecture Prototype Sprint v1's
// own StandardEvaluation.ts (bfsMoveWingToPosition is deterministic, so the
// paired-diff population is the set of real cases, not repeated trials).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { BudgetSweepRecord } from "./BudgetSweep";

export interface BudgetValidationResult {
  budgetMs: number;
  n: number;
  successDiffStats: SampleStats; // per-case: foundPath(budget) - foundPath(40ms), paired
  effectSize: EffectSizeResult;
  significantImprovement: boolean; // CI lower bound > 0, i.e. genuinely better than 40ms, not noise
}

export function validateBudgetVs40ms(
  sweepByBudget: ReadonlyMap<number, readonly BudgetSweepRecord[]>
): BudgetValidationResult[] {
  const at40 = sweepByBudget.get(40);
  if (!at40) throw new Error("validateBudgetVs40ms: 40ms budget missing from sweep -- it is the required baseline");
  const at40ByKey = new Map(at40.map((r) => [`${r.hash}:${r.pieceId}`, r]));

  const budgets = [...sweepByBudget.keys()].sort((a, b) => a - b).filter((b) => b !== 40);
  return budgets.map((budgetMs) => {
    const records = sweepByBudget.get(budgetMs)!;
    const diffs = records.map((r) => {
      const base = at40ByKey.get(`${r.hash}:${r.pieceId}`);
      const baseFound = base?.foundPath ? 1 : 0;
      const thisFound = r.foundPath ? 1 : 0;
      return thisFound - baseFound;
    });
    const successDiffStats = computeStats(diffs);
    const effectSize = analyzeEffectSize({ meanDiff: successDiffStats.mean, stddevDiff: successDiffStats.stddev, n: diffs.length });
    return {
      budgetMs,
      n: diffs.length,
      successDiffStats,
      effectSize,
      significantImprovement: successDiffStats.ciLower > 0,
    };
  });
}
