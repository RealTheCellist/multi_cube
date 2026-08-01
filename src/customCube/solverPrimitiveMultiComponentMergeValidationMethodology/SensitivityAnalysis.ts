// --- SensitivityAnalysis (Multi-Component Merge Validation Methodology
// Qualification Sprint v1, STEP3) --------------------------------------------
// Real sweep on BOTH measurement axes to find where MCM's already-known
// effect (scrambleDepth30:2, scrambleDepth100:5) starts becoming
// observable. attemptRecovery_direct varies its own existing outer
// `deadline` argument (1000/1500/2000/60000ms). solve_e2e varies its own
// existing `recoveryReserveMsOverride` parameter (250ms real production
// default/450ms pre-Finalization/900ms -- no production file touched
// either way, both are pre-existing, exported parameters).
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { attemptRecoveryTimelineProbe, solveE2EProbe, type AttemptRecoveryProbeResult, type SolveE2EProbeResult } from "./SharedProbes";

export const ATTEMPT_RECOVERY_OUTER_SWEEP_MS = [1000, 1500, 2000, 60000] as const;
export const SOLVE_RECOVERY_RESERVE_SWEEP_MS = [250, 450, 900] as const;

export interface AttemptRecoverySweepRow {
  label: string;
  outerDeadlineMs: number;
  result: AttemptRecoveryProbeResult;
}

export interface SolveSweepRow {
  label: string;
  recoveryReserveMsOverride: number;
  result: SolveE2EProbeResult;
}

export interface SensitivityAnalysisResult {
  attemptRecoverySweep: AttemptRecoverySweepRow[];
  solveSweep: SolveSweepRow[];
  attemptRecoveryThresholdMs: Record<string, number | null>; // per-case: lowest outer deadline in the sweep where improved===true
  solveThresholdMs: Record<string, number | null>; // per-case: lowest recoveryReserveMsOverride in the sweep where improved===true
}

export function runSensitivityAnalysis(cases: readonly HoleCase[], libs: ExecutorLibraries): SensitivityAnalysisResult {
  const attemptRecoverySweep: AttemptRecoverySweepRow[] = [];
  const solveSweep: SolveSweepRow[] = [];

  for (const hole of cases) {
    for (const outerDeadlineMs of ATTEMPT_RECOVERY_OUTER_SWEEP_MS) {
      attemptRecoverySweep.push({ label: hole.label, outerDeadlineMs, result: attemptRecoveryTimelineProbe(hole, libs, outerDeadlineMs) });
    }
    for (const recoveryReserveMsOverride of SOLVE_RECOVERY_RESERVE_SWEEP_MS) {
      solveSweep.push({ label: hole.label, recoveryReserveMsOverride, result: solveE2EProbe(hole, recoveryReserveMsOverride) });
    }
  }

  const attemptRecoveryThresholdMs: Record<string, number | null> = {};
  const solveThresholdMs: Record<string, number | null> = {};
  for (const hole of cases) {
    const arRows = attemptRecoverySweep.filter((r) => r.label === hole.label).sort((a, b) => a.outerDeadlineMs - b.outerDeadlineMs);
    const arHit = arRows.find((r) => r.result.improved);
    attemptRecoveryThresholdMs[hole.label] = arHit?.outerDeadlineMs ?? null;

    const solveRows = solveSweep.filter((r) => r.label === hole.label).sort((a, b) => a.recoveryReserveMsOverride - b.recoveryReserveMsOverride);
    const solveHit = solveRows.find((r) => r.result.improved);
    solveThresholdMs[hole.label] = solveHit?.recoveryReserveMsOverride ?? null;
  }

  return { attemptRecoverySweep, solveSweep, attemptRecoveryThresholdMs, solveThresholdMs };
}
