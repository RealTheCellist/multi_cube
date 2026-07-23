// --- FinalOperatingContract (ENDGAME Optimization Prototype Refinement
// Sprint v1, STEP6) ----------------------------------------------------------
// Synthesizes STEP1-5 into the final recoveryReserveMsOverride selection,
// this Sprint's own Level1-3 judgment, and Decision A/B/C.
import type { BudgetTrialAggregate } from "./BudgetSweep";
import type { BudgetEvaluation } from "./StatisticalValidation";
import type { ParetoResult } from "./ParetoFrontier";
import type { SensitivityPair } from "./SensitivityAnalysis";

const REGRESSION_ALLOWANCE = 0.05; // matches this whole research arc's own established <=5% True Regression bar

export interface FinalContract {
  selectedBudgetMs: number;
  selectionRationale: string;
  expectedRuntimeMs: number;
  expectedCapabilityDiff: number; // improved-count paired-diff vs 450ms baseline
  expectedRegressionRate: number;
  budgetComplianceRate: number; // 1 - recoveryTriggerRate at the selected budget
}

export interface Level1To3Result {
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

export function selectFinalBudget(
  paretoResults: readonly ParetoResult[],
  evaluations: readonly BudgetEvaluation[],
  trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>,
  avgRegressionRateByBudget: ReadonlyMap<number, number>,
  sensitivityPairs: readonly SensitivityPair[]
): FinalContract {
  const efficient = paretoResults.filter((r) => !r.dominated).map((r) => r.point);
  // Among Pareto-efficient, non-Baseline budgets meeting the Regression allowance,
  // pick the one with the best (most positive) Capability paired-diff vs Baseline.
  const evalByBudget = new Map(evaluations.map((e) => [e.budgetMs, e]));
  const candidates = efficient
    .filter((p) => avgRegressionRateByBudget.get(p.budgetMs)! <= REGRESSION_ALLOWANCE)
    .filter((p) => evalByBudget.has(p.budgetMs)) // excludes the 450ms Baseline itself (diff undefined against itself)
    .map((p) => ({ budgetMs: p.budgetMs, primaryMean: evalByBudget.get(p.budgetMs)!.primary.stats.mean }));

  let selectedBudgetMs: number;
  let selectionRationale: string;
  if (candidates.length === 0) {
    selectedBudgetMs = 450; // fall back to today's real, unmodified default
    selectionRationale = "No swept budget both cleared the Pareto frontier AND stayed within the 5% Regression allowance -- falling back to the real, unmodified 450ms default (no change recommended).";
  } else {
    candidates.sort((a, b) => b.primaryMean - a.primaryMean);
    let best = candidates[0].budgetMs;
    // Sensitivity: if the best candidate's CI overlaps a simpler neighbor's, prefer the simpler one.
    const overlappingPair = sensitivityPairs.find((p) => (p.budgetA === best || p.budgetB === best) && p.ciOverlap && p.recommendedSimplerBudget !== null);
    if (overlappingPair) {
      best = overlappingPair.recommendedSimplerBudget!;
      selectionRationale = `Best raw Capability candidate (among Pareto-efficient, Regression<=5% budgets) was ${candidates[0].budgetMs}ms, but its 95% CI overlaps ${overlappingPair.budgetA === candidates[0].budgetMs ? overlappingPair.budgetB : overlappingPair.budgetA}ms's own CI (statistically indistinguishable) -- selecting the simpler value ${best}ms per the Work Order's own tie-breaking instruction.`;
    } else {
      selectionRationale = `${best}ms is the Pareto-efficient, Regression<=5%-compliant budget with the best (most positive) Capability paired-diff vs the 450ms Baseline, with no CI-overlapping simpler neighbor to prefer instead.`;
    }
    selectedBudgetMs = best;
  }

  const selectedTrials = trialsByBudget.get(selectedBudgetMs) ?? trialsByBudget.get(450)!;
  const expectedRuntimeMs = selectedTrials.reduce((a, t) => a + t.avgWallMs, 0) / selectedTrials.length;
  const expectedRegressionRate = avgRegressionRateByBudget.get(selectedBudgetMs) ?? 0;
  const avgRecoveryTriggerRate = selectedTrials.reduce((a, t) => a + t.recoveryTriggerRate, 0) / selectedTrials.length;
  const expectedCapabilityDiff = evalByBudget.get(selectedBudgetMs)?.primary.stats.mean ?? 0;

  return {
    selectedBudgetMs,
    selectionRationale,
    expectedRuntimeMs,
    expectedCapabilityDiff,
    expectedRegressionRate,
    budgetComplianceRate: 1 - avgRecoveryTriggerRate,
  };
}

export function evaluateLevel1To3(
  trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>,
  paretoResults: readonly ParetoResult[],
  contract: FinalContract,
  expectedN: number,
  expectedBudgetCount: number
): Level1To3Result {
  const allMeasured = trialsByBudget.size === expectedBudgetCount && [...trialsByBudget.values()].every((trials) => trials.length === expectedN);
  const level1Pass = allMeasured;
  const level1Detail = `${trialsByBudget.size}/${expectedBudgetCount} budgets measured, each with real solve() calls across N=${expectedN} trials (no estimation).`;

  const dominatedCount = paretoResults.filter((r) => r.dominated).length;
  const efficientCount = paretoResults.length - dominatedCount;
  const level2Pass = efficientCount > 0 && efficientCount < paretoResults.length;
  const level2Detail = `${efficientCount}/${paretoResults.length} budgets are Pareto-efficient; ${dominatedCount} dominated budget(s) removed from consideration.`;

  const capabilityOk = contract.expectedCapabilityDiff > 0;
  const regressionOk = contract.expectedRegressionRate <= REGRESSION_ALLOWANCE;
  // "Runtime increase within allowance" -- checked as a delta vs the 450ms
  // Baseline's own avg runtime (same paired-diff style as every other
  // Level3 check in this research arc, per the correction this Sprint's own
  // predecessor Sprint had to make to avoid an apples-to-oranges bar).
  const baselineRuntimeMs = (trialsByBudget.get(450) ?? []).reduce((a, t) => a + t.avgWallMs, 0) / (trialsByBudget.get(450)?.length || 1);
  const runtimeOk = contract.expectedRuntimeMs <= baselineRuntimeMs + 50; // 50ms noise tolerance, disclosed
  const level3Pass = capabilityOk && regressionOk && runtimeOk;
  const level3Detail = `Selected budget ${contract.selectedBudgetMs}ms: Capability diff=${contract.expectedCapabilityDiff.toFixed(3)} (${capabilityOk ? "increase" : "no increase"}), Regression=${(contract.expectedRegressionRate * 100).toFixed(2)}% (${regressionOk ? "within" : "EXCEEDS"} 5% allowance), Runtime=${contract.expectedRuntimeMs.toFixed(1)}ms vs Baseline ${baselineRuntimeMs.toFixed(1)}ms (${runtimeOk ? "within allowance" : "EXCEEDS allowance"}).`;

  const decision: "A" | "B" | "C" = level1Pass && level2Pass && level3Pass ? "A" : level1Pass && level2Pass ? "B" : "C";
  const decisionRationale =
    decision === "A"
      ? `All three Level criteria hold simultaneously for ${contract.selectedBudgetMs}ms -- Operating Contract confirmed, ready for Production Integration Finalization.`
      : decision === "B"
        ? `Budget Sweep and Pareto Frontier are both complete and trustworthy, but the selected budget's own Capability/Regression/Runtime combination didn't clear all three Level3 sub-criteria simultaneously -- needs one more Refinement pass (e.g. a finer sweep near the current frontier) before Production Integration Finalization.`
        : `Budget Sweep or Pareto Frontier itself is incomplete -- cannot responsibly select an Operating Contract yet.`;

  return { level1Pass, level1Detail, level2Pass, level2Detail, level3Pass, level3Detail, decision, decisionRationale };
}
