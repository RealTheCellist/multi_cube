// --- BudgetProfileReport (Solver Primitive Integration Refinement Sprint
// v1) -- STEP2: average generation time / average REPAIR start time /
// remaining deadline when REPAIR starts / timeout ratio, per scheduling
// strategy.
import type { VariantGenerationRun } from "./RefinementRawDataCollector";
import { RECOVERY_GEN_BUDGET_MS } from "../fiveByFiveEdgeRecovery";
import type { SchedulingStrategy } from "../fiveByFiveEdgeRecovery";

export interface BudgetProfileSummary {
  strategy: SchedulingStrategy;
  avgGenerationTimeMs: number;
  avgRepairStartOffsetMsAmongAttempted: number; // only over cases where REPAIR actually started
  avgRemainingBudgetAtRepairStartMs: number; // RECOVERY_GEN_BUDGET_MS - repairStartOffsetMs, among attempted (negative = REPAIR started already past the nominal 300ms budget -- expected/common for reservedBudget by design)
  timeoutRatio: number; // REPAIR attempted but produced no candidate (same definition as STEP1's attemptedButEmptyRate, reported here under STEP2's own requested name)
}

export function summarizeBudgetProfile(strategy: SchedulingStrategy, runs: readonly VariantGenerationRun[]): BudgetProfileSummary {
  const all = runs.flat();
  const n = all.length;
  const avgGenerationTimeMs = n ? all.reduce((a, r) => a + r.generationTimeMs, 0) / n : 0;

  const attempted = all.filter((r) => r.repairAttempted && r.repairStartOffsetMs !== null);
  const avgRepairStartOffsetMsAmongAttempted = attempted.length ? attempted.reduce((a, r) => a + (r.repairStartOffsetMs ?? 0), 0) / attempted.length : 0;
  const avgRemainingBudgetAtRepairStartMs = RECOVERY_GEN_BUDGET_MS - avgRepairStartOffsetMsAmongAttempted;

  const attemptedButEmptyCount = all.filter((r) => r.repairAttempted && !r.repairGenerated).length;
  const timeoutRatio = n ? attemptedButEmptyCount / n : 0;

  return {
    strategy,
    avgGenerationTimeMs,
    avgRepairStartOffsetMsAmongAttempted,
    avgRemainingBudgetAtRepairStartMs,
    timeoutRatio,
  };
}
