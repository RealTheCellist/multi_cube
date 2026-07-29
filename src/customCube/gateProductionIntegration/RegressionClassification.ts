// --- RegressionClassification (Gate Production Integration Sprint v1,
// RQ-4, Deliverable "Regression Report") --------------------------------------
// Reuses this research arc's own established True/False Regression
// methodology (Production Integration Validation Sprint v1 / Mixed
// Commutator Production Validation Sprint v1): a single-pass "regression"
// flip can be genuine capability loss OR pure single-draw noise from
// DISRUPT/SETUP's own stochastic search. For every single-pass flip, rerun
// N=10 fresh repeats on that exact case and compare repeat-mean
// wrongWingAfter -- a >0.5 mean gap (WITH-Mixed worse) is TRUE_REGRESSION,
// otherwise FALSE_REGRESSION. Cheap by construction: only cases the
// single pass actually flagged are re-measured, not the full population.
import { cloneCubies, type Cubie } from "../cubeState";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { measureRecoveryFlow, type FlowMeasurementRow, type PopulationTag } from "./RecoveryFlowMeasurement";

const TRUE_REGRESSION_MEAN_GAP_THRESHOLD = 0.5;
const RECHECK_REPEATS = 10;

export interface RegressionRecheckResult {
  label: string;
  singlePassWrongWingAfterWithMixed: number;
  singlePassWrongWingAfterWithoutMixed: number;
  meanWithMixed: number;
  meanWithoutMixed: number;
  meanGap: number; // meanWithMixed - meanWithoutMixed; positive = WITH Mixed worse on average
  classification: "TRUE_REGRESSION" | "FALSE_REGRESSION";
}

export function findSinglePassFlaggedCases(rows: readonly FlowMeasurementRow[]): FlowMeasurementRow[] {
  return rows.filter((r) => r.outcomeChangedByMixed && r.wrongWingAfterWithMixed !== null && r.wrongWingAfterWithoutMixed !== null && r.wrongWingAfterWithMixed >= r.wrongWingAfterWithoutMixed);
}

export function recheckRegression(cubies: Cubie[], label: string, populationTag: PopulationTag, libs: ExecutorLibraries, budgetMs: number, singlePassRow: FlowMeasurementRow): RegressionRecheckResult {
  const withMixedVals: number[] = [];
  const withoutMixedVals: number[] = [];
  for (let i = 0; i < RECHECK_REPEATS; i++) {
    const row = measureRecoveryFlow(cloneCubies(cubies), label, populationTag, libs, budgetMs);
    withMixedVals.push(row.wrongWingAfterWithMixed ?? row.wrongWingBefore);
    withoutMixedVals.push(row.wrongWingAfterWithoutMixed ?? row.wrongWingBefore);
  }
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const meanWithMixed = mean(withMixedVals);
  const meanWithoutMixed = mean(withoutMixedVals);
  const meanGap = meanWithMixed - meanWithoutMixed;
  return {
    label,
    singlePassWrongWingAfterWithMixed: singlePassRow.wrongWingAfterWithMixed!,
    singlePassWrongWingAfterWithoutMixed: singlePassRow.wrongWingAfterWithoutMixed!,
    meanWithMixed,
    meanWithoutMixed,
    meanGap,
    classification: meanGap > TRUE_REGRESSION_MEAN_GAP_THRESHOLD ? "TRUE_REGRESSION" : "FALSE_REGRESSION",
  };
}
