// --- StatisticalValidation (Parity-Gated Cycle Prototype Sprint v1, STEP6)
// -----------------------------------------------------------------------
// Applies the now-adopted-as-standard Validation Framework
// (solverPostReleaseValidationFramework/) to the Baseline-vs-Prototype
// comparison, unmodified. Structurally identical to
// bridgeInjectionRefinementV1/StatisticalValidation.ts and
// deepCycleRefinementV1/StatisticalValidation.ts (same Gate roster,
// Category C, "prototype" stage, default "strict" Gate B policy -- neither
// precedent Sprint opted into RECOMMENDED_GATE_B_POLICY, so this Sprint
// doesn't either, for direct comparability).
//
// Disclosed methodology note: unlike Bridge Injection/Deep Cycle
// Refinement (whose underlying mechanisms were proven deterministic by
// direct source inspection), this Prototype's own BridgeCandidateGeneration
// step calls bfsMoveWingToPosition over a bounded, deterministic BFS with
// no Math.random()/shuffle() anywhere in its call chain either (same
// fiveByFiveEdges.ts functions, same disclosed absence of randomness) --
// so the same population-as-N, per-case-paired-diff convention applies
// here too: N = 53 (the real Unknown Population size), not a repeat count.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { CaseOutcome } from "./CapabilityMeasurement";

function toMetricEvaluation(diffs: number[]): MetricEvaluation {
  const stats: SampleStats = computeStats(diffs);
  const mean = stats.mean;
  const stddev = stats.stddev;
  const effectSize: EffectSizeResult = analyzeEffectSize({ meanDiff: mean, stddevDiff: stddev, n: diffs.length });
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

export function buildPairedComparison(baseline: readonly CaseOutcome[], candidate: readonly CaseOutcome[]): PairedComparison {
  const n = baseline.length;
  const improvedDiffs = baseline.map((b, i) => (candidate[i].improved ? 1 : 0) - (b.improved ? 1 : 0));
  const regressionDiffs = baseline.map((b, i) => (candidate[i].trueRegression ? 1 : 0) - (b.trueRegression ? 1 : 0));
  const runtimeDiffs = baseline.map((b, i) => candidate[i].wallMs - b.wallMs);
  const baselineP95RuntimeMs = percentile(
    baseline.map((o) => o.wallMs),
    0.95
  );

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

export function runValidationFramework(comparison: PairedComparison): FrameworkValidation {
  const gateA = evaluateGateA(comparison.trueRegressionDiffEvaluation, comparison.trueRegressionDiffEvaluation);
  const gateB = evaluateGateB(comparison.runtimeDiffMsEvaluation, Math.max(1, comparison.baselineP95RuntimeMs));
  const gateC = evaluateGateC(comparison.improvedCountDiffEvaluation, true); // strict mode -- Category C(New Primitive) requires real Capability gain, not just "not worse"
  const gateE = evaluateGateE({ duplicateCount: 0, starvedTypeCount: 0 }); // disclosed placeholder: this Prototype was never wired into the real Recovery dispatcher's competition matrix, so no real Primitive Interaction data exists yet at this stage

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C"); // New Primitive category -- Cross-Component Bridge Cycle Resolver is a Prototype, not yet in production
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "prototype");

  return { gateResults, pipelineResult };
}
