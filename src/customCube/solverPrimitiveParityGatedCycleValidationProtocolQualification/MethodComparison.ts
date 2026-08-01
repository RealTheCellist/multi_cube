// --- MethodComparison (PARITY_GATED_CYCLE Validation Protocol
// Qualification Sprint v1, STEP4) -----------------------------------------
// Directly answers STEP4's own question: "Method만 변경했을 때 PASS<->FAIL
// Flip이 발생하는가?" -- extracts Method A (attemptRecovery_direct @
// outer=2000ms, PARITY_GATED_CYCLE's own nominal dedicated budget) and
// Method B (solve_e2e @ recoveryReserveMsOverride=250ms, real production
// default) from STEP3's already-collected sweep data. Mirrors MCM
// Validation Methodology Qualification Sprint v1's own
// CounterfactualValidation.ts pattern exactly.
import type { AttemptRecoverySweepRow, SolveSweepRow } from "./SensitivityAnalysis";

export interface MethodComparisonRow {
  label: string;
  methodAResult: "PASS" | "FAIL"; // attemptRecovery_direct @ outer=2000ms -- improved===true => PASS
  methodBResult: "PASS" | "FAIL"; // solve_e2e @ recoveryReserveMsOverride=250ms -- improved===true => PASS
  methodAChosenType: string;
  methodBChosenType: string;
  methodARuntimeProxy: number | null; // parityOwnRuntimeMs from Method A's own onEvent timeline
  methodBRuntimeProxy: number | null; // remainingTimeAtRecoveryTriggerMs from Method B's own trace timeline
  methodFlipsResult: boolean;
}

export function buildMethodComparison(attemptRecoverySweep: readonly AttemptRecoverySweepRow[], solveSweep: readonly SolveSweepRow[]): MethodComparisonRow[] {
  const labels = [...new Set(attemptRecoverySweep.map((r) => r.label))];
  return labels.map((label) => {
    const methodARow = attemptRecoverySweep.find((r) => r.label === label && r.outerDeadlineMs === 2000);
    const methodBRow = solveSweep.find((r) => r.label === label && r.recoveryReserveMsOverride === 250);
    const methodAResult: "PASS" | "FAIL" = methodARow?.result.improved ? "PASS" : "FAIL";
    const methodBResult: "PASS" | "FAIL" = methodBRow?.result.improved ? "PASS" : "FAIL";
    return {
      label,
      methodAResult,
      methodBResult,
      methodAChosenType: methodARow?.result.chosenType ?? "none",
      methodBChosenType: methodBRow?.result.chosenType ?? "none",
      methodARuntimeProxy: methodARow?.result.parityOwnRuntimeMs ?? null,
      methodBRuntimeProxy: methodBRow?.result.remainingTimeAtRecoveryTriggerMs ?? null,
      methodFlipsResult: methodAResult !== methodBResult,
    };
  });
}
