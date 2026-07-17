// --- FailureStatistics (Failure Analysis Engine v1) -------------------------
import type { FailureSnapshot, FailureStatisticsReport, PrimitiveName } from "./failureTypes";

const PRIMITIVES: PrimitiveName[] = ["BASE", "FLIP", "PARITY", "ENDGAME", "RECOVERY"];

export function computeStatistics(snapshots: readonly FailureSnapshot[]): FailureStatisticsReport {
  const total = snapshots.length;
  const wrongWingDistribution: Record<number, number> = {};
  let parityCount = 0;
  let recoveryAttempted = 0;
  let recoveryFailed = 0;
  const primitiveUsageFrequency: Record<PrimitiveName, number> = { BASE: 0, FLIP: 0, PARITY: 0, ENDGAME: 0, RECOVERY: 0 };
  let traceLengthSum = 0;
  let recoveryAttemptSum = 0;

  for (const s of snapshots) {
    wrongWingDistribution[s.wrongWingCount] = (wrongWingDistribution[s.wrongWingCount] ?? 0) + 1;
    if (s.parity) parityCount++;
    if (s.recoveryAttempted) {
      recoveryAttempted++;
      if (!s.recoverySucceeded) recoveryFailed++;
    }
    for (const attempt of s.primitiveAttempts) primitiveUsageFrequency[attempt.primitive]++;
    traceLengthSum += s.trace.length;
    recoveryAttemptSum += s.primitiveAttempts.filter((a) => a.primitive === "RECOVERY").length;
  }

  return {
    totalFailures: total,
    wrongWingDistribution,
    parityRate: total ? Math.round((parityCount / total) * 1000) / 10 : 0,
    recoveryFailureRate: recoveryAttempted ? Math.round((recoveryFailed / recoveryAttempted) * 1000) / 10 : 0,
    primitiveUsageFrequency,
    averageTraceLength: total ? Math.round((traceLengthSum / total) * 10) / 10 : 0,
    averageRecoveryAttempts: total ? Math.round((recoveryAttemptSum / total) * 100) / 100 : 0,
  };
}
