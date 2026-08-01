// --- BudgetEnvelopeAnalysis (PARITY_GATED_CYCLE Validation Protocol
// Qualification Sprint v1, STEP2) -----------------------------------------
// Compares what PARITY_GATED_CYCLE actually receives at TODAY'S REAL
// production settings under attemptRecovery_direct(outer=1000ms real
// production default, outer=2000ms matching its own dedicated slice) vs
// solve_e2e(recoveryReserveMsOverride=250ms real production default) --
// same structure as the MCM Validation Methodology Qualification Sprint
// v1's own BudgetEnvelopeAnalysis.ts.
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { parityRecoveryTimelineProbe, solveE2EProbe, PLAN_TIME_BUDGET_MS } from "./SharedProbes";

export const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000; // fiveByFiveEdgeRecovery.ts's own constant -- read-only citation
export const PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS = 250; // fiveByFiveEdgeExecutor.ts's own real default -- read-only citation

export interface BudgetEnvelopeRow {
  label: string;
  path: "attemptRecovery_direct" | "solve_e2e";
  configDescription: string;
  outerOrPlanDeadlineMs: number;
  actualRemainingTimeAtParityOrRecoveryStartMs: number | null;
  dedicatedBudgetMs: number;
  effectiveBudgetMs: number | null;
}

export function buildBudgetEnvelopeComparison(cases: readonly HoleCase[], libs: ExecutorLibraries): BudgetEnvelopeRow[] {
  const rows: BudgetEnvelopeRow[] = [];

  for (const hole of cases) {
    const ar1000 = parityRecoveryTimelineProbe(hole, libs, 1000);
    rows.push({
      label: hole.label,
      path: "attemptRecovery_direct",
      configDescription: "outer=1000ms (real production outer deadline)",
      outerOrPlanDeadlineMs: 1000,
      actualRemainingTimeAtParityOrRecoveryStartMs: ar1000.parityRemainingTimeAtStartMs,
      dedicatedBudgetMs: PARITY_GATED_CYCLE_RESERVED_SLICE_MS,
      effectiveBudgetMs: ar1000.parityRemainingTimeAtStartMs !== null ? Math.min(ar1000.parityRemainingTimeAtStartMs, PARITY_GATED_CYCLE_RESERVED_SLICE_MS) : null,
    });

    const ar2000 = parityRecoveryTimelineProbe(hole, libs, 2000);
    rows.push({
      label: hole.label,
      path: "attemptRecovery_direct",
      configDescription: "outer=2000ms (PARITY_GATED_CYCLE 자신의 명목 dedicated budget과 동일)",
      outerOrPlanDeadlineMs: 2000,
      actualRemainingTimeAtParityOrRecoveryStartMs: ar2000.parityRemainingTimeAtStartMs,
      dedicatedBudgetMs: PARITY_GATED_CYCLE_RESERVED_SLICE_MS,
      effectiveBudgetMs: ar2000.parityRemainingTimeAtStartMs !== null ? Math.min(ar2000.parityRemainingTimeAtStartMs, PARITY_GATED_CYCLE_RESERVED_SLICE_MS) : null,
    });

    const solveDefault = solveE2EProbe(hole, PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS);
    rows.push({
      label: hole.label,
      path: "solve_e2e",
      configDescription: `recoveryReserveMsOverride=${PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS}ms (real production default)`,
      outerOrPlanDeadlineMs: PLAN_TIME_BUDGET_MS,
      actualRemainingTimeAtParityOrRecoveryStartMs: solveDefault.remainingTimeAtRecoveryTriggerMs,
      dedicatedBudgetMs: PARITY_GATED_CYCLE_RESERVED_SLICE_MS,
      effectiveBudgetMs: solveDefault.remainingTimeAtRecoveryTriggerMs !== null ? Math.min(Math.max(0, solveDefault.remainingTimeAtRecoveryTriggerMs), PARITY_GATED_CYCLE_RESERVED_SLICE_MS) : null,
    });
  }

  return rows;
}
