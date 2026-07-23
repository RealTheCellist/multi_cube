// --- SensitivityAnalysis (ENDGAME Optimization Prototype Refinement Sprint
// v1, STEP5) ----------------------------------------------------------------
// Among the Pareto-efficient budgets, checks whether NEIGHBORING budgets'
// own 95% CI (on the Primary/Capability paired-diff-vs-Baseline metric)
// overlap. If two budgets' CIs overlap, the data cannot statistically
// distinguish between them -- per the Work Order's own instruction, prefer
// the SIMPLER value in that case (operationalized here, disclosed: a
// multiple of 50 is "simpler" than a multiple of 25 that isn't also a
// multiple of 50, since the swept set mixes both granularities).
import type { BudgetEvaluation } from "./StatisticalValidation";

export interface SensitivityPair {
  budgetA: number;
  budgetB: number;
  ciOverlap: boolean;
  recommendedSimplerBudget: number | null; // set only when ciOverlap is true
}

function isSimplerBudget(a: number, b: number): number {
  const aRound = a % 50 === 0;
  const bRound = b % 50 === 0;
  if (aRound && !bRound) return a;
  if (bRound && !aRound) return b;
  return Math.max(a, b); // tie: prefer the larger (more conservative, closer to today's real 450ms) value
}

function intervalsOverlap(l1: number, u1: number, l2: number, u2: number): boolean {
  return l1 <= u2 && l2 <= u1;
}

/** `paretoEfficientBudgets` should be sorted by Capability (or budget value) for a meaningful "neighboring" comparison. */
export function analyzeSensitivity(evaluations: readonly BudgetEvaluation[], paretoEfficientBudgets: readonly number[]): SensitivityPair[] {
  const sorted = [...paretoEfficientBudgets].sort((a, b) => b - a); // descending, matches BUDGET_VALUES_MS order (450 -> 250)
  const byBudget = new Map(evaluations.map((e) => [e.budgetMs, e]));
  const pairs: SensitivityPair[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const evalA = byBudget.get(a);
    const evalB = byBudget.get(b);
    if (!evalA || !evalB) continue; // one of them is the 450ms Baseline itself (diff=0 by definition, not in the evaluations map)
    const ciOverlap = intervalsOverlap(evalA.primary.stats.ciLower, evalA.primary.stats.ciUpper, evalB.primary.stats.ciLower, evalB.primary.stats.ciUpper);
    pairs.push({
      budgetA: a,
      budgetB: b,
      ciOverlap,
      recommendedSimplerBudget: ciOverlap ? isSimplerBudget(a, b) : null,
    });
  }
  return pairs;
}
