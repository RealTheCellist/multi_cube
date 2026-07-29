// --- FamilyTransitionMatrix (Solver Primitive Set Completeness Validation
// Sprint v2, RQ-3, Required Analysis #3) -------------------------------------
// Compares v1's own baseline Residual Failure Taxonomy counts (read from
// primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-
// result.json, UNMODIFIED) against this Sprint's new counts (same taxonomy,
// classifyResidual() reused verbatim, only the input population changed --
// residuals are now defined against a 6-primitive union including
// MIXED_COMMUTATOR instead of v1's 5). Directive's own example format:
// "PURE_CYCLE_ISOLATION 4 / CONFLICT_DEEP_DEPENDENCY 9 / BRIDGE_MISSING 0 /
// NEW_FAMILY 6".
import type { ResidualFailureClass } from "../primitiveSetCompleteness/ResidualFailureTaxonomy";

export interface FamilyTransitionRow {
  failureClass: ResidualFailureClass | "NEW_FAMILY";
  previousCount: number; // v1
  currentCount: number; // v2
  delta: number; // current - previous
}

const ALL_CLASSES: ResidualFailureClass[] = ["BRIDGE_MISSING", "PURE_CYCLE_ISOLATION", "CONFLICT_DEEP_DEPENDENCY", "LOCKED_PAIR_NO_CYCLE", "UNKNOWN"];

export function buildFamilyTransitionMatrix(
  previousCounts: Partial<Record<ResidualFailureClass, number>>,
  currentCounts: Partial<Record<ResidualFailureClass, number>>,
  newFamilyCount: number
): FamilyTransitionRow[] {
  const rows: FamilyTransitionRow[] = ALL_CLASSES.map((failureClass) => {
    const previousCount = previousCounts[failureClass] ?? 0;
    const currentCount = currentCounts[failureClass] ?? 0;
    return { failureClass, previousCount, currentCount, delta: currentCount - previousCount };
  });
  if (newFamilyCount > 0) {
    rows.push({ failureClass: "NEW_FAMILY", previousCount: 0, currentCount: newFamilyCount, delta: newFamilyCount });
  }
  return rows;
}
