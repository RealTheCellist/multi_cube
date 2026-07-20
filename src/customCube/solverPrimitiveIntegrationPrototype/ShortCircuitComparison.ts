// --- ShortCircuitComparison (Solver Primitive Integration Prototype
// Sprint v1) -- STEP3: A/B compares shortCircuitRepair=true vs false via
// the REAL runOutcome (executeTask(allowRecovery=true) end to end),
// measuring 성공률/Recovery 시간/Regression -- the open design question
// Integration Blueprint Sprint v1 explicitly deferred to this Sprint.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { runOutcome, RECOVERY_DEADLINE_MS, type RecoveryOutcomeRecord } from "./RecoveryBenchmark";

export interface ShortCircuitArm {
  label: "shortCircuit=true" | "shortCircuit=false";
  n: number;
  successCount: number;
  successRate: number;
  regressionCount: number;
  avgTimeMs: number;
  maxTimeMs: number;
  shortCircuitedCount: number;
  records: RecoveryOutcomeRecord[];
}

function summarize(label: ShortCircuitArm["label"], records: RecoveryOutcomeRecord[]): ShortCircuitArm {
  const n = records.length;
  return {
    label,
    n,
    successCount: records.filter((r) => r.succeeded).length,
    successRate: records.filter((r) => r.succeeded).length / n,
    regressionCount: records.filter((r) => r.regressed).length,
    avgTimeMs: records.reduce((a, r) => a + r.timeMs, 0) / n,
    maxTimeMs: Math.max(...records.map((r) => r.timeMs)),
    shortCircuitedCount: records.filter((r) => r.repairShortCircuited).length,
    records,
  };
}

export interface ShortCircuitComparisonResult {
  withShortCircuit: ShortCircuitArm;
  withoutShortCircuit: ShortCircuitArm;
  successRateDelta: number; // withShortCircuit - withoutShortCircuit
  avgTimeMsDelta: number; // withShortCircuit - withoutShortCircuit (negative = short-circuit is faster)
  regressionDelta: number;
}

/** Runs BOTH arms on the SAME snapshots (paired, same order) via the real
 * production executeTask -- shortCircuitRepair is the only thing that
 * differs between the two calls per snapshot. */
export function compareShortCircuit(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): ShortCircuitComparisonResult {
  const withSC = snapshots.map((s) => runOutcome(s, libs, RECOVERY_DEADLINE_MS, true, true));
  const withoutSC = snapshots.map((s) => runOutcome(s, libs, RECOVERY_DEADLINE_MS, true, false));

  const withShortCircuit = summarize("shortCircuit=true", withSC);
  const withoutShortCircuit = summarize("shortCircuit=false", withoutSC);

  return {
    withShortCircuit,
    withoutShortCircuit,
    successRateDelta: withShortCircuit.successRate - withoutShortCircuit.successRate,
    avgTimeMsDelta: withShortCircuit.avgTimeMs - withoutShortCircuit.avgTimeMs,
    regressionDelta: withShortCircuit.regressionCount - withoutShortCircuit.regressionCount,
  };
}
