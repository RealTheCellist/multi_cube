// --- RegressionReconfirmation (Solver Completeness Verification Sprint v1,
// Goal D) --------------------------------------------------------------------
// Goal D ("Regression이 기존 Release Contract를 유지함을 확인한다") is a
// STATISTICAL re-confirmation, not an exhaustive census -- reuses the
// EXACT Standard Evaluation Protocol (paired N=30-trial, 95% CI, Cohen's
// d_z) already established and read-only-reused across this entire
// research arc, via productionIntegrationFinalization/'s own
// EndToEndSolveProbe/RegressionAudit/StatisticalValidation machinery.
// Wing-pairing-only (not the full 4-phase pipeline) -- the three Operating
// Contracts (ENDGAME/Incremental Recovery/CCR) all live exclusively in that
// subsystem, so this is the correct, cheaper scope for a Contract-regression
// check, same as every prior Sprint's own regression work.
import { cloneCubies, type Cubie } from "../cubeState";
import {
  endToEndSolveProbe,
  ensureWarm,
  PRE_FINALIZATION_RECOVERY_RESERVE_MS,
  type EndToEndSolveResult,
} from "../productionIntegrationFinalization/EndToEndSolveProbe";
import { auditRegressions, type RegressionAuditSummary } from "../productionIntegrationFinalization/RegressionAudit";
import { summarizeTrial, runStandardEvaluation, type TrialAggregate, type StandardEvaluationResult } from "../productionIntegrationFinalization/StatisticalValidation";

export { PRE_FINALIZATION_RECOVERY_RESERVE_MS, ensureWarm };
export type { StandardEvaluationResult, TrialAggregate, RegressionAuditSummary };

export interface RegressionCase {
  label: string;
  cubies: Cubie[];
}

/** One paired trial (Baseline 450ms vs Integrated 250ms) over the given cases. */
export function runOneTrialOnCases(cases: readonly RegressionCase[]): { baseline: EndToEndSolveResult[]; integrated: EndToEndSolveResult[] } {
  const baseline = cases.map((c) => endToEndSolveProbe(cloneCubies(c.cubies), c.label, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
  const integrated = cases.map((c) => endToEndSolveProbe(cloneCubies(c.cubies), c.label, undefined));
  return { baseline, integrated };
}

export interface RegressionReconfirmationResult {
  nTrials: number;
  nCases: number;
  fullCensusAudit: RegressionAuditSummary; // single-pass full census over `cases`, disclosed complementary (not gating) per this arc's own established single-pass-vs-averaged distinction
  evaluation: StandardEvaluationResult;
  avgTrueRegressionRateAcrossTrials: number;
  withinAllowance: boolean; // avgTrueRegressionRateAcrossTrials <= 0.05, matching the established Release Contract's own gate
}

const REGRESSION_ALLOWANCE = 0.05;

export function runRegressionReconfirmation(cases: readonly RegressionCase[], nTrials: number): RegressionReconfirmationResult {
  ensureWarm();
  const { baseline: fullBaseline, integrated: fullIntegrated } = runOneTrialOnCases(cases);
  const fullCensusAudit = auditRegressions(fullBaseline, fullIntegrated);

  const trials: TrialAggregate[] = [];
  for (let t = 0; t < nTrials; t++) {
    const { baseline, integrated } = runOneTrialOnCases(cases);
    trials.push(summarizeTrial(baseline, integrated));
  }
  const evaluation = runStandardEvaluation(trials);
  const avgTrueRegressionRateAcrossTrials = trials.reduce((a, t) => a + t.trueRegressionRate, 0) / trials.length;

  return {
    nTrials,
    nCases: cases.length,
    fullCensusAudit,
    evaluation,
    avgTrueRegressionRateAcrossTrials,
    withinAllowance: avgTrueRegressionRateAcrossTrials <= REGRESSION_ALLOWANCE,
  };
}
