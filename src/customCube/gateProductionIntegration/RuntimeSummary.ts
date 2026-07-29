// --- RuntimeSummary (Gate Production Integration Sprint v1, RQ-5) ----------
// MIXED_COMMUTATOR's own isolated generation cost (onEvent start->end),
// NOT the whole generateRecoveryStrategies() call -- see
// RecoveryFlowMeasurement.ts's own mixedOwnMs comment for why the whole
// call would be the wrong metric here.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { FlowMeasurementRow } from "./RecoveryFlowMeasurement";

export function summarizeGenerationRuntime(rows: readonly FlowMeasurementRow[]): SampleStats {
  return computeStats(rows.map((r) => r.mixedOwnMs).filter((v): v is number => v !== null));
}
