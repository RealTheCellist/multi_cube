// --- CompatibilityReport (Gate Production Integration Sprint v1, RQ-3/RQ-4,
// Deliverable "Recovery Report" / "Regression Report") -----------------------
import type { FlowMeasurementRow } from "./RecoveryFlowMeasurement";

export interface CompatibilitySummary {
  n: number;
  gateGeneratedCount: number;
  gateSkippedCount: number;
  gateEmptyCount: number;
  mixedChosenCount: number;
  outcomeChangedCount: number;
  regressionCount: number; // outcome changed AND wrongWingAfterWithMixed >= wrongWingAfterWithoutMixed
}

export function buildCompatibilityReport(rows: readonly FlowMeasurementRow[]): CompatibilitySummary {
  return {
    n: rows.length,
    gateGeneratedCount: rows.filter((r) => r.gatePhase === "generated").length,
    gateSkippedCount: rows.filter((r) => r.gatePhase === "skipped").length,
    gateEmptyCount: rows.filter((r) => r.gatePhase === "empty").length,
    mixedChosenCount: rows.filter((r) => r.mixedWasChosen).length,
    outcomeChangedCount: rows.filter((r) => r.outcomeChangedByMixed).length,
    regressionCount: rows.filter(
      (r) => r.outcomeChangedByMixed && r.wrongWingAfterWithMixed !== null && r.wrongWingAfterWithoutMixed !== null && r.wrongWingAfterWithMixed >= r.wrongWingAfterWithoutMixed
    ).length,
  };
}
