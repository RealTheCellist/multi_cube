// --- ValidationFramework (Multi-Component Merge Production Integration
// Sprint v1, STEP5 continued -- Directive's own "Level4: Validation
// Framework 통과") ------------------------------------------------------------
// Composes Gate A/B/C/E (solverPostReleaseValidationFramework/ReleaseGates.ts,
// UNMODIFIED) + decideFromGates (ValidationPipeline.ts, UNMODIFIED) using
// Category C ("New Primitive", the correct classification for wiring in
// MULTI_COMPONENT_MERGE -- ChangeClassification.ts, UNMODIFIED). Identical
// composition to parityGatedCycleProductionIntegrationV1/Statistics.ts's
// own runValidationFramework() (disclosed precedent, same arm-toggle
// methodology), extended with a real per-RecoveryType
// offered/chosen/starved matrix (solverReleaseReadiness/
// PrimitiveInteractionMatrix.ts's own STARVATION_MIN_OFFERED=5/
// STARVATION_MAX_CHOSEN_RATE=0.05 thresholds, disclosed reuse) that now
// includes MULTI_COMPONENT_MERGE.
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { CapabilityValidationRow } from "./CapabilityValidation";
import type { StatisticalValidationResult } from "./StatisticalValidation";

const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MULTI_COMPONENT_MERGE", "PARITY_GATED_CYCLE", "MIXED_COMMUTATOR"];
const STARVATION_MIN_OFFERED = 5;
const STARVATION_MAX_CHOSEN_RATE = 0.05;

export interface RecoveryTypeStats {
  recoveryType: RecoveryType;
  offeredCount: number;
  chosenCount: number;
  chosenRate: number;
  duplicateCount: number; // occurrences of this type appearing >1x in one round's own candidatesOffered -- should always be 0
  starved: boolean;
}

export function computeRecoveryTypeStats(rows: readonly CapabilityValidationRow[]): RecoveryTypeStats[] {
  return ALL_RECOVERY_TYPES.map((recoveryType) => {
    let offeredCount = 0;
    let chosenCount = 0;
    let duplicateCount = 0;
    for (const r of rows) {
      const occurrences = r.integrated.candidatesOffered.filter((t) => t === recoveryType).length;
      if (occurrences > 0) offeredCount++;
      if (occurrences > 1) duplicateCount++;
      if (r.integrated.chosenType === recoveryType) chosenCount++;
    }
    const chosenRate = offeredCount ? chosenCount / offeredCount : 0;
    return {
      recoveryType,
      offeredCount,
      chosenCount,
      chosenRate,
      duplicateCount,
      starved: offeredCount >= STARVATION_MIN_OFFERED && chosenRate < STARVATION_MAX_CHOSEN_RATE,
    };
  });
}

export interface FrameworkValidationResult {
  gateResults: GateResult[];
  pipelineResult: PipelineResult;
  recoveryTypeStats: RecoveryTypeStats[];
}

export function runValidationFramework(stats: StatisticalValidationResult, rows: readonly CapabilityValidationRow[]): FrameworkValidationResult {
  const recoveryTypeStats = computeRecoveryTypeStats(rows);
  const duplicateCount = recoveryTypeStats.reduce((s, r) => s + r.duplicateCount, 0);
  const starvedTypeCount = recoveryTypeStats.filter((r) => r.starved).length;

  const gateA = evaluateGateA(stats.trueRegressionDiff, stats.trueRegressionDiff); // no separate False Regression tracking this Sprint -- same disclosed precedent as parityGatedCycleProductionIntegrationV1/Statistics.ts's own runValidationFramework()
  const gateB = evaluateGateB(stats.runtimeDiffMs, Math.max(1, stats.baselineP95RuntimeMs));
  const gateC = evaluateGateC(stats.improvedCountDiff, true); // strict: requires isSignificantImprovement, not just non-regression
  const gateE = evaluateGateE({ duplicateCount, starvedTypeCount });

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C"); // New Primitive
  const pipelineResult = decideFromGates(spec, stats.n, gateResults, "production");

  return { gateResults, pipelineResult, recoveryTypeStats };
}
