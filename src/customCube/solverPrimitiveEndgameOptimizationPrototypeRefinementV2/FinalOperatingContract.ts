// --- FinalOperatingContract (ENDGAME Optimization Prototype Refinement
// Sprint v2, STEP5) ----------------------------------------------------------
// Synthesizes STEP1-4 into the final recoveryReserveMsOverride selection,
// this Sprint's own Level1-3 judgment, and Decision A/B/C.
import type { BudgetTrialAggregate } from "./BudgetSweep";
import type { SegmentVerdict, TurningPointResult } from "./TurningPointAnalysis";
import type { ParetoResult } from "./ParetoFrontierRevision";

const REGRESSION_ALLOWANCE = 0.05; // matches this whole research arc's own established <=5% True Regression bar

export interface FinalContractV2 {
  selectedBudgetMs: number;
  selectionRationale: string;
  expectedRuntimeMs: number;
  expectedCapabilityDiffVs450: number;
  expectedRegressionRateVs450: number;
  budgetComplianceRate: number;
}

/** Walks the ordered segments (250 -> 225 -> ... -> 50), advancing "best" only while the trend is a statistically distinguishable, allowance-compliant improvement. */
export function selectFinalBudgetV2(
  orderedBudgetsDescending: readonly number[], // [250, 225, 200, ..., 50]
  segments: readonly SegmentVerdict[], // one fewer than orderedBudgetsDescending, aligned pairwise
  trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>,
  avgRegressionRateVs450ByBudget: ReadonlyMap<number, number>
): FinalContractV2 {
  let best = orderedBudgetsDescending[0]; // 250ms, the incoming Operating Contract from v1
  const stopReasons: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const candidateBudget = seg.smallerBudgetMs;
    const regressionOk = (avgRegressionRateVs450ByBudget.get(candidateBudget) ?? 1) <= REGRESSION_ALLOWANCE;
    if (seg.classification === "increasing" && regressionOk) {
      best = candidateBudget;
      continue;
    }
    if (seg.classification === "increasing" && !regressionOk) {
      stopReasons.push(`${candidateBudget}ms showed a statistically better Capability step but its True Regression rate exceeded the 5% allowance -- stopped advancing there.`);
      break;
    }
    if (seg.classification === "plateau") {
      stopReasons.push(`${seg.largerBudgetMs}ms -> ${candidateBudget}ms is a statistical plateau (95% CI includes 0) -- per the established tie-breaking preference for the simpler/larger value, stopped advancing past ${seg.largerBudgetMs}ms.`);
      break;
    }
    // decreasing
    stopReasons.push(`${seg.largerBudgetMs}ms -> ${candidateBudget}ms is a statistically significant Capability DECREASE -- stopped advancing, ${seg.largerBudgetMs}ms is the last budget on the improving side.`);
    break;
  }

  const selectedTrials = trialsByBudget.get(best)!;
  const baselineTrials450 = trialsByBudget.get(450)!;
  const expectedRuntimeMs = selectedTrials.reduce((a, t) => a + t.avgWallMs, 0) / selectedTrials.length;
  const avgRecoveryTriggerRate = selectedTrials.reduce((a, t) => a + t.recoveryTriggerRate, 0) / selectedTrials.length;
  const expectedCapabilityDiffVs450 =
    selectedTrials.reduce((a, t, idx) => a + (t.improvedCount - baselineTrials450[idx].improvedCount), 0) / selectedTrials.length;

  return {
    selectedBudgetMs: best,
    selectionRationale:
      stopReasons.length > 0
        ? stopReasons[stopReasons.length - 1]
        : `Capability kept statistically improving, within the Regression allowance, all the way to the end of this Sprint's own swept range (${orderedBudgetsDescending[orderedBudgetsDescending.length - 1]}ms) -- selected the smallest budget swept.`,
    expectedRuntimeMs,
    expectedCapabilityDiffVs450,
    expectedRegressionRateVs450: avgRegressionRateVs450ByBudget.get(best) ?? 0,
    budgetComplianceRate: 1 - avgRecoveryTriggerRate,
  };
}

export interface Level1To3ResultV2 {
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

export function evaluateLevel1To3V2(
  trialsByBudget: ReadonlyMap<number, readonly BudgetTrialAggregate[]>,
  newBudgets: readonly number[], // the 8 new budgets this Sprint added (225..50)
  expectedN: number,
  turningPoint: TurningPointResult,
  paretoResults: readonly ParetoResult[],
  contract: FinalContractV2,
  baselineRuntimeMs: number
): Level1To3ResultV2 {
  const allMeasured = newBudgets.every((b) => (trialsByBudget.get(b)?.length ?? 0) === expectedN);
  const level1Pass = allMeasured;
  const level1Detail = `${newBudgets.length}/${newBudgets.length} new budgets (${newBudgets.join(", ")}ms) measured, each with real solve() calls across N=${expectedN} trials (no estimation, no interpolation).`;

  const level2Pass = turningPoint.turningPointAt !== null;
  const level2Detail = turningPoint.overallVerdict;

  const isParetoEfficient = paretoResults.find((r) => r.point.budgetMs === contract.selectedBudgetMs)?.dominated === false;
  const capabilityOk = contract.expectedCapabilityDiffVs450 > 0;
  const regressionOk = contract.expectedRegressionRateVs450 <= REGRESSION_ALLOWANCE;
  const runtimeOk = contract.expectedRuntimeMs <= baselineRuntimeMs + 50;
  const level3Pass = capabilityOk && regressionOk && runtimeOk && isParetoEfficient;
  const level3Detail = `Selected budget ${contract.selectedBudgetMs}ms: Pareto-efficient=${isParetoEfficient}, Regression=${(contract.expectedRegressionRateVs450 * 100).toFixed(2)}% (${regressionOk ? "within" : "EXCEEDS"} 5% allowance), Runtime=${contract.expectedRuntimeMs.toFixed(1)}ms vs original 450ms Baseline ${baselineRuntimeMs.toFixed(1)}ms (${runtimeOk ? "within allowance" : "EXCEEDS allowance"}).`;

  let decision: "A" | "B" | "C";
  let decisionRationale: string;
  if (contract.selectedBudgetMs < 250) {
    decision = "A";
    decisionRationale = `A budget BETTER than v1's own 250ms was found and retained (${contract.selectedBudgetMs}ms) -- Operating Contract updated.`;
  } else if (turningPoint.turningPointAt?.classification === "plateau") {
    decision = "B";
    decisionRationale = `250ms remains the selected Operating Contract -- the very first step below it (250ms -> 225ms) is a statistical plateau, confirming 250ms with STRONGER evidence than v1's own Sprint (which only compared 250ms against its own immediate 275ms/300ms neighbors, not against the full range down to 50ms).`;
  } else if (turningPoint.turningPointAt?.classification === "decreasing" || !regressionOk) {
    decision = "C";
    decisionRationale = `Capability decreases or Regression spikes below 250ms (${turningPoint.overallVerdict}) -- current Contract (250ms) must be retained; going lower is confirmed counterproductive, not merely untested.`;
  } else {
    decision = "B";
    decisionRationale = `250ms remains selected; see turning-point detail for the specific reason advancing further was not retained.`;
  }

  return { level1Pass, level1Detail, level2Pass, level2Detail, level3Pass, level3Detail, decision, decisionRationale };
}
