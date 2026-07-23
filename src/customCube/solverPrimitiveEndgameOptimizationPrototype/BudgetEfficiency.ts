// --- BudgetEfficiency (ENDGAME Optimization Prototype Sprint v1, STEP5)
// -----------------------------------------------------------------------
// Measures the ACTUAL usage rate of whatever real wall-clock budget each
// policy variant made available to ENDGAME at the moment it actually ran --
// using `avgEndgameRemainingBudgetAtStartMs` (the REAL remaining time until
// the outer deadline when ENDGAME's own task started, taken directly from
// solve()'s own instrumentation trace -- not a theoretical reservation
// figure) as the denominator, since Reserved Slice's 500ms is a GUARANTEED
// FLOOR (the real available window can be larger, if earlier tasks
// finished early) and Absorb's 150ms delta (450->300) is not a flat
// reservation at all, just a smaller subtraction from whatever the outer
// deadline already was -- a flat "reserved 500ms" denominator would
// mischaracterize Absorb's mechanism entirely.
import type { ArmAggregate } from "./ThreeArmBenchmark";

// Below this fraction, the reservation is flagged as likely over-provisioned
// (a real, measured window was available but ENDGAME didn't need most of
// it) -- disclosed as a threshold choice, not a value from the Blueprint.
const LOW_USAGE_THRESHOLD = 0.5;

export interface BudgetEfficiencyRow {
  armName: string;
  endgameInvocationCount: number;
  avgEndgameRuntimeMs: number;
  avgRemainingBudgetAtStartMs: number; // real, measured available window when ENDGAME started
  usageRate: number; // avgEndgameRuntimeMs / avgRemainingBudgetAtStartMs
  flaggedLowUsage: boolean;
}

function toRow(armName: string, agg: ArmAggregate): BudgetEfficiencyRow {
  const usageRate = agg.avgEndgameRemainingBudgetAtStartMs > 0 ? agg.avgEndgameRuntimeMs / agg.avgEndgameRemainingBudgetAtStartMs : 0;
  return {
    armName,
    endgameInvocationCount: agg.endgameInvokedCount,
    avgEndgameRuntimeMs: agg.avgEndgameRuntimeMs,
    avgRemainingBudgetAtStartMs: agg.avgEndgameRemainingBudgetAtStartMs,
    usageRate,
    flaggedLowUsage: agg.endgameInvokedCount > 0 && usageRate < LOW_USAGE_THRESHOLD,
  };
}

export function evaluateBudgetEfficiency(baseline: ArmAggregate, reservedSlice: ArmAggregate, absorb: ArmAggregate): BudgetEfficiencyRow[] {
  return [toRow("Baseline", baseline), toRow("ReservedSlice", reservedSlice), toRow("Absorb", absorb)];
}
