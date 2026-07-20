// --- SchedulingVerificationReport (Solver Primitive Integration
// Refinement Sprint v1) -- STEP1: does budget starvation actually
// decrease under Strategy A/B? Measures REPAIR generated / Gate matched /
// Generation skipped / whole-call budget exhausted, per scheduling
// strategy, across N runs.
import type { VariantGenerationRun } from "./RefinementRawDataCollector";
import { RECOVERY_GEN_BUDGET_MS } from "../fiveByFiveEdgeRecovery";
import type { SchedulingStrategy } from "../fiveByFiveEdgeRecovery";

export interface SchedulingVerificationSummary {
  strategy: SchedulingStrategy;
  observations: number; // nRuns * snapshots.length
  repairGeneratedRate: number;
  generationSkippedRate: number; // REPAIR's turn never even attempted -- always 0 for reservedBudget by construction
  attemptedButEmptyRate: number; // REPAIR was attempted but produced no candidate (Gate mismatch upon attempt OR its own search exhausted its slice -- not distinguished, same disclosed limitation as Integration Prototype Sprint v1's STEP2)
  wholeCallOverBudgetRate: number; // generationTimeMs > RECOVERY_GEN_BUDGET_MS(300ms) -- whole generateRecoveryStrategies() call ran longer than its nominal shared budget
}

export function summarizeSchedulingVerification(strategy: SchedulingStrategy, runs: readonly VariantGenerationRun[]): SchedulingVerificationSummary {
  const all = runs.flat();
  const n = all.length;
  const generatedCount = all.filter((r) => r.repairGenerated).length;
  const skippedCount = all.filter((r) => r.repairSkipped).length;
  const attemptedButEmptyCount = all.filter((r) => r.repairAttempted && !r.repairGenerated).length;
  const overBudgetCount = all.filter((r) => r.generationTimeMs > RECOVERY_GEN_BUDGET_MS).length;

  return {
    strategy,
    observations: n,
    repairGeneratedRate: n ? generatedCount / n : 0,
    generationSkippedRate: n ? skippedCount / n : 0,
    attemptedButEmptyRate: n ? attemptedButEmptyCount / n : 0,
    wholeCallOverBudgetRate: n ? overBudgetCount / n : 0,
  };
}
