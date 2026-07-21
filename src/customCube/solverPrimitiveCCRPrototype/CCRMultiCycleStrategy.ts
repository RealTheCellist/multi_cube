// --- CCRMultiCycleStrategy (CCR Prototype Sprint v1) -----------------------
// STEP4. Discovery Sprint #3 found 91.9% of the CCR target population has
// MULTIPLE disjoint cycles coexisting, not one isolated N-cycle. Compares,
// at a single FIXED budget (chosen from STEP3's own results, so this
// comparison isn't confounded by budget), two strategies built on the
// exact same reused bounded-DFS search core (CCRBudgetComparison.ts's own
// runBudgetProbe, just given a different CCRStrategy):
//   - A ("singleCycle"): today's established approach (REPAIR's own
//     analyzeMultiCycle + pickLongestCycle pattern) -- resolve only the
//     primary/longest cycle per attempt, relying on repeated Recovery
//     attempts to eventually clear the rest.
//   - B ("multiCycle"): concatenate every disjoint cycle's nodes into one
//     traversal, so a single bounded search can make progress across
//     more than one cycle per attempt.
// No new search algorithm -- both reuse the identical DFS body, differing
// only in which node sequence is handed to it.
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { runBudgetProbe, summarizeBudgetProbe, type BudgetSummary, type InstrumentedResult } from "./CCRBudgetComparison";

export interface MultiCycleComparison {
  budgetMs: number;
  strategyA: BudgetSummary; // singleCycle
  strategyB: BudgetSummary; // multiCycle
}

export function compareMultiCycleStrategies(cubiesList: readonly Cubie[][], lib: WingLibrary, budgetMs: number): MultiCycleComparison {
  const resultsA: InstrumentedResult[] = [];
  const resultsB: InstrumentedResult[] = [];
  for (const cubies of cubiesList) {
    const a = runBudgetProbe(cubies, lib, budgetMs, "singleCycle");
    if (a) resultsA.push(a);
    const b = runBudgetProbe(cubies, lib, budgetMs, "multiCycle");
    if (b) resultsB.push(b);
  }
  return {
    budgetMs,
    strategyA: summarizeBudgetProbe(budgetMs, resultsA),
    strategyB: summarizeBudgetProbe(budgetMs, resultsB),
  };
}
