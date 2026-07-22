// --- CapabilityRecovery (Incremental Recovery Architecture Prototype
// Refinement Sprint v1, STEP2) ----------------------------------------------
// Success-rate recovery curve as budget increases, measured against two
// references: the 40ms baseline (this Sprint's own starting point, per the
// work order's "40ms 대비 회복 곡선") and the unconstrained ceiling (no
// deadline at all -- the theoretical maximum any budget could recover).
//
// Disclosed scope note (unchanged from Architecture Prototype Sprint v1):
// native path-finding success rate is used as the honest proxy for
// "whole-cube"/"task-level" capability, since wiring through
// enumerateWingCandidates/tryFixWing's real library-entry target selection
// remains out of this Sprint's protected scope. "Deferred Reject" (one of
// STEP2's four named items) belongs to the CCR/REPAIR Scheduler layer
// (Incremental Recovery Prototype Sprint v1's own IncrementalScheduler) --
// this Sprint's benchmark operates below and independent of that
// scheduler, so it is marked not-applicable-at-this-layer, same disclosure
// pattern as "Duplicate impact" in the prior Sprint.
import type { BudgetSweepRecord } from "./BudgetSweep";

export interface CapabilityRecoveryPoint {
  budgetMs: number;
  successRate: number;
  recoveryVs40msPp: number; // percentage points recovered relative to the 40ms baseline
  recoveryVsCeilingPct: number; // % of the (ceiling - 40ms) gap this budget has closed
  deferredReject: "not-applicable-at-this-layer";
}

export function analyzeCapabilityRecovery(
  sweepByBudget: ReadonlyMap<number, readonly BudgetSweepRecord[]>,
  baselineNoDeadline: readonly BudgetSweepRecord[]
): CapabilityRecoveryPoint[] {
  const ceilingSuccessRate = baselineNoDeadline.length
    ? baselineNoDeadline.filter((r) => r.foundPath).length / baselineNoDeadline.length
    : 0;

  const budgets = [...sweepByBudget.keys()].sort((a, b) => a - b);
  const at40 = sweepByBudget.get(40);
  const successRateAt40 = at40 && at40.length ? at40.filter((r) => r.foundPath).length / at40.length : 0;
  const gap = ceilingSuccessRate - successRateAt40;

  return budgets.map((budgetMs) => {
    const records = sweepByBudget.get(budgetMs)!;
    const n = records.length;
    const successRate = n ? records.filter((r) => r.foundPath).length / n : 0;
    const recoveryVs40msPp = (successRate - successRateAt40) * 100;
    const recoveryVsCeilingPct = gap !== 0 ? ((successRate - successRateAt40) / gap) * 100 : 0;
    return {
      budgetMs,
      successRate,
      recoveryVs40msPp,
      recoveryVsCeilingPct,
      deferredReject: "not-applicable-at-this-layer",
    };
  });
}
