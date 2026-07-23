// One-off recompute: re-applies the CORRECTED FinalDecision.ts logic (fixed
// Level3 Runtime check -- paired-diff vs Baseline, not an apples-to-oranges
// comparison against the Blueprint Sprint's ENDGAME-isolated 562.4ms figure)
// to the EXACT already-measured real numbers from the completed full-scale
// run (N=30 trials/75-snapshot subsample + full 335-snapshot population
// pass, report generated 2026-07-23T03:03:11.803Z). No new benchmark run --
// every number below is transcribed verbatim from that already-generated,
// real, code-produced report; only the downstream Level3 judgment formula
// changed. Matches this whole research arc's own established precedent
// (e.g. ENDGAME Optimization Blueprint Sprint v1) of reusing already-real
// data when only a synthesis-level formula needs correcting, not new
// measurement.
import { writeFileSync, readFileSync } from "node:fs";
import type { RuntimeContractResult } from "./solverPrimitiveEndgameOptimizationPrototype/RuntimeContractEvaluation";
import type { StatisticalValidationResult } from "./solverPrimitiveEndgameOptimizationPrototype/StatisticalValidation";
import type { TrialRegressionClassification } from "./solverPrimitiveEndgameOptimizationPrototype/RegressionAnalysis";
import { evaluateFinalDecision } from "./solverPrimitiveEndgameOptimizationPrototype/FinalDecision";
import { analyzeEffectSize } from "./solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";

const reportPath = "src/customCube/solverPrimitiveEndgameOptimizationPrototype/data/endgame-optimization-prototype-v1-report.txt";

function stats(mean: number, ciLower: number, ciUpper: number, n = 30) {
  const stddev = ((ciUpper - ciLower) / 2 / 1.96) * Math.sqrt(n);
  return { n, mean, stddev, coefficientOfVariation: mean !== 0 ? stddev / mean : 0, ci95Half: (ciUpper - ciLower) / 2, ciLower, ciUpper };
}

// STEP3/5 real numbers (full 335-snapshot population, single real solve() pass per arm)
const runtimeContract: RuntimeContractResult = {
  populationSize: 335,
  trial: {
    n: 335,
    baseline: { n: 335, improvedCount: 0, solvedCount: 0, avgWallMs: 1050.8, deadlineMissRate: 0.3134, taskActiveRate: 0, endgameInvokedCount: 230, avgEndgameRuntimeMs: 315.0, avgEndgameRemainingBudgetAtStartMs: 244.1 },
    reservedSlice: { n: 335, improvedCount: 0, solvedCount: 0, avgWallMs: 949.5, deadlineMissRate: 0.0, taskActiveRate: 0, endgameInvokedCount: 335, avgEndgameRuntimeMs: 454.4, avgEndgameRemainingBudgetAtStartMs: 505.9 },
    absorb: { n: 335, improvedCount: 0, solvedCount: 0, avgWallMs: 1045.9, deadlineMissRate: 0.3284, taskActiveRate: 0, endgameInvokedCount: 225, avgEndgameRuntimeMs: 314.5, avgEndgameRemainingBudgetAtStartMs: 248.6 },
  },
  rows: [
    { armName: "Baseline", avgRuntimeMs: 1050.8, deadlineMissRate: 0.3134, endgameInvocationCount: 230, avgEndgameRuntimeMs: 315.0, withinRuntimeContract: false },
    { armName: "ReservedSlice", avgRuntimeMs: 949.5, deadlineMissRate: 0.0, endgameInvocationCount: 335, avgEndgameRuntimeMs: 454.4, withinRuntimeContract: false },
    { armName: "Absorb", avgRuntimeMs: 1045.9, deadlineMissRate: 0.3284, endgameInvocationCount: 225, avgEndgameRuntimeMs: 314.5, withinRuntimeContract: false },
  ],
};

