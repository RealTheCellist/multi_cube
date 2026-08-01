// --- CounterfactualValidation (Multi-Component Merge Validation
// Methodology Qualification Sprint v1, STEP5) ----------------------------------
// Directly answers the Directive's own STEP5 question: "같은 Case가 Method만
// 바뀌면 PASS→FAIL이 되는가?" -- extracts the two specific configs that
// correspond to the Short-Circuit Production Integration Sprint v1's own
// method (attemptRecovery_direct, outer=2000ms) and the Product Validation
// Sprint v1's own method (solve_e2e, recoveryReserveMsOverride=250ms real
// default) from STEP3's already-collected sweep data -- no new execution,
// pure extraction+comparison of data this Sprint already gathered honestly.
import type { AttemptRecoverySweepRow, SolveSweepRow } from "./SensitivityAnalysis";

export interface MethodComparisonRow {
  label: string;
  shortCircuitMethodResult: "PASS" | "FAIL"; // attemptRecovery_direct @ outer=2000ms -- improved===true => PASS
  productValidationMethodResult: "PASS" | "FAIL"; // solve_e2e @ recoveryReserveMsOverride=250ms -- improved===true => PASS
  methodFlipsResult: boolean; // the two methods disagree on the SAME case
}

export function buildCounterfactualValidation(attemptRecoverySweep: readonly AttemptRecoverySweepRow[], solveSweep: readonly SolveSweepRow[]): MethodComparisonRow[] {
  const labels = [...new Set(attemptRecoverySweep.map((r) => r.label))];
  return labels.map((label) => {
    const shortCircuitRow = attemptRecoverySweep.find((r) => r.label === label && r.outerDeadlineMs === 2000);
    const productValidationRow = solveSweep.find((r) => r.label === label && r.recoveryReserveMsOverride === 250);
    const shortCircuitMethodResult: "PASS" | "FAIL" = shortCircuitRow?.result.improved ? "PASS" : "FAIL";
    const productValidationMethodResult: "PASS" | "FAIL" = productValidationRow?.result.improved ? "PASS" : "FAIL";
    return {
      label,
      shortCircuitMethodResult,
      productValidationMethodResult,
      methodFlipsResult: shortCircuitMethodResult !== productValidationMethodResult,
    };
  });
}
