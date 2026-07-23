// --- CapabilityGainModel (ENDGAME Optimization Blueprint Sprint v1, STEP2)
// -----------------------------------------------------------------------------
// Computes Marginal Gain (ΔImprovement per Δbudget, normalized to "expected
// gain per additional 100ms") directly from Bottleneck Attribution
// Refinement Sprint v1's own real Saturation Curve -- a closed-form
// derivation from already-measured data, no new benchmark run needed.
import { REAL_SATURATION_CURVE } from "./BudgetAllocationBlueprint";

export interface MarginalGainRow {
  fromBudgetMs: number;
  toBudgetMs: number;
  deltaBudgetMs: number;
  deltaImprovement: number;
  gainPer100Ms: number; // deltaImprovement / (deltaBudgetMs/100) -- "expected Capability per additional 100ms"
}

export function computeMarginalGainCurve(): MarginalGainRow[] {
  const rows: MarginalGainRow[] = [];
  for (let i = 1; i < REAL_SATURATION_CURVE.length; i++) {
    const from = REAL_SATURATION_CURVE[i - 1];
    const to = REAL_SATURATION_CURVE[i];
    const deltaBudgetMs = to.budgetMs - from.budgetMs;
    const deltaImprovement = to.avgImprovement - from.avgImprovement;
    rows.push({
      fromBudgetMs: from.budgetMs,
      toBudgetMs: to.budgetMs,
      deltaBudgetMs,
      deltaImprovement,
      gainPer100Ms: deltaBudgetMs > 0 ? (deltaImprovement / deltaBudgetMs) * 100 : 0,
    });
  }
  return rows;
}

export interface CapabilityGainSummary {
  rows: MarginalGainRow[];
  bestGainPer100MsSegment: MarginalGainRow;
  diminishingReturnsObserved: boolean; // does gainPer100Ms strictly decrease as budget grows (classic saturation), or does it re-accelerate (e.g. the 1000->5000 jump)?
}

export function summarizeCapabilityGain(): CapabilityGainSummary {
  const rows = computeMarginalGainCurve();
  const bestGainPer100MsSegment = rows.reduce((best, r) => (r.gainPer100Ms > best.gainPer100Ms ? r : best));
  let diminishingReturnsObserved = true;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].gainPer100Ms > rows[i - 1].gainPer100Ms) diminishingReturnsObserved = false;
  }
  return { rows, bestGainPer100MsSegment, diminishingReturnsObserved };
}
