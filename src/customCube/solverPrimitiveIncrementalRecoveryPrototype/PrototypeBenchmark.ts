// --- PrototypeBenchmark (Incremental Recovery Prototype Sprint v1) -------
// STEP4/STEP5. Per-snapshot Baseline (현재 ENDGAME Recovery -- the REAL,
// unmodified FiveByFiveEdgeSolverEngine.solve()) vs Candidate (Incremental
// Recovery Prototype -- IncrementalScheduler.runCandidateSolve, additive on
// top of the same real pipeline) comparison, aggregated into the metrics
// this Sprint's work order names: Coverage / Precision / Recall / Gap
// Rescue / Regression / Runtime / Deadline Miss (STEP4), plus REPAIR/CCR
// Primitive Interaction (STEP5).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { FiveByFiveEdgeSolverEngine, PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { runCandidateSolve, type IncrementalAttemptLogEntry } from "./IncrementalScheduler";

export interface PerSnapshotOutcome {
  hash: string;
  baselineSolved: boolean;
  baselineMs: number;
  baselineDeadlineMissed: boolean;
  candidateSolved: boolean;
  candidateMs: number;
  candidateDeadlineMissed: boolean;
  incrementalAttempts: IncrementalAttemptLogEntry[];
}

const DEADLINE_TOLERANCE_MS = 20; // small allowance -- matches this project's own established practice of not flagging deadline "misses" that are pure measurement jitter (e.g. RecoveryTimingDiagnostic.ts's own budget checks)

// STEP1-3 only need the Candidate arm (Trigger/Gate/Budget/Scheduler
// population stats don't depend on Baseline at all) -- avoids paying for
// a real engine.solve() Baseline call 335 times just to compute stats
// that never look at it.
export function runCandidateOnlyPass(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, lib: WingLibrary): PerSnapshotOutcome[] {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const candidate = runCandidateSolve(cubies, libs, lib);
    return {
      hash: s.hash,
      baselineSolved: false,
      baselineMs: 0,
      baselineDeadlineMissed: false,
      candidateSolved: candidate.solved,
      candidateMs: candidate.totalMs,
      candidateDeadlineMissed: candidate.deadlineMissed,
      incrementalAttempts: candidate.incrementalAttempts,
    };
  });
}

export function runOneComparisonPass(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, lib: WingLibrary): PerSnapshotOutcome[] {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);

    const baselineStart = Date.now();
    const engine = new FiveByFiveEdgeSolverEngine();
    const plan = engine.solve(cubies);
    const baselineMs = Date.now() - baselineStart;

    const candidate = runCandidateSolve(cubies, libs, lib);

    return {
      hash: s.hash,
      baselineSolved: plan.score === 0,
      baselineMs,
      baselineDeadlineMissed: baselineMs > PLAN_TIME_BUDGET_MS + DEADLINE_TOLERANCE_MS,
      candidateSolved: candidate.solved,
      candidateMs: candidate.totalMs,
      candidateDeadlineMissed: candidate.deadlineMissed,
      incrementalAttempts: candidate.incrementalAttempts,
    };
  });
}

export interface CapabilityMetrics {
  n: number;
  baselineSolvedCount: number;
  candidateSolvedCount: number;
  gapRescueCount: number; // !baselineSolved && candidateSolved -- Candidate fully solves what Baseline could not
  regressionCount: number; // baselineSolved && !candidateSolved -- Candidate performs WORSE than Baseline
  // PAIR-no-progress-attempt level (every entry in incrementalAttempts across all snapshots, matching STEP1 Blueprint's own population)
  totalPairNoProgressRecords: number;
  triggerFiredCount: number; // attempted -- coverage numerator
  triggerSucceededCount: number; // attempted AND succeeded
  coverage: number; // triggerFiredCount / totalPairNoProgressRecords -- should reproduce Blueprint's own featureBased coverage (1193/1421 = 84.0%)
  precision: number; // triggerSucceededCount / triggerFiredCount -- of attempts, how many succeeded
  recall: number; // triggerSucceededCount / totalPairNoProgressRecords -- of the WHOLE PAIR-no-progress opportunity space, how many were actually rescued
  gapRescueRate: number; // gapRescueCount / (n - baselineSolvedCount) -- of Baseline's own failures, fraction Candidate rescued
  avgBaselineMs: number;
  avgCandidateMs: number;
  baselineDeadlineMissRate: number;
  candidateDeadlineMissRate: number;
}

