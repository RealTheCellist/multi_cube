// --- BudgetAllocationMatrix (CONFLICT_DEEP_DEPENDENCY Budget & Scheduling
// Validation Sprint v1, Deliverable #1) --------------------------------------
import type { ArmSummaryAtSize } from "./DoseResponseAnalysis";
import type { ArmName } from "./ShadowScheduler";

export interface BudgetAllocationMatrixRow {
  reservationMs: number;
  byArm: Record<ArmName, ArmSummaryAtSize>;
}

export function buildBudgetAllocationMatrix(allSummaries: readonly ArmSummaryAtSize[], reservationSizes: readonly number[]): BudgetAllocationMatrixRow[] {
  return reservationSizes.map((reservationMs) => {
    const rowSummaries = allSummaries.filter((s) => s.reservationMs === reservationMs);
    const byArm = {} as Record<ArmName, ArmSummaryAtSize>;
    for (const s of rowSummaries) byArm[s.arm] = s;
    return { reservationMs, byArm };
  });
}

export interface BestConfiguration {
  arm: ArmName;
  reservationMs: number;
  improvedRate: number;
  timeoutRate: number;
}

/** Disclosed selection rule: among non-Baseline Arms, pick the
 * (arm, reservationMs) with the highest improvedRate; ties broken by lower
 * timeoutRate (prefer a configuration that isn't budget-starved itself). */
export function findBestConfiguration(allSummaries: readonly ArmSummaryAtSize[]): BestConfiguration | null {
  const candidates = allSummaries.filter((s) => s.arm !== "BASELINE");
  if (candidates.length === 0) return null;
  const best = candidates.reduce((a, b) => {
    if (b.improvedRate > a.improvedRate) return b;
    if (b.improvedRate === a.improvedRate && b.timeoutRate < a.timeoutRate) return b;
    return a;
  });
  return { arm: best.arm, reservationMs: best.reservationMs, improvedRate: best.improvedRate, timeoutRate: best.timeoutRate };
}
