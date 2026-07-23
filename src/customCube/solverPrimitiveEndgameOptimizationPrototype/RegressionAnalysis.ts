// --- RegressionAnalysis (ENDGAME Optimization Prototype Sprint v1, STEP4)
// -----------------------------------------------------------------------
// Classifies each (snapshot, trial) pair for a candidate arm against the
// Baseline arm, reusing the exact terminology this whole research arc
// established in Incremental Recovery Production Integration Sprint v1's
// own RegressionAnalysis.ts (True Regression / Duplicate Success /
// Incremental-Recovery-Only Success, here renamed "Gap Rescue" per this
// Sprint's own Work Order terminology -- same underlying definition:
// candidate's final wrongWingCount strictly BETTER than baseline's).
import type { ThreeArmResult } from "./ThreeArmBenchmark";
import type { SolveProbeResult } from "./SolveProbe";

export interface RegressionClassification {
  n: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  duplicateSuccessCount: number;
  duplicateSuccessRate: number;
  gapRescueCount: number; // candidate strictly better than baseline
  gapRescueRate: number;
  noChangeCount: number;
}

function classifyPairs(baselines: readonly SolveProbeResult[], candidates: readonly SolveProbeResult[]): RegressionClassification {
  const n = baselines.length;
  let trueRegressionCount = 0;
  let duplicateSuccessCount = 0;
  let gapRescueCount = 0;
  let noChangeCount = 0;

  for (let i = 0; i < n; i++) {
    const b = baselines[i].wrongWingAfter;
    const c = candidates[i].wrongWingAfter;
    if (c > b) trueRegressionCount++;
    else if (c < b) gapRescueCount++;
    else {
      noChangeCount++;
      if (baselines[i].improved || baselines[i].solved) duplicateSuccessCount++;
    }
  }

  return {
    n,
    trueRegressionCount,
    trueRegressionRate: n ? trueRegressionCount / n : 0,
    duplicateSuccessCount,
    duplicateSuccessRate: n ? duplicateSuccessCount / n : 0,
    gapRescueCount,
    gapRescueRate: n ? gapRescueCount / n : 0,
    noChangeCount,
  };
}

export interface TrialRegressionClassification {
  reservedSliceVsBaseline: RegressionClassification;
  absorbVsBaseline: RegressionClassification;
}

export function classifyRegressions(pairs: readonly ThreeArmResult[]): TrialRegressionClassification {
  return {
    reservedSliceVsBaseline: classifyPairs(
      pairs.map((p) => p.baseline),
      pairs.map((p) => p.reservedSlice)
    ),
    absorbVsBaseline: classifyPairs(
      pairs.map((p) => p.baseline),
      pairs.map((p) => p.absorb)
    ),
  };
}
