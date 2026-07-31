// --- Statistics (Parity-Gated Cycle Production Integration Sprint v1,
// STEP6 part 1) --------------------------------------------------------------
// Same Validation Framework composition as every prior Sprint in this arc
// (parityGatedCyclePrototypeV1/parityGatedCycleIntegrationPlanningV1/
// ...RefinementV1's own StatisticalValidation.ts, unmodified precedent) --
// Category C(New Primitive), "production" stage this time (real solve()-
// adjacent attemptRecovery() replay, N=142 >= Category C's own
// minNByStage.production=30), default "strict" Gate B policy.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { ReplayPair } from "./Replay";

function toMetricEvaluation(diffs: number[]): MetricEvaluation {
  const stats: SampleStats = computeStats(diffs);
  const effectSize: EffectSizeResult = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize, majorityVoteRate: diffs.length ? diffs.filter((d) => d > 0).length / diffs.length : 0 };
}

export interface PairedComparison {
  n: number;
  improvedCountDiffEvaluation: MetricEvaluation;
  trueRegressionDiffEvaluation: MetricEvaluation;
  runtimeDiffMsEvaluation: MetricEvaluation;
  baselineP95RuntimeMs: number;
}

export function buildPairedComparison(pairs: readonly ReplayPair[]): PairedComparison {
  const n = pairs.length;
  const improvedDiffs = pairs.map((p) => (p.integrated.improved ? 1 : 0) - (p.baseline.improved ? 1 : 0));
  const regressionDiffs = pairs.map((p) => (p.integrated.trueRegression ? 1 : 0) - (p.baseline.trueRegression ? 1 : 0));
  const runtimeDiffs = pairs.map((p) => p.integrated.wallMs - p.baseline.wallMs);
  const sorted = [...pairs.map((p) => p.baseline.wallMs)].sort((a, b) => a - b);
  const baselineP95RuntimeMs = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] : 0;
  return {
    n,
    improvedCountDiffEvaluation: toMetricEvaluation(improvedDiffs),
    trueRegressionDiffEvaluation: toMetricEvaluation(regressionDiffs),
    runtimeDiffMsEvaluation: toMetricEvaluation(runtimeDiffs),
    baselineP95RuntimeMs,
  };
}

export interface FrameworkValidation {
  gateResults: GateResult[];
  pipelineResult: PipelineResult;
}

export function runValidationFramework(comparison: PairedComparison, duplicateCount: number, starvedTypeCount: number): FrameworkValidation {
  const gateA = evaluateGateA(comparison.trueRegressionDiffEvaluation, comparison.trueRegressionDiffEvaluation);
  const gateB = evaluateGateB(comparison.runtimeDiffMsEvaluation, Math.max(1, comparison.baselineP95RuntimeMs));
  const gateC = evaluateGateC(comparison.improvedCountDiffEvaluation, true);
  const gateE = evaluateGateE({ duplicateCount, starvedTypeCount }); // real Competition Analysis numbers, not a placeholder

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C");
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "production");
  return { gateResults, pipelineResult };
}
