// --- SensitivityAnalysis (PARITY_GATED_CYCLE Validation Protocol
// Qualification Sprint v1, STEP3) -----------------------------------------
// Real sweep on BOTH measurement axes for the 3 real known-effect cases
// this Sprint discovered (worstCase:5e5b20b, snapshot335:60b5c3b1,
// snapshot335:ad12c377 -- found via a full 49-case Gate-passing scan at
// outer=2000ms). Mirrors MCM Validation Methodology Qualification Sprint
// v1's own SensitivityAnalysis.ts exactly.
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import { parityRecoveryTimelineProbe, solveE2EProbe, type AttemptRecoveryProbeResult, type SolveE2EProbeResult } from "./SharedProbes";

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
  attemptRecoveryThresholdMs: Record<string, number | null>;
  solveThresholdMs: Record<string, number | null>;
}

export function runSensitivityAnalysis(cases: readonly HoleCase[], libs: ExecutorLibraries): SensitivityAnalysisResult {
  const attemptRecoverySweep: AttemptRecoverySweepRow[] = [];
  const solveSweep: SolveSweepRow[] = [];

  for (const hole of cases) {
    for (const outerDeadlineMs of ATTEMPT_RECOVERY_OUTER_SWEEP_MS) {
      attemptRecoverySweep.push({ label: hole.label, outerDeadlineMs, result: parityRecoveryTimelineProbe(hole, libs, outerDeadlineMs) });
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