export function computeCapabilityMetrics(outcomes: readonly PerSnapshotOutcome[]): CapabilityMetrics {
  const n = outcomes.length;
  const baselineSolvedCount = outcomes.filter((o) => o.baselineSolved).length;
  const candidateSolvedCount = outcomes.filter((o) => o.candidateSolved).length;
  const gapRescueCount = outcomes.filter((o) => !o.baselineSolved && o.candidateSolved).length;
  const regressionCount = outcomes.filter((o) => o.baselineSolved && !o.candidateSolved).length;

  const allAttempts = outcomes.flatMap((o) => o.incrementalAttempts);
  const totalPairNoProgressRecords = allAttempts.length;
  const triggerFiredCount = allAttempts.filter((a) => a.attempt.attempted).length;
  const triggerSucceededCount = allAttempts.filter((a) => a.attempt.succeeded).length;

  const baselineFailedCount = n - baselineSolvedCount;

  return {
    n,
    baselineSolvedCount,
    candidateSolvedCount,
    gapRescueCount,
    regressionCount,
    totalPairNoProgressRecords,
    triggerFiredCount,
    triggerSucceededCount,
    coverage: totalPairNoProgressRecords ? triggerFiredCount / totalPairNoProgressRecords : 0,
    precision: triggerFiredCount ? triggerSucceededCount / triggerFiredCount : 0,
    recall: totalPairNoProgressRecords ? triggerSucceededCount / totalPairNoProgressRecords : 0,
    gapRescueRate: baselineFailedCount ? gapRescueCount / baselineFailedCount : 0,
    avgBaselineMs: n ? outcomes.reduce((a, o) => a + o.baselineMs, 0) / n : 0,
    avgCandidateMs: n ? outcomes.reduce((a, o) => a + o.candidateMs, 0) / n : 0,
    baselineDeadlineMissRate: n ? outcomes.filter((o) => o.baselineDeadlineMissed).length / n : 0,
    candidateDeadlineMissRate: n ? outcomes.filter((o) => o.candidateDeadlineMissed).length / n : 0,
  };
}

export interface PrimitiveInteraction {
  totalTriggered: number; // trigger.fires===true count (ccrEligible || repairEligible)
  overlap: number; // trigger.both===true -- both Gates eligible on the SAME state at once
  duplicate: number; // triedRepair AND triedCCR on the SAME attempt (only possible if overlap>0)
  exclusiveRepair: number; // repairEligible && !ccrEligible
  exclusiveCCR: number; // ccrEligible && !repairEligible
  conflict: number; // REPAIR attempted and failed, then CCR was ALSO eligible on the identical pre-attempt state (a would-be scheduling conflict) -- same condition as overlap here, reported separately per the work order's own STEP5 vocabulary
}

export function analyzePrimitiveInteraction(outcomes: readonly PerSnapshotOutcome[]): PrimitiveInteraction {
  const allAttempts = outcomes.flatMap((o) => o.incrementalAttempts).map((e) => e.attempt);
  const triggered = allAttempts.filter((a) => a.trigger.fires);
  return {
    totalTriggered: triggered.length,
    overlap: triggered.filter((a) => a.trigger.both).length,
    duplicate: triggered.filter((a) => a.triedRepair && a.triedCCR).length,
    exclusiveRepair: triggered.filter((a) => a.trigger.repairEligible && !a.trigger.ccrEligible).length,
    exclusiveCCR: triggered.filter((a) => a.trigger.ccrEligible && !a.trigger.repairEligible).length,
    conflict: triggered.filter((a) => a.trigger.both).length,
  };
}
