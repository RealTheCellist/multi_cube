// --- BudgetSweep (ENDGAME Optimization Prototype Refinement Sprint v1,
// STEP1/2) -----------------------------------------------------------------
// Sweeps recoveryReserveMsOverride across the real, already-wired Absorb
// mechanism (fiveByFiveEdgeExecutor.ts's executeTask(), added in the prior
// Prototype Sprint -- UNMODIFIED this Sprint) via real, unmirrored
// FiveByFiveEdgeSolverEngine.solve() calls (SolveProbe.ts, also unmodified
// except for the recoveryTriggered field this Sprint added, a pure
// instrumentation read of an EXISTING trace label). Zero new Production
// changes -- this Sprint only varies the BUDGET VALUE already exposed as an
// optional parameter.
//
// 450ms reproduces today's real, unmodified RECOVERY_RESERVE_MS exactly
// (the Baseline arm for this whole sweep); every other value is a real
// counterfactual, never an estimate, per the Work Order's own "추정 금지"
// instruction.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { solveProbe, type SolveProbeResult } from "../solverPrimitiveEndgameOptimizationPrototype/SolveProbe";

export const BUDGET_VALUES_MS = [450, 400, 375, 350, 325, 300, 275, 250] as const;
export const BASELINE_BUDGET_MS = 450; // real, unmodified RECOVERY_RESERVE_MS today

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
