// --- RegressionClassification (Mixed Commutator Production Validation
// Sprint v2, RQ-3) -----------------------------------------------------------
// Reuses this arc's own established True/False Regression methodology
// (Production Integration Validation Sprint v1 / Mixed Commutator
// Production Validation Sprint v1 / Gate Production Integration Sprint
// v1): a single-pass "regression" flip can be genuine capability loss or
// pure single-draw noise from DISRUPT/SETUP's own stochastic search;
// classify using the repeat-mean gap across N repeats per case, >0.5
// mean-gap threshold.
import type { CaseMeasurement } from "./CaseMeasurement";

const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;

export interface RegressionCaseSummary {
  label: string;
  singlePassRegressionCount: number;
  meanIntegratedWrongWingAfter: number;
  meanBaselineWrongWingAfter: number;
  meanGap: number; // positive = Integrated(Gate C) worse on average
  classification: "TRUE_REGRESSION" | "FALSE_REGRESSION" | "NO_REGRESSION";
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function classifyRegressions(cases: readonly CaseMeasurement[]): RegressionCaseSummary[] {
  return cases.map((c) => {
    const singlePassRegressionCount = c.perRepeat.filter(
      (r) => r.outcomeChanged && r.integratedWrongWingAfter !== null && r.baselineWrongWingAfter !== null && r.integratedWrongWingAfter >= r.baselineWrongWingAfter
    ).length;
    const meanIntegrated = mean(c.perRepeat.map((r) => r.integratedWrongWingAfter ?? c.wrongWingBefore));
    const meanBaseline = mean(c.perRepeat.map((r) => r.baselineWrongWingAfter ?? c.wrongWingBefore));
    const meanGap = meanIntegrated - meanBaseline;
    if (singlePassRegressionCount === 0) {
      return { label: c.label, singlePassRegressionCount: 0, meanIntegratedWrongWingAfter: meanIntegrated, meanBaselineWrongWingAfter: meanBaseline, meanGap: 0, classification: "NO_REGRESSION" as const };
    }
    return {
      label: c.label,
      singlePassRegressionCount,
      meanIntegratedWrongWingAfter: meanIntegrated,
      meanBaselineWrongWingAfter: meanBaseline,
      meanGap,
      classification: (meanGap > TRUE_REGRESSION_MEAN_GAP_THRESHOLD ? "TRUE_REGRESSION" : "FALSE_REGRESSION") as "TRUE_REGRESSION" | "FALSE_REGRESSION",
    };
  });
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
