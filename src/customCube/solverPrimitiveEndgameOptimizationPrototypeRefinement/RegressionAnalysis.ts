// --- RegressionAnalysis (ENDGAME Optimization Prototype Refinement Sprint
// v1, STEP2) ----------------------------------------------------------------
// Classifies each snapshot's outcome at budget X against the SAME trial's
// 450ms Baseline outcome for the SAME snapshot (paired within-trial
// comparison, matching every prior Sprint's own True Regression
// definition: candidate's final wrongWingCount strictly WORSE than
// baseline's).
import type { SolveProbeResult } from "../solverPrimitiveEndgameOptimizationPrototype/SolveProbe";

export interface RegressionClassification {
  n: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  gapRescueCount: number; // candidate strictly better than baseline (renamed from prior Sprint's own terminology)
  gapRescueRate: number;
  noChangeCount: number;
}

export function classifyAgainstBaseline(baseline: readonly SolveProbeResult[], candidate: readonly SolveProbeResult[]): RegressionClassification {
  const n = baseline.length;
  let trueRegressionCount = 0;
  let gapRescueCount = 0;
  let noChangeCount = 0;
  for (let i = 0; i < n; i++) {
    const b = baseline[i].wrongWingAfter;
    const c = candidate[i].wrongWingAfter;
    if (c > b) trueRegressionCount++;
    else if (c < b) gapRescueCount++;
    else noChangeCount++;
  }
  return {
    n,
    trueRegressionCount,
    trueRegressionRate: n ? trueRegressionCount / n : 0,
    gapRescueCount,
    gapRescueRate: n ? gapRescueCount / n : 0,
    noChangeCount,
  };
}
