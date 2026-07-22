// --- CapabilityRegressionAnalysis (Incremental Recovery Architecture
// Prototype Sprint v1, STEP3-4) --------------------------------------------
// STEP3 Capability Preservation and STEP4 Regression Analysis both derive
// from the SAME pair of measurements per test case: a baseline call with no
// deadline (bfsMoveWingToPosition's exact pre-Sprint behavior) and a
// budget-constrained call with a real 40ms deadline (this Sprint's own
// Production change). Because both calls explore the identical, deterministic
// traversal order over the identical maxDepth=6 bound (see
// bfsMoveWingToPosition's own comment: the added checks are the ONLY
// difference from prior behavior), the budget-constrained call can only
// fail to find a path that the baseline found for one reason: the deadline
// fired mid-search. There is no other source of divergence to classify.
//
// Disclosed scope note: "whole-cube"/task-level capability (as the Sprint's
// own STEP3 names it) would require wiring through enumerateWingCandidates/
// tryFixWing's real library-entry target selection, which is out of this
// Sprint's protected scope (see TraversalInterruptibilityCore.ts's own
// disclosure). Native path-finding success rate and path length are used
// here as the honest, disclosed proxy.
//
// "Duplicate impact" (one of STEP4's four named items) is Visited-Registry
// territory (Prototype Refinement Sprint v1's own VisitedRegistry.ts) --
// this Sprint does not touch or wire the Visited Registry at all, so it is
// explicitly marked not-applicable-at-this-layer rather than fabricated.
import type { BudgetProbeRecord } from "./BudgetCompliance";

export interface PairedCaseResult {
  hash: string;
  pieceId: number;
  baseline: BudgetProbeRecord;
  budgeted: BudgetProbeRecord;
}

export function pairResults(
  baseline: readonly BudgetProbeRecord[],
  budgeted: readonly BudgetProbeRecord[]
): PairedCaseResult[] {
  if (baseline.length !== budgeted.length) {
    throw new Error("pairResults: baseline/budgeted length mismatch -- must be run on the exact same case list");
  }
  return baseline.map((b, i) => ({ hash: b.hash, pieceId: b.pieceId, baseline: b, budgeted: budgeted[i] }));
}

export interface CapabilityPreservationSummary {
  n: number;
  baselineSuccessRate: number; // native path-finding success rate, no deadline
  budgetedSuccessRate: number; // native path-finding success rate, real 40ms deadline
  successRateDeltaPct: number; // budgeted - baseline, in percentage points
}

/** STEP3: does the real deadline cost any native path-finding capability, and how much? */
export function analyzeCapabilityPreservation(pairs: readonly PairedCaseResult[]): CapabilityPreservationSummary {
  const n = pairs.length;
  const baselineSuccess = pairs.filter((p) => p.baseline.foundPath).length;
  const budgetedSuccess = pairs.filter((p) => p.budgeted.foundPath).length;
  const baselineSuccessRate = n ? baselineSuccess / n : 0;
  const budgetedSuccessRate = n ? budgetedSuccess / n : 0;
  return {
    n,
    baselineSuccessRate,
    budgetedSuccessRate,
    successRateDeltaPct: (budgetedSuccessRate - baselineSuccessRate) * 100,
  };
}

export interface RegressionAnalysisSummary {
  n: number;
  trueRegressionCount: number; // baseline found a path, budgeted call returned null -- capability actually lost to the deadline abort
  falseRegressionCount: number; // baseline ALSO found nothing -- both null regardless of the deadline, not a real loss
  abortCausedCapabilityLossRate: number; // trueRegressionCount / n -- by construction, identical to the True Regression rate (see file header)
  duplicateImpact: "not-applicable-at-this-layer"; // this Sprint does not touch the Visited Registry
}

/** STEP4: classify every case where the budgeted run returned null. */
export function analyzeRegression(pairs: readonly PairedCaseResult[]): RegressionAnalysisSummary {
  const n = pairs.length;
  let trueRegressionCount = 0;
  let falseRegressionCount = 0;
  for (const p of pairs) {
    if (p.budgeted.foundPath) continue; // no loss to classify
    if (p.baseline.foundPath) trueRegressionCount++;
    else falseRegressionCount++;
  }
  return {
    n,
    trueRegressionCount,
    falseRegressionCount,
    abortCausedCapabilityLossRate: n ? trueRegressionCount / n : 0,
    duplicateImpact: "not-applicable-at-this-layer",
  };
}
