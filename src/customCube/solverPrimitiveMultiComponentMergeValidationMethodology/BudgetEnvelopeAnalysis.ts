// --- BudgetEnvelopeAnalysis (Multi-Component Merge Validation Methodology
// Qualification Sprint v1, STEP2) --------------------------------------------
// Compares what MCM actually receives at TODAY'S REAL production settings
// under each measurement path: attemptRecovery_direct at outer=1000ms (real
// production outer deadline) and outer=2000ms (Short-Circuit Production
// Integration Sprint v1's own reproduction condition), vs solve_e2e at
// recoveryReserveMsOverride=250ms (real production default).
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { attemptRecoveryTimelineProbe, solveE2EProbe, PLAN_TIME_BUDGET_MS } from "./SharedProbes";

export const MCM_NOMINAL_DEDICATED_BUDGET_MS = 2000; // MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS, fiveByFiveEdgeRecovery.ts -- read-only citation
export const PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS = 250; // fiveByFiveEdgeExecutor.ts's own real default -- read-only citation

export interface BudgetEnvelopeRow {
  label: string;
  path: "attemptRecovery_direct" | "solve_e2e";
  configDescription: string;
  outerOrPlanDeadlineMs: number;
  actualRemainingTimeAtMcmOrRecoveryStartMs: number | null;
  dedicatedBudgetMs: number; // MCM's own nominal cap
  effectiveBudgetMs: number | null; // min(actualRemainingTime, dedicatedBudget) -- what MCM could actually use
}

export function buildBudgetEnvelopeComparison(cases: readonly HoleCase[], libs: ExecutorLibraries): BudgetEnvelopeRow[] {
  const rows: BudgetEnvelopeRow[] = [];

  for (const hole of cases) {
    const ar1000 = attemptRecoveryTimelineProbe(hole, libs, 1000);
    rows.push({
      label: hole.label,
      path: "attemptRecovery_direct",
      configDescription: "outer=1000ms (real production outer deadline)",
      outerOrPlanDeadlineMs: 1000,
      actualRemainingTimeAtMcmOrRecoveryStartMs: ar1000.mcmRemainingTimeAtStartMs,
      dedicatedBudgetMs: MCM_NOMINAL_DEDICATED_BUDGET_MS,
      effectiveBudgetMs: ar1000.mcmRemainingTimeAtStartMs !== null ? Math.min(ar1000.mcmRemainingTimeAtStartMs, MCM_NOMINAL_DEDICATED_BUDGET_MS) : null,
    });

    const ar2000 = attemptRecoveryTimelineProbe(hole, libs, 2000);
    rows.push({
      label: hole.label,
      path: "attemptRecovery_direct",
      configDescription: "outer=2000ms (Short-Circuit Production Integration Sprint v1's own reproduction condition)",
      outerOrPlanDeadlineMs: 2000,
      actualRemainingTimeAtMcmOrRecoveryStartMs: ar2000.mcmRemainingTimeAtStartMs,
      dedicatedBudgetMs: MCM_NOMINAL_DEDICATED_BUDGET_MS,
      effectiveBudgetMs: ar2000.mcmRemainingTimeAtStartMs !== null ? Math.min(ar2000.mcmRemainingTimeAtStartMs, MCM_NOMINAL_DEDICATED_BUDGET_MS) : null,
    });

    const solveDefault = solveE2EProbe(hole, PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS);
    rows.push({
      label: hole.label,
      path: "solve_e2e",
      configDescription: `recoveryReserveMsOverride=${PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS}ms (real production default)`,
      outerOrPlanDeadlineMs: PLAN_TIME_BUDGET_MS,
      actualRemainingTimeAtMcmOrRecoveryStartMs: solveDefault.remainingTimeAtRecoveryTriggerMs,
      dedicatedBudgetMs: MCM_NOMINAL_DEDICATED_BUDGET_MS,
      effectiveBudgetMs: solveDefault.remainingTimeAtRecoveryTriggerMs !== null ? Math.min(Math.max(0, solveDefault.remainingTimeAtRecoveryTriggerMs), MCM_NOMINAL_DEDICATED_BUDGET_MS) : null,
    });
  }

  return rows;
}
