// --- BudgetAllocationSweep (Production Integration Blueprint Sprint v1,
// RQ-2, Required Analysis #2) --------------------------------------------
// Measures Mixed Commutator's OWN capability/runtime dose-response across
// budgets relevant to the 3 allocation policies RQ-2 asks about:
//   - 75ms:  matches BOTH "균등 분배" (RECOVERY_GEN_BUDGET_MS/4 = 75,
//     the exact shared-slice() formula DISRUPT/DISRUPT/SETUP/REPAIR's
//     non-reservedBudget path would use) AND REPAIR's own
//     REPAIR_RESERVED_SLICE_MS=75ms reserved-slice precedent.
//   - 150ms: RECOVERY_RETRY_BUDGET_MS (a second real, disclosed
//     production constant, read from fiveByFiveEdgeRecovery.ts).
//   - 300ms: full RECOVERY_GEN_BUDGET_MS (equivalent to CCR's own
//     "remainingTime" contract in the common case where little of the
//     shared budget has been consumed yet).
//   - 5000ms: this arc's own "extended budget" convention, upper bound.
import { cloneCubies, type Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";

export const SWEEP_BUDGETS_MS = [75, 150, 300, 5000] as const;

export interface BudgetSweepPoint {
  budgetMs: number;
  n: number;
  solvedCount: number;
  successRate: number;
  lowFootprintCount: number;
  avgRuntimeMs: number;
}

export function sweepBudget(cases: { label: string; cubies: Cubie[] }[], lib: WingLibrary, budgetMs: number): BudgetSweepPoint {
  let solvedCount = 0;
  let lowFootprintCount = 0;
  let totalRuntime = 0;
  for (const c of cases) {
    const t0 = Date.now();
    const result = runMixedCommutatorPrototype(cloneCubies(c.cubies), lib, Date.now() + budgetMs);
    totalRuntime += Date.now() - t0;
    if (result.moves) {
      solvedCount++;
      if (result.footprintRatio !== null && result.footprintRatio <= 2.0) lowFootprintCount++;
    }
  }
  return {
    budgetMs,
    n: cases.length,
    solvedCount,
    successRate: cases.length ? solvedCount / cases.length : 0,
    lowFootprintCount,
    avgRuntimeMs: cases.length ? totalRuntime / cases.length : 0,
  };
}
