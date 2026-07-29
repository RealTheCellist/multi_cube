// --- RegressionSummary (CONFLICT_DEEP_DEPENDENCY Reserved Slice Production
// Integration Sprint v1, STEP4) ---------------------------------------------
// True vs False Regression methodology, reused from this arc's own
// established convention (unchanged since the Budget & Scheduling
// Validation Sprint v1's own RegressionCheck.ts): compare the REPEAT-MEAN
// wrongWingAfter (not a single draw) between Candidate and Baseline, using
// the same disclosed >0.5 mean-gap threshold.
import type { RunRecord } from "./RecoveryLevelCollector";

export const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;

export type RegressionClass = "NO_REGRESSION" | "FALSE_REGRESSION" | "TRUE_REGRESSION";

export interface CaseRegressionResult {
  label: string;
  meanWrongWingAfterBaseline: number;
  meanWrongWingAfterCandidate: number;
  meanGap: number; // candidate - baseline; positive = candidate worse
  singlePassFlipCount: number;
  classification: RegressionClass;
}

export function classifyCaseRegression(label: string, repeats: readonly { baselineWrongWingAfter: number; candidateWrongWingAfter: number }[]): CaseRegressionResult {
  const baselineValues = repeats.map((r) => r.baselineWrongWingAfter);
  const candidateValues = repeats.map((r) => r.candidateWrongWingAfter);
  const meanWrongWingAfterBaseline = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
  const meanWrongWingAfterCandidate = candidateValues.reduce((a, b) => a + b, 0) / candidateValues.length;
  const meanGap = meanWrongWingAfterCandidate - meanWrongWingAfterBaseline;
  const singlePassFlipCount = repeats.filter((r) => r.candidateWrongWingAfter > r.baselineWrongWingAfter).length;

  let classification: RegressionClass = "NO_REGRESSION";
  if (singlePassFlipCount > 0) {
    classification = meanGap > TRUE_REGRESSION_MEAN_GAP_THRESHOLD ? "TRUE_REGRESSION" : "FALSE_REGRESSION";
  }

  return { label, meanWrongWingAfterBaseline, meanWrongWingAfterCandidate, meanGap, singlePassFlipCount, classification };
}

export interface RegressionSummary {
  n: number;
  casesWithSinglePassFlip: number;
  trueRegressionCount: number;
  falseRegressionCount: number;
}

export function summarizeRegression(runs: readonly RunRecord[]): { perCase: CaseRegressionResult[]; summary: RegressionSummary } {
  const byLabel = new Map<string, { baselineWrongWingAfter: number; candidateWrongWingAfter: number }[]>();
  for (const run of runs) {
    for (const r of run) {
      const list = byLabel.get(r.label) ?? [];
      list.push({ baselineWrongWingAfter: r.baselineWrongWingAfter, candidateWrongWingAfter: r.candidateWrongWingAfter });
      byLabel.set(r.label, list);
    }
  }
  const perCase = [...byLabel.entries()].map(([label, repeats]) => classifyCaseRegression(label, repeats));
  const summary: RegressionSummary = {
    n: perCase.length,
    casesWithSinglePassFlip: perCase.filter((r) => r.singlePassFlipCount > 0).length,
    trueRegressionCount: perCase.filter((r) => r.classification === "TRUE_REGRESSION").length,
    falseRegressionCount: perCase.filter((r) => r.classification === "FALSE_REGRESSION").length,
  };
  return { perCase, summary };
}
