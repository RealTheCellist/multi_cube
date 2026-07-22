// --- RegressionAnalysis (Incremental Recovery Production Integration
// Sprint v1, STEP4) ----------------------------------------------------------
// Classifies every (snapshot, trial) pair from EndToEndBenchmark's own
// PairedSolveResult. Because each arm's solve() call is independently
// stochastic (see EndToEndBenchmark.ts's own header), a single pair's
// "regression" reflects that trial's random draw, not a deterministic
// fact about the snapshot -- STEP5 aggregates this classification across
// N>=30 trials to get a reliable rate.
//
// Disclosed terminology mapping (this Sprint's own work order names 4
// items not previously defined anywhere in this research arc):
//   True Regression: candidate's final wrongWingCount is STRICTLY WORSE
//     than baseline's, for the same snapshot in the same trial -- the
//     Budget Contract's interruption cost real capability this run.
//   False Regression: NOT USED as a separate bucket here (there is no
//     "would have failed anyway" concept at the whole-solve granularity
//     the way there was for a single bfsMoveWingToPosition call) --
//     folded into "No Change" below, disclosed as a deliberate scope
//     narrowing from the per-call definition used in Architecture
//     Prototype Sprint v1.
//   Duplicate Success: both arms reach the SAME final wrongWingCount
//     (whether solved, improved, or unchanged) -- the Contract made no
//     difference this run.
//   Incremental-Recovery-Only Success: candidate's final wrongWingCount
//     is STRICTLY BETTER than baseline's -- a case the Budget Contract's
//     faster per-call interruption let the SAME 1-second wall-clock reach
//     further (try more candidates/tasks) than pre-Sprint behavior could.
//   Abort Regression: aliased to True Regression at this aggregation
//     level -- attributing a whole-solve-level loss specifically to "an
//     abort fired" would require per-call instrumentation this Sprint's
//     scope (Budget Contract connection only, no Primitive Logic changes)
//     doesn't add; disclosed rather than fabricated.
import type { PairedSolveResult } from "./EndToEndBenchmark";

export interface RegressionClassification {
  n: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  duplicateSuccessCount: number;
  duplicateSuccessRate: number;
  incrementalRecoveryOnlySuccessCount: number;
  incrementalRecoveryOnlySuccessRate: number;
  noChangeCount: number;
  abortRegressionCount: number; // aliased to trueRegressionCount, see file header
  abortRegressionRate: number;
}

export function classifyRegressions(pairs: readonly PairedSolveResult[]): RegressionClassification {
  const n = pairs.length;
  let trueRegressionCount = 0;
  let duplicateSuccessCount = 0;
  let incrementalRecoveryOnlySuccessCount = 0;
  let noChangeCount = 0;

  for (const p of pairs) {
    const b = p.baseline.wrongWingAfter;
    const c = p.candidate.wrongWingAfter;
    if (c > b) trueRegressionCount++;
    else if (c < b) incrementalRecoveryOnlySuccessCount++;
    else {
      noChangeCount++;
      if (p.baseline.improved || p.baseline.solved) duplicateSuccessCount++;
    }
  }

  return {
    n,
    trueRegressionCount,
    trueRegressionRate: n ? trueRegressionCount / n : 0,
    duplicateSuccessCount,
    duplicateSuccessRate: n ? duplicateSuccessCount / n : 0,
    incrementalRecoveryOnlySuccessCount,
    incrementalRecoveryOnlySuccessRate: n ? incrementalRecoveryOnlySuccessCount / n : 0,
    noChangeCount,
    abortRegressionCount: trueRegressionCount,
    abortRegressionRate: n ? trueRegressionCount / n : 0,
  };
}
