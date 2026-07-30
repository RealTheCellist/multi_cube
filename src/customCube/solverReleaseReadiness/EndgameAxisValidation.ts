// --- EndgameAxisValidation (Solver Release Readiness Validation Sprint
// v1, STEP2/3/5) ---------------------------------------------------------
// Baseline(450ms, pre-Finalization)-vs-Integrated(250ms, real production)
// A/B on the ENDGAME Budget Contract axis, adapted from
// productionIntegrationFinalization/StatisticalValidation.ts's own
// runOneTrial/summarizeTrial pattern but over THIS arc's own 142-case Hole
// Dataset (coverageAtlas/HoleDatasetBuilder) instead of the older
// failureAnalysis/ 335-snapshot population -- for population consistency
// with every other measurement in this final Sprint's report.
// auditRegressions is reused UNMODIFIED from productionIntegrationFinalization/
// RegressionAudit.ts (generic over EndToEndSolveResult[] pairs, no
// dataset-specific typing, nothing to duplicate).
import { cloneCubies } from "../cubeState";
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import { endToEndSolveProbe, PRE_FINALIZATION_RECOVERY_RESERVE_MS, type EndToEndSolveResult } from "./EndToEndSolveProbe";
import { auditRegressions } from "../productionIntegrationFinalization/RegressionAudit";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface EndgameTrialAggregate {
  n: number;
  baselineImprovedCount: number;
  integratedImprovedCount: number;
  baselineSolvedCount: number;
  integratedSolvedCount: number;
  baselineAvgWallMs: number;
  integratedAvgWallMs: number;
  baselineDeadlineMissRate: number;
  integratedDeadlineMissRate: number;
  trueRegressionCount: number;
}

export function runOneEndgameTrial(cases: readonly HoleCase[]): { baseline: EndToEndSolveResult[]; integrated: EndToEndSolveResult[] } {
  const baseline = cases.map((c) => endToEndSolveProbe(cloneCubies(c.cubies), c.label, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
  const integrated = cases.map((c) => endToEndSolveProbe(cloneCubies(c.cubies), c.label, undefined));
  return { baseline, integrated };
}

export function summarizeEndgameTrial(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): EndgameTrialAggregate {
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
    trueRegressionCount: audit.trueRegressionCount,
  };
}

export interface MetricEvaluation {
  stats: SampleStats;
  effectSize: EffectSizeResult;
  majorityVoteRate: number; // fraction of trials where the diff was >= 0 (improvement direction or flat)
}

export interface EndgameAxisEvaluation {
  nTrials: number;
  improvedCountDiff: MetricEvaluation;
  solvedCountDiff: MetricEvaluation;
  runtimeDiffMs: MetricEvaluation;
  deadlineMissDiffPp: MetricEvaluation;
  trueRegressionCounts: number[]; // per-trial, for direct reporting (not diffed -- there is no "baseline true regression" concept, only integrated-vs-baseline per trial)
}

function evaluate(diffs: number[]): MetricEvaluation {
  const stats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  const majorityVoteRate = diffs.length ? diffs.filter((d) => d >= 0).length / diffs.length : 0;
  return { stats, effectSize, majorityVoteRate };
}

export function evaluateEndgameAxis(trials: readonly EndgameTrialAggregate[]): EndgameAxisEvaluation {
  return {
    nTrials: trials.length,
    improvedCountDiff: evaluate(trials.map((t) => t.integratedImprovedCount - t.baselineImprovedCount)),
    solvedCountDiff: evaluate(trials.map((t) => t.integratedSolvedCount - t.baselineSolvedCount)),
    runtimeDiffMs: evaluate(trials.map((t) => t.integratedAvgWallMs - t.baselineAvgWallMs)),
    deadlineMissDiffPp: evaluate(trials.map((t) => (t.integratedDeadlineMissRate - t.baselineDeadlineMissRate) * 100)),
    trueRegressionCounts: trials.map((t) => t.trueRegressionCount),
  };
}
