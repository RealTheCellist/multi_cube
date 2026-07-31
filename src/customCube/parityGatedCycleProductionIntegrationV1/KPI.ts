// --- KPI (Parity-Gated Cycle Production Integration Sprint v1, STEP4)
// -----------------------------------------------------------------------
// Computes the Directive's own required KPI set directly from Replay.ts's
// real attemptRecovery() traces (Baseline vs Integrated pairs) -- no
// estimation, every number is a real measured outcome.
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { ReplayPair } from "./Replay";

export const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE"];

export interface KpiSummary {
  n: number;
  baselineImprovedCount: number;
  integratedImprovedCount: number;
  baselineRegressionCount: number;
  integratedRegressionCount: number;
  netNewRescueCount: number; // integrated.improved AND NOT baseline.improved -- genuinely new capability from PARITY_GATED_CYCLE
  runtimeMeanMsBaseline: number;
  runtimeMeanMsIntegrated: number;
  runtimeP95MsBaseline: number;
  runtimeP95MsIntegrated: number;
  deadlineMissCountBaseline: number;
  deadlineMissCountIntegrated: number;
  parityGatedCycleOfferedCount: number;
  parityGatedCycleChosenCount: number;
  parityGatedCycleWinRate: number; // chosen / offered
  duplicateCount: number; // rounds where PARITY_GATED_CYCLE appears >1x in one round's own candidatesOffered (should always be 0)
  starved: boolean; // offered>=5 AND chosenRate<5% (same threshold as solverReleaseReadiness/PrimitiveInteractionMatrix.ts's own convention)
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

const STARVATION_MIN_OFFERED = 5;
const STARVATION_MAX_CHOSEN_RATE = 0.05;

export function summarizeKpi(pairs: readonly ReplayPair[]): KpiSummary {
  const n = pairs.length;
  const baseline = pairs.map((p) => p.baseline);
  const integrated = pairs.map((p) => p.integrated);

  const offeredRounds = integrated.filter((o) => o.candidatesOffered.includes("PARITY_GATED_CYCLE"));
  const chosenRounds = integrated.filter((o) => o.chosenType === "PARITY_GATED_CYCLE");
  const duplicateCount = integrated.filter((o) => o.candidatesOffered.filter((t) => t === "PARITY_GATED_CYCLE").length > 1).length;
  const chosenRate = offeredRounds.length ? chosenRounds.length / offeredRounds.length : 0;

  return {
    n,
    baselineImprovedCount: baseline.filter((o) => o.improved).length,
    integratedImprovedCount: integrated.filter((o) => o.improved).length,
    baselineRegressionCount: baseline.filter((o) => o.trueRegression).length,
    integratedRegressionCount: integrated.filter((o) => o.trueRegression).length,
    netNewRescueCount: pairs.filter((p) => p.integrated.improved && !p.baseline.improved).length,
    runtimeMeanMsBaseline: n ? baseline.reduce((s, o) => s + o.wallMs, 0) / n : 0,
    runtimeMeanMsIntegrated: n ? integrated.reduce((s, o) => s + o.wallMs, 0) / n : 0,
    runtimeP95MsBaseline: percentile(baseline.map((o) => o.wallMs), 0.95),
    runtimeP95MsIntegrated: percentile(integrated.map((o) => o.wallMs), 0.95),
    deadlineMissCountBaseline: baseline.filter((o) => o.deadlineMissed).length,
    deadlineMissCountIntegrated: integrated.filter((o) => o.deadlineMissed).length,
    parityGatedCycleOfferedCount: offeredRounds.length,
    parityGatedCycleChosenCount: chosenRounds.length,
    parityGatedCycleWinRate: chosenRate,
    duplicateCount,
    starved: offeredRounds.length >= STARVATION_MIN_OFFERED && chosenRate < STARVATION_MAX_CHOSEN_RATE,
  };
}
