// --- BudgetSweep (ENDGAME Optimization Prototype Refinement Sprint v2,
// STEP1) --------------------------------------------------------------------
// Extends v1's own sweep below its own selected 250ms value, down to 50ms.
// Re-includes 450ms (the real, unmodified production default) AND 250ms
// (v1's own selected Operating Contract value) fresh in THIS Sprint's own
// N=30 trial loop -- necessary for genuine paired-diff comparisons (STEP4's
// "250 vs 225" etc. requires both budgets measured within the SAME trial
// index, not reused across two separate Sprint runs with independent
// randomness). v1's own already-real 400/375/350/325/300/275 numbers are
// cited, not re-measured, for the combined Pareto Frontier (STEP3) --
// aggregate-level Pareto comparison doesn't need trial-level pairing.
//
// Zero new Production changes -- reuses the prior Sprint's own SolveProbe.ts
// (recoveryReserveMsOverride pass-through) and RegressionAnalysis.ts
// (classifyAgainstBaseline) completely unmodified.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { solveProbe, type SolveProbeResult } from "../solverPrimitiveEndgameOptimizationPrototype/SolveProbe";

export const BASELINE_BUDGET_MS = 450; // real, unmodified RECOVERY_RESERVE_MS today
export const V1_SELECTED_BUDGET_MS = 250; // v1's own Decision A Operating Contract value
export const NEW_BUDGET_VALUES_MS = [225, 200, 175, 150, 125, 100, 75, 50] as const;
// Full sweep this Sprint measures fresh, in the SAME trial loop (for valid
// paired-diff): the original baseline, v1's own selected value (re-measured
// for a like-for-like anchor), and the 8 new, lower budgets.
export const BUDGET_VALUES_MS = [BASELINE_BUDGET_MS, V1_SELECTED_BUDGET_MS, ...NEW_BUDGET_VALUES_MS] as const;

export function runOneBudgetTrial(snapshots: readonly FailureSnapshot[], budgetMs: number): SolveProbeResult[] {
  return snapshots.map((s) => solveProbe(deserializeCube(s.cubeState), undefined, budgetMs));
}

export interface BudgetTrialAggregate {
  budgetMs: number;
  n: number;
  improvedCount: number;
  solvedCount: number;
  avgWallMs: number;
  deadlineMissRate: number;
  endgameInvokedCount: number;
  avgEndgameRuntimeMs: number;
  recoveryTriggerCount: number;
  recoveryTriggerRate: number;
}

export function summarizeBudgetTrial(results: readonly SolveProbeResult[], budgetMs: number): BudgetTrialAggregate {
  const n = results.length;
  const withEndgame = results.filter((r) => r.endgame !== null);
  const recoveryTriggerCount = results.filter((r) => r.recoveryTriggered).length;
  return {
    budgetMs,
    n,
    improvedCount: results.filter((r) => r.improved).length,
    solvedCount: results.filter((r) => r.solved).length,
    avgWallMs: n ? results.reduce((a, r) => a + r.wallMs, 0) / n : 0,
    deadlineMissRate: n ? results.filter((r) => r.deadlineMissed).length / n : 0,
    endgameInvokedCount: withEndgame.length,
    avgEndgameRuntimeMs: withEndgame.length ? withEndgame.reduce((a, r) => a + r.endgame!.runtimeMs, 0) / withEndgame.length : 0,
    recoveryTriggerCount,
    recoveryTriggerRate: n ? recoveryTriggerCount / n : 0,
  };
}

/** One full trial across ALL budgets for one snapshot subsample -- the unit repeated N=30 times. */
export function runOneTrialAllBudgets(
  snapshots: readonly FailureSnapshot[],
  budgets: readonly number[] = BUDGET_VALUES_MS
): Map<number, SolveProbeResult[]> {
  const out = new Map<number, SolveProbeResult[]>();
  for (const budgetMs of budgets) {
    out.set(budgetMs, runOneBudgetTrial(snapshots, budgetMs));
  }
  return out;
}
