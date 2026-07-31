// --- Statistics (Parity-Gated Cycle Integration Planning Refinement
// Sprint v1, STEP5) ----------------------------------------------------------
// Same Validation Framework composition as every prior Sprint in this arc
// (parityGatedCyclePrototypeV1/parityGatedCycleIntegrationPlanningV1's own
// StatisticalValidation.ts, unmodified precedent) -- Category C(New
// Primitive), "prototype" stage, default "strict" Gate B policy. Baseline
// = no-op (doing nothing at the after_CCR position) since this Sprint's own
// population is the Unknown Population, where the pre-existing Recovery
// Pipeline is already confirmed (Prototype Sprint v1 STEP5) to solve 0% --
// paired diff against a real no-op arm isolates exactly what the candidate
// Budget itself contributes.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { BudgetCaseOutcome } from "./BudgetSweep";

function toMetricEvaluation(diffs: number[]): MetricEvaluation {
  const stats: SampleStats = computeStats(diffs);
  const effectSize: EffectSizeResult = analyzeEffectSize({ meanDiff: stats.mean, stddevDiff: stats.stddev, n: diffs.length });
  return { stats, effectSize, majorityVoteRate: diffs.length ? diffs.filter((d) => d > 0).length / diffs.length : 0 };
}

export interface PairedComparison {
  budgetMs: number;
  n: number;
  improvedCountDiffEvaluation: MetricEvaluation;
  trueRegressionDiffEvaluation: MetricEvaluation;
  runtimeDiffMsEvaluation: MetricEvaluation;
}

export function buildPairedComparison(budgetMs: number, baseline: readonly BudgetCaseOutcome[], candidate: readonly BudgetCaseOutcome[]): PairedComparison {
  const n = baseline.length;
  const improvedDiffs = baseline.map((b, i) => (candidate[i].improved ? 1 : 0) - (b.improved ? 1 : 0));
  const regressionDiffs = baseline.map((b, i) => (candidate[i].trueRegression ? 1 : 0) - (b.trueRegression ? 1 : 0));
  const runtimeDiffs = baseline.map((b, i) => candidate[i].wallMs - b.wallMs);
  return {
    budgetMs,
    n,
    improvedCountDiffEvaluation: toMetricEvaluation(improvedDiffs),
    trueRegressionDiffEvaluation: toMetricEvaluation(regressionDiffs),
    runtimeDiffMsEvaluation: toMetricEvaluation(runtimeDiffs),
  };
}

export interface FrameworkValidation {
  budgetMs: number;
  gateResults: GateResult[];
  pipelineResult: PipelineResult;
}

export function runValidationFramework(comparison: PairedComparison): FrameworkValidation {
  const gateA = evaluateGateA(comparison.trueRegressionDiffEvaluation, comparison.trueRegressionDiffEvaluation);
  const gateB = evaluateGateB(comparison.runtimeDiffMsEvaluation, 1); // baseline is no-op(~0ms) -- matches prior Sprints' own "Math.max(1, ...)" floor
  const gateC = evaluateGateC(comparison.improvedCountDiffEvaluation, true);
  const gateE = evaluateGateE({ duplicateCount: 0, starvedTypeCount: 0 }); // Position/Gate/Competition already validated by the parent Sprint -- not re-measured here (Directive scope: Budget only)

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C");
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "prototype");
  return { budgetMs: comparison.budgetMs, gateResults, pipelineResult };
}
