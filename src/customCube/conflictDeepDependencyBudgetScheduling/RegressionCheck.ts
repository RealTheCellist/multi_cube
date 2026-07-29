// --- RegressionCheck (CONFLICT_DEEP_DEPENDENCY Budget & Scheduling
// Validation Sprint v1, RQ-5, Deliverable #4) --------------------------------
// True vs False Regression methodology, reused from this arc's own
// established convention (first established in Mixed Commutator Production
// Validation Sprint v1, reused unmodified in every subsequent Sprint that
// measures a candidate change against a baseline): a single-pass flip
// could be genuine capability loss OR pure single-draw noise from
// DISRUPT/SETUP's own shuffle()-driven stochastic search -- classify by
// comparing the REPEAT-MEAN wrongWingAfter (not a single draw) between the
// candidate Arm and Baseline, using a disclosed >0.5 mean-gap threshold:
// meanGap>0.5 (Arm worse) = TRUE_REGRESSION, else FALSE_REGRESSION (or no
// regression at all if no single-pass flip was ever observed).
import type { ArmName, RepeatOutcome } from "./ShadowScheduler";

export const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;

export type RegressionClass = "NO_REGRESSION" | "FALSE_REGRESSION" | "TRUE_REGRESSION";

export interface CaseRegressionResult {
  label: string;
  meanWrongWingAfterBaseline: number;
  meanWrongWingAfterArm: number;
  meanGap: number; // arm - baseline; positive = arm worse
  singlePassFlipCount: number; // repeats where arm's effective wrongWingAfter > baseline's
  classification: RegressionClass;
}

function effectiveWrongWingAfter(wrongWingAfter: number | null, wrongWingBefore: number): number {
  return wrongWingAfter ?? wrongWingBefore; // no candidate chosen == no change from the starting state
}

export function classifyCaseRegression(label: string, arm: ArmName, repeats: readonly RepeatOutcome[]): CaseRegressionResult {
  const baselineValues = repeats.map((r) => effectiveWrongWingAfter(r.wrongWingAfter.BASELINE, r.wrongWingBefore));
  const armValues = repeats.map((r) => effectiveWrongWingAfter(r.wrongWingAfter[arm], r.wrongWingBefore));
  const meanWrongWingAfterBaseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
  const meanWrongWingAfterArm = armValues.reduce((a, b) => a + b, 0) / armValues.length;
  const meanGap = meanWrongWingAfterArm - meanWrongWingAfterBaseline;
  const singlePassFlipCount = repeats.filter((r) => effectiveWrongWingAfter(r.wrongWingAfter[arm], r.wrongWingBefore) > effectiveWrongWingAfter(r.wrongWingAfter.BASELINE, r.wrongWingBefore)).length;

  let classification: RegressionClass = "NO_REGRESSION";
  if (singlePassFlipCount > 0) {
    classification = meanGap > TRUE_REGRESSION_MEAN_GAP_THRESHOLD ? "TRUE_REGRESSION" : "FALSE_REGRESSION";
  }

  return { label, meanWrongWingAfterBaseline, meanWrongWingAfterArm, meanGap, singlePassFlipCount, classification };
}

export interface RegressionSummary {
  n: number;
  casesWithSinglePassFlip: number;
  trueRegressionCount: number;
  falseRegressionCount: number;
}

export function summarizeRegression(results: readonly CaseRegressionResult[]): RegressionSummary {
  return {
    n: results.length,
    casesWithSinglePassFlip: results.filter((r) => r.singlePassFlipCount > 0).length,
    trueRegressionCount: results.filter((r) => r.classification === "TRUE_REGRESSION").length,
    falseRegressionCount: results.filter((r) => r.classification === "FALSE_REGRESSION").length,
  };
}