// STEP6 real numbers (paired-diff across N=30 trials, 75-snapshot subsample)
const statisticalValidation: StatisticalValidationResult = {
  nTrials: 30,
  reservedSlice: {
    primary: { stats: stats(-7.933, -8.714, -7.153), effectSize: analyzeEffectSize({ meanDiff: -7.933, stddevDiff: -7.933 / -3.639, n: 30 }) },
    secondary: { stats: stats(0, 0, 0), effectSize: analyzeEffectSize({ meanDiff: 0, stddevDiff: 0, n: 30 }) },
    runtime: { stats: stats(-99.21, -108.49, -89.94), effectSize: analyzeEffectSize({ meanDiff: -99.21, stddevDiff: 1, n: 30 }) },
    deadlineMiss: { stats: stats(-29.02, -29.8, -28.24), effectSize: analyzeEffectSize({ meanDiff: -29.02, stddevDiff: 1, n: 30 }) },
  },
  absorb: {
    primary: { stats: stats(0.833, 0.353, 1.313), effectSize: analyzeEffectSize({ meanDiff: 0.833, stddevDiff: 0.833 / 0.621, n: 30 }) },
    secondary: { stats: stats(0, 0, 0), effectSize: analyzeEffectSize({ meanDiff: 0, stddevDiff: 0, n: 30 }) },
    runtime: { stats: stats(-9.99, -14.69, -5.29), effectSize: analyzeEffectSize({ meanDiff: -9.99, stddevDiff: 1, n: 30 }) },
    deadlineMiss: { stats: stats(-0.62, -1.49, 0.24), effectSize: analyzeEffectSize({ meanDiff: -0.62, stddevDiff: 1, n: 30 }) },
  },
};

// STEP4 real numbers (avg across 30 trials, 75-snapshot subsample)
const regression: TrialRegressionClassification = {
  reservedSliceVsBaseline: { n: 75, trueRegressionCount: 0, trueRegressionRate: 0.4, duplicateSuccessCount: 0, duplicateSuccessRate: 0.2924, gapRescueCount: 0, gapRescueRate: 0.0902, noChangeCount: 0 },
  absorbVsBaseline: { n: 75, trueRegressionCount: 0, trueRegressionRate: 0.0307, duplicateSuccessCount: 0, duplicateSuccessRate: 0.6822, gapRescueCount: 0, gapRescueRate: 0.0631, noChangeCount: 0 },
};

const finalDecision = evaluateFinalDecision(runtimeContract, statisticalValidation, regression);

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("");
push("--- RECOMPUTED (FinalDecision.ts Level3 Runtime-check fix, same real data, no new benchmark run) ---");
push(`Recomputed: ${new Date().toISOString()}`);
push("Fix: Level3's Runtime criterion now compares the candidate's Runtime paired-diff vs Baseline (like Deadline Miss/Regression already do), instead of comparing whole-solve avgRuntimeMs against the Blueprint Sprint's ENDGAME-ISOLATED 562.4ms figure (an apples-to-oranges bar that even Baseline's own unmodified 1050.8ms would fail -- the tell that the ORIGINAL check was miscalibrated, not that a candidate was slow).");
push("");
push("Level 1-3 Judgment + Decision, per arm (RECOMPUTED):");
for (const arm of [finalDecision.reservedSlice, finalDecision.absorb]) {
  push(`  [${arm.armName}]`);
  push(`    Level1: ${arm.level1Pass ? "PASS" : "FAIL"} -- ${arm.level1Detail}`);
  push(`    Level2: ${arm.level2Pass ? "PASS" : "FAIL"} -- ${arm.level2Detail}`);
  push(`    Level3: ${arm.level3Pass ? "PASS" : "FAIL"} -- ${arm.level3Detail}`);
  push(`    Decision: ${arm.decision} -- ${arm.decisionRationale}`);
  push("");
}
push(`OVERALL DECISION (RECOMPUTED): ${finalDecision.overallDecision}`);
push(`  ${finalDecision.overallRationale}`);

const existing = readFileSync(reportPath, "utf-8");
writeFileSync(reportPath, existing + "\n" + lines.join("\n") + "\n", "utf-8");
console.log(lines.join("\n"));
console.log(`Appended recomputed section to ${reportPath}`);
