// --- RecoveryTimingDiagnostic (CCR Production Integration Sprint v1) ------
// STEP6's own self-correction, made permanent and reproducible (not a
// throwaway script): the main driver's STEP1 real end-to-end pass showed
// CCR called 0/335 times, sharply contradicting STEP3's isolated
// Recovery-level comparison (CCR Gate eligible 51.6%, 82 CCR-only
// successes). This module directly verifies WHY, using the real,
// unmodified FiveByFiveEdgeSolverEngine.solve() and its own real trace
// timestamps -- no reconstruction, no assumption.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { FiveByFiveEdgeSolverEngine } from "../fiveByFiveEdgeSolverEngine";

export interface TimingDiagnosticRecord {
  hash: string;
  totalMs: number;
  recoveryTriggered: boolean;
  candidatesGenerated: boolean; // generateRecoveryStrategies produced at least 1 candidate (any type)
  planTasksAtMs: number | null; // ms from solve() start when Planner finished
  recoveryTriggeredAtMs: number | null; // ms from solve() start when Recovery was entered
  recoveryResolvedAtMs: number | null; // ms from solve() start when Recovery finished (candidates or no-candidates)
}

export function runTimingDiagnostic(snapshots: readonly FailureSnapshot[]): TimingDiagnosticRecord[] {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const engine = new FiveByFiveEdgeSolverEngine();
    const start = Date.now();
    engine.solve(cubies);
    const totalMs = Date.now() - start;
    const trace = engine.getTrace();

    const planTasksEntry = trace.find((t) => t.label === "plan-tasks");
    const recoveryTriggeredEntry = trace.find((t) => t.label === "recovery-triggered");
    const candidatesEntry = trace.find((t) => t.label === "recovery-candidates");
    const noCandidatesEntry = trace.find((t) => t.label === "recovery-no-candidates");

    return {
      hash: s.hash,
      totalMs,
      recoveryTriggered: !!recoveryTriggeredEntry,
      candidatesGenerated: !!candidatesEntry,
      planTasksAtMs: planTasksEntry ? planTasksEntry.at - start : null,
      recoveryTriggeredAtMs: recoveryTriggeredEntry ? recoveryTriggeredEntry.at - start : null,
      recoveryResolvedAtMs: (candidatesEntry ?? noCandidatesEntry) ? (candidatesEntry ?? noCandidatesEntry)!.at - start : null,
    };
  });
}

export interface TimingDiagnosticSummary {
  n: number;
  recoveryTriggeredCount: number;
  candidatesGeneratedCount: number; // among recoveryTriggered
  avgRecoveryTriggeredAtMs: number; // among recoveryTriggered
  avgRemainingAtTriggerMs: number; // PLAN_TIME_BUDGET_MS - avgRecoveryTriggeredAtMs, the real time left when Recovery starts
}

const PLAN_TIME_BUDGET_MS = 1000;

export function summarizeTimingDiagnostic(records: readonly TimingDiagnosticRecord[]): TimingDiagnosticSummary {
  const triggered = records.filter((r) => r.recoveryTriggered && r.recoveryTriggeredAtMs !== null);
  const n = records.length;
  const avgRecoveryTriggeredAtMs = triggered.length ? triggered.reduce((a, r) => a + (r.recoveryTriggeredAtMs ?? 0), 0) / triggered.length : 0;
  return {
    n,
    recoveryTriggeredCount: triggered.length,
    candidatesGeneratedCount: triggered.filter((r) => r.candidatesGenerated).length,
    avgRecoveryTriggeredAtMs,
    avgRemainingAtTriggerMs: PLAN_TIME_BUDGET_MS - avgRecoveryTriggeredAtMs,
  };
}
