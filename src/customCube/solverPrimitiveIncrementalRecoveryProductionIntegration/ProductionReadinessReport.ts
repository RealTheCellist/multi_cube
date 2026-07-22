// --- ProductionReadinessReport (Incremental Recovery Production
// Integration Sprint v1, STEP6) ----------------------------------------------
// Synthesizes STEP1-5's real measurements into this Sprint's own Level1-3
// judgment, Decision A/B/C, and a quantified comparison against Architecture
// Prototype Refinement Sprint v1's own Prototype-level predictions.
import type { RegressionClassification } from "./RegressionAnalysis";
import type { StandardEvaluationResult } from "./StandardEvaluation";
import type { TrialAggregate } from "./EndToEndBenchmark";

// Architecture Prototype Refinement Sprint v1's own confirmed figures, cited
// verbatim from that Sprint's report -- measured at the isolated
// bfsMoveWingToPosition-call layer (n=3801 real cases), NOT at this Sprint's
// own whole-solve() layer. Comparing the two honestly requires disclosing
// this is a DIFFERENT measurement layer, not a strict apples-to-apples
// replication.
export const PROTOTYPE_SUCCESS_RATE_AT_140MS = 0.7903; // vs 0.6283 at 40ms, 0.8056 ceiling
export const PROTOTYPE_CAPABILITY_RECOVERY_PCT = 91.4;
export const PROTOTYPE_TRUE_REGRESSION_RATE = 0.0153;

export interface ProductionReadinessResult {
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
  prototypeVsProductionError: {
    productionTrueRegressionRate: number;
    prototypeTrueRegressionRate: number;
    absoluteErrorPp: number;
    note: string;
  };
}

export function analyzeProductionReadiness(
  trials: readonly TrialAggregate[],
  regressionPerTrial: readonly RegressionClassification[],
  evaluation: StandardEvaluationResult
): ProductionReadinessResult {
  const nTrials = trials.length;
  const level1Pass = nTrials > 0 && trials.every((t) => t.n > 0);
  const level1Detail = `${nTrials} independent end-to-end trials completed, each running the real, unmodified FiveByFiveEdgeSolverEngine.solve() (Candidate) against a byte-identical mirror with pairBudgetMs=undefined (Baseline) across the same ${trials[0]?.n ?? 0}-snapshot subsample.`;

  const avgBaselineDeadlineMissRate = trials.reduce((a, t) => a + t.baselineDeadlineMissRate, 0) / nTrials;
  const avgCandidateDeadlineMissRate = trials.reduce((a, t) => a + t.candidateDeadlineMissRate, 0) / nTrials;
  const budgetComplianceRate = 1 - avgCandidateDeadlineMissRate;
  const avgTrueRegressionRate = regressionPerTrial.reduce((a, r) => a + r.trueRegressionRate, 0) / regressionPerTrial.length;
  const avgIncrementalOnlyRate = regressionPerTrial.reduce((a, r) => a + r.incrementalRecoveryOnlySuccessRate, 0) / regressionPerTrial.length;

  const level2Pass = budgetComplianceRate >= 0.99;
  const level2Detail = `Deadline Miss rate: baseline ${(avgBaselineDeadlineMissRate * 100).toFixed(2)}% -> candidate ${(avgCandidateDeadlineMissRate * 100).toFixed(2)}% (avg over ${nTrials} trials). Budget Compliance ${(budgetComplianceRate * 100).toFixed(2)}% vs the >=99% target (Architecture Prototype Refinement Sprint v1's own 99.29% at the bfsMoveWingToPosition layer).`;

  const level3Pass = evaluation.primary.stats.ciLower >= 0 && avgTrueRegressionRate <= avgIncrementalOnlyRate;
  const level3Detail = `Primary metric (whole-cube-improved count diff, candidate-baseline): mean=${evaluation.primary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.primary.stats.ciLower.toFixed(3)}, ${evaluation.primary.stats.ciUpper.toFixed(3)}]. True Regression rate ${(avgTrueRegressionRate * 100).toFixed(2)}% vs Incremental-Recovery-Only Success rate ${(avgIncrementalOnlyRate * 100).toFixed(2)}% (avg over ${nTrials} trials) -- ${avgTrueRegressionRate <= avgIncrementalOnlyRate ? "gains outweigh losses" : "losses outweigh gains"}.`;

  const productionTrueRegressionRate = avgTrueRegressionRate;
  const absoluteErrorPp = Math.abs(productionTrueRegressionRate - PROTOTYPE_TRUE_REGRESSION_RATE) * 100;

  let decision: "A" | "B" | "C";
  let decisionRationale: string;
  if (level1Pass && level2Pass && level3Pass) {
    decision = "A";
    decisionRationale = "All 3 Levels PASS -- real Production Integration reproduces the Prototype's own Budget Compliance and net-positive capability effect. Proceed to Production Validation Sprint v1 for real-operational-scale confirmation.";
  } else if (level1Pass && level2Pass && !level3Pass) {
    decision = "B";
    decisionRationale = "Integration succeeded and Budget Compliance holds, but the real whole-solve capability effect differs from the Prototype's own prediction (see prototypeVsProductionError) -- likely because whole-solve outcomes depend on interactions (task ordering, Recovery-layer triggering, shuffle()-driven candidate order) the isolated bfsMoveWingToPosition-level Prototype measurement couldn't capture. Needs an Integration Refinement pass tuned against real solve()-level data.";
  } else {
    decision = "C";
    decisionRationale = "Production integration does not reproduce the Prototype's predicted behavior at the Budget Compliance level itself -- the Blueprint this Contract was built on needs re-examination against real solve()-level dynamics.";
  }

  return {
    level1Pass,
    level1Detail,
    level2Pass,
    level2Detail,
    level3Pass,
    level3Detail,
    decision,
    decisionRationale,
    prototypeVsProductionError: {
      productionTrueRegressionRate,
      prototypeTrueRegressionRate: PROTOTYPE_TRUE_REGRESSION_RATE,
      absoluteErrorPp,
      note: "Prototype's 1.53% True Regression rate was measured at the isolated bfsMoveWingToPosition-call layer (n=3801); Production's rate here is measured at the whole-solve() layer (candidate strictly worse than baseline's final wrongWingCount) -- different measurement granularities, disclosed rather than treated as a strict replication.",
    },
  };
}
