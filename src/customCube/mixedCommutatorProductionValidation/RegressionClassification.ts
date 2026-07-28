// --- RegressionClassification (Mixed Commutator Production Validation
// Sprint v1, RQ-3, Required Measurement #5 "True vs False Regression") -----
// Reuses this research arc's own established True/False Regression
// methodology verbatim (docs/PRODUCTION_INTEGRATION_VALIDATION.md Section 3,
// Production Integration Validation Sprint v1): a single-pass "regression"
// flip can be genuine capability loss or pure single-draw noise from
// DISRUPT/SETUP's own stochastic search; classify using the repeat-mean gap
// across N=10 repeats per case, >0.5 mean-gap threshold, same as that
// Sprint's own disclosed choice.
import type { CounterfactualRow } from "./RecoveryLayerCounterfactual";

const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;

export interface RegressionCaseSummary {
  label: string;
  populationTag: CounterfactualRow["populationTag"];
  singlePassRegressionCount: number; // out of N repeats, how many showed a worse-or-equal outcome after outcome change
  meanIntegratedWrongWingAfter: number;
  meanBaselineWrongWingAfter: number;
  meanGap: number; // meanIntegrated - meanBaseline (positive = Integrated worse on average)
  classification: "TRUE_REGRESSION" | "FALSE_REGRESSION" | "NO_REGRESSION";
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function classifyRegressions(rowsByLabel: Map<string, CounterfactualRow[]>): RegressionCaseSummary[] {
  const out: RegressionCaseSummary[] = [];
  for (const [label, rows] of rowsByLabel) {
    const singlePassRegressionCount = rows.filter(
      (r) => r.outcomeChanged && r.integratedWrongWingAfter !== null && r.baselineWrongWingAfter !== null && r.integratedWrongWingAfter >= r.baselineWrongWingAfter
    ).length;
    if (singlePassRegressionCount === 0) {
      out.push({
        label,
        populationTag: rows[0].populationTag,
        singlePassRegressionCount: 0,
        meanIntegratedWrongWingAfter: mean(rows.map((r) => r.integratedWrongWingAfter ?? r.wrongWingBefore)),
        meanBaselineWrongWingAfter: mean(rows.map((r) => r.baselineWrongWingAfter ?? r.wrongWingBefore)),
        meanGap: 0,
        classification: "NO_REGRESSION",
      });
      continue;
    }
    const meanIntegrated = mean(rows.map((r) => r.integratedWrongWingAfter ?? r.wrongWingBefore));
    const meanBaseline = mean(rows.map((r) => r.baselineWrongWingAfter ?? r.wrongWingBefore));
    const meanGap = meanIntegrated - meanBaseline;
    out.push({
      label,
      populationTag: rows[0].populationTag,
      singlePassRegressionCount,
      meanIntegratedWrongWingAfter: meanIntegrated,
      meanBaselineWrongWingAfter: meanBaseline,
      meanGap,
      classification: meanGap > TRUE_REGRESSION_MEAN_GAP_THRESHOLD ? "TRUE_REGRESSION" : "FALSE_REGRESSION",
    });
  }
  return out;
}

export interface RegressionSummary {
  n: number;
  casesWithSinglePassFlip: number;
  trueRegressionCount: number;
  falseRegressionCount: number;
}

export function summarizeRegressions(rows: readonly RegressionCaseSummary[]): RegressionSummary {
  return {
    n: rows.length,
    casesWithSinglePassFlip: rows.filter((r) => r.singlePassRegressionCount > 0).length,
    trueRegressionCount: rows.filter((r) => r.classification === "TRUE_REGRESSION").length,
    falseRegressionCount: rows.filter((r) => r.classification === "FALSE_REGRESSION").length,
  };
}
