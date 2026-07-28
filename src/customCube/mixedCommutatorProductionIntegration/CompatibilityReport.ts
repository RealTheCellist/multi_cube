// --- CompatibilityReport (Mixed Commutator Production Integration Sprint
// v1, RQ-3, Deliverable #4) ------------------------------------------------
import type { FlowMeasurementRow } from "./RecoveryFlowMeasurement";

export interface CompatibilitySummary {
  n: number;
  gateGeneratedCount: number;
  gateSkippedCount: number;
  gateEmptyCount: number;
  mixedChosenCount: number;
  outcomeChangedCount: number; // MIXED_COMMUTATOR's presence changed which candidate wins
  shortCircuitCount: number;
  regressionCount: number; // outcome changed AND wrongWingAfterChosen >= wrongWingBefore (would make things worse)
}

export function buildCompatibilityReport(rows: FlowMeasurementRow[]): CompatibilitySummary {
  return {
    n: rows.length,
    gateGeneratedCount: rows.filter((r) => r.gatePhase === "generated").length,
    gateSkippedCount: rows.filter((r) => r.gatePhase === "skipped").length,
    gateEmptyCount: rows.filter((r) => r.gatePhase === "empty").length,
    mixedChosenCount: rows.filter((r) => r.mixedWasChosen).length,
    outcomeChangedCount: rows.filter((r) => r.outcomeChangedByMixed).length,
    shortCircuitCount: rows.filter((r) => r.wouldShortCircuit).length,
    regressionCount: rows.filter((r) => r.outcomeChangedByMixed && r.mixedWasChosen && r.wrongWingAfterChosen !== null && r.wrongWingAfterChosen >= r.wrongWingBefore).length,
  };
}
