// --- StatisticalValidation (Parity-Gated Cycle Production Integration
// Planning Sprint v1, STEP6 part 2) -------------------------------------------
// Same Validation Framework composition as every prior Sprint in this arc
// (bridgeInjectionRefinementV1/deepCycleRefinementV1/
// parityGatedCyclePrototypeV1's own StatisticalValidation.ts, unmodified
// precedent) -- Category C(New Primitive), "prototype" stage, default
// "strict" Gate B policy. Population-as-N paired-diff (Baseline vs
// Integrated Simulation), since neither arm has internal randomness
// (generateRecoveryStrategies/tryCrossComponentBridgeCycleResolver, both
// confirmed deterministic in prior Sprints).
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { SimulationOutcome } from "./IntegrationSimulation";
import type { CompetitionTypeStats } from "./CompetitionAnalysis";

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

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export function buildPairedComparison(baseline: readonly SimulationOutcome[], integrated: readonly SimulationOutcome[]): PairedComparison {
  const n = baseline.length;
  const improvedDiffs = baseline.map((b, i) => (integrated[i].improved ? 1 : 0) - (b.improved ? 1 : 0));
  const regressionDiffs = baseline.map((b, i) => (integrated[i].trueRegression ? 1 : 0) - (b.trueRegression ? 1 : 0));
  const runtimeDiffs = baseline.map((b, i) => integrated[i].wallMs - b.wallMs);
  const baselineP95RuntimeMs = percentile(baseline.map((o) => o.wallMs), 0.95);
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

export function runValidationFramework(comparison: PairedComparison, competitionStats: readonly CompetitionTypeStats[]): FrameworkValidation {
  const duplicateCount = competitionStats.reduce((s, c) => s + c.duplicateCount, 0);
  const starvedTypeCount = competitionStats.filter((c) => c.starved).length;

  const gateA = evaluateGateA(comparison.trueRegressionDiffEvaluation, comparison.trueRegressionDiffEvaluation);
  const gateB = evaluateGateB(comparison.runtimeDiffMsEvaluation, Math.max(1, comparison.baselineP95RuntimeMs));
  const gateC = evaluateGateC(comparison.improvedCountDiffEvaluation, true);
  const gateE = evaluateGateE({ duplicateCount, starvedTypeCount }); // real Competition Analysis numbers this time, not a placeholder

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C");
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "prototype");
  return { gateResults, pipelineResult };
}
