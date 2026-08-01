// --- RegressionAudit (Multi-Component Merge Short-Circuit Production
// Integration Sprint v1, STEP5) -----------------------------------------------
// Full-population Regression/Duplicate/Interaction check comparing the
// Baseline (pre-fix) vs Integrated (post-fix) real attemptRecovery()
// replay, both captured at today's real production defaults (outer=1000ms,
// AFTER_CCR, every include* flag at its true default).
import type { ReplayOutcome } from "./ReplayRunner";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE", "MULTI_COMPONENT_MERGE"];

export interface RegressionAuditRow {
  label: string;
  baselineImproved: boolean;
  integratedImproved: boolean;
  newRegression: boolean; // baseline was fine (not trueRegression), integrated newly regresses
  newCapability: boolean; // baseline did NOT improve, integrated DOES (attributable to the fix)
  duplicateRescue: boolean; // integrated's own chosenType is MULTI_COMPONENT_MERGE but baseline ALREADY improved via a different type on this exact case -- the fix produced a redundant win, not a new one
}

export interface RegressionAuditSummary {
  n: number;
  newRegressionCount: number;
  newCapabilityCount: number;
  duplicateRescueCount: number;
  starvedTypeCount: number; // RecoveryTypes never chosen anywhere in the Integrated population
  rows: RegressionAuditRow[];
}

export function auditRegression(baseline: readonly ReplayOutcome[], integrated: readonly ReplayOutcome[]): RegressionAuditSummary {
  const baselineByLabel = new Map(baseline.map((r) => [r.label, r]));
  const rows: RegressionAuditRow[] = integrated.map((intRow) => {
    const baseRow = baselineByLabel.get(intRow.label)!;
    const newRegression = !baseRow.trueRegression && intRow.trueRegression;
    const newCapability = !baseRow.improved && intRow.improved;
    const duplicateRescue = intRow.chosenType === "MULTI_COMPONENT_MERGE" && intRow.improved && baseRow.improved;
    return {
      label: intRow.label,
      baselineImproved: baseRow.improved,
      integratedImproved: intRow.improved,
      newRegression,
      newCapability,
      duplicateRescue,
    };
  });

  const chosenTypesInIntegrated = new Set(integrated.map((r) => r.chosenType));
  const starvedTypeCount = ALL_RECOVERY_TYPES.filter((t) => !chosenTypesInIntegrated.has(t)).length;

  return {
    n: rows.length,
    newRegressionCount: rows.filter((r) => r.newRegression).length,
    newCapabilityCount: rows.filter((r) => r.newCapability).length,
    duplicateRescueCount: rows.filter((r) => r.duplicateRescue).length,
    starvedTypeCount,
    rows,
  };
}
