// --- StatisticalValidation (Production Integration Finalization Sprint
// v1, STEP6) ----------------------------------------------------------------
// Standard Evaluation Protocol (paired-diff 95% CI + Cohen's d_z), reused
// read-only across this whole research arc, applied here across N=30
// trials over a 75-snapshot subsample -- Baseline (450ms, reconstructed)
// vs Integrated (250ms, the real new production default).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { endToEndSolveProbe, PRE_FINALIZATION_RECOVERY_RESERVE_MS, type EndToEndSolveResult } from "./EndToEndSolveProbe";
import { auditRegressions } from "./RegressionAudit";

export interface TrialAggregate {
  n: number;
  baselineImprovedCount: number;
  integratedImprovedCount: number;
  baselineSolvedCount: number;
  integratedSolvedCount: number;
  baselineAvgWallMs: number;
  integratedAvgWallMs: number;
  baselineDeadlineMissRate: number;
  integratedDeadlineMissRate: number;
  baselineRecoveryTriggerRate: number;
  integratedRecoveryTriggerRate: number;
  trueRegressionRate: number;
}

export function runOneTrial(snapshots: readonly FailureSnapshot[]): { baseline: EndToEndSolveResult[]; integrated: EndToEndSolveResult[] } {
  const baseline = snapshots.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
  const integrated = snapshots.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, undefined));
  return { baseline, integrated };
}

export function summarizeTrial(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): TrialAggregate {
  const n = baseline.length;
  const avg = (rs: readonly EndToEndSolveResult[], f: (r: EndToEndSolveResult) => number) => (n ? rs.reduce((a, r) => a + f(r), 0) / n : 0);
  const audit = auditRegressions(baseline, integrated);
  return {
    n,
    baselineImprovedCount: baseline.filter((r) => r.improved).length,
    integratedImprovedCount: integrated.filter((r) => r.improved).length,
    baselineSolvedCount: baseline.filter((r) => r.solved).length,
    integratedSolvedCount: integrated.filter((r) => r.solved).length,
    baselineAvgWallMs: avg(baseline, (r) => r.wallMs),
    integratedAvgWallMs: avg(integrated, (r) => r.wallMs),
    baselineDeadlineMissRate: avg(baseline, (r) => (r.deadlineMissed ? 1 : 0)),
    integratedDeadlineMissRate: avg(integrated, (r) => (r.deadlineMissed ? 1 : 0)),
    baselineRecoveryTriggerRate: avg(baseline, (r) => (r.recoveryTriggered ? 1 : 0)),
    integratedRecoveryTriggerRate: avg(integrated, (r) => (r.recoveryTriggered ? 1 : 0)),
    trueRegressionRate: audit.trueRegressionRate,
  };
}

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
}

export interface StandardEvaluationResult {
  nTrials: number;
  primary: MetricEvaluation; // improved count diff (Integrated - Baseline)
  secondary: MetricEvaluation; // solved count diff
  runtime: MetricEvaluation; // avg wall ms diff
  deadlineMiss: MetricEvaluation; // deadline miss rate diff, pp
  recoveryTrigger: MetricEvaluation; // recovery trigger rate diff, pp
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize };
}

export function runStandardEvaluation(trials: readonly TrialAggregate[]): StandardEvaluationResult {
  return {
    nTrials: trials.length,
    primary: evaluate(trials.map((t) => t.integratedImprovedCount - t.baselineImprovedCount)),
    secondary: evaluate(trials.map((t) => t.integratedSolvedCount - t.baselineSolvedCount)),
    runtime: evaluate(trials.map((t) => t.integratedAvgWallMs - t.baselineAvgWallMs)),
    deadlineMiss: evaluate(trials.map((t) => (t.integratedDeadlineMissRate - t.baselineDeadlineMissRate) * 100)),
    recoveryTrigger: evaluate(trials.map((t) => (t.integratedRecoveryTriggerRate - t.baselineRecoveryTriggerRate) * 100)),
  };
}
