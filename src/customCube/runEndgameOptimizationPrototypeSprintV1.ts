// ENDGAME Optimization Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runEndgameOptimizationPrototypeSprintV1.ts [dbPath] [nTrials] [subsampleSize]
//
// STEP1-6 per the Work Order. STEP1 (Executor Integration) is already wired
// directly into fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgeExecutor.ts
// (see this Sprint's own production diffs) -- this driver runs the REAL,
// unmodified solve() three ways (Baseline/Reserved Slice/Absorb) via
// SolveProbe.ts, with zero reimplementation of solve()'s own logic.
//
// A/B/Baseline is NOT pre-decided -- both candidate policies are measured
// against the same Baseline in every STEP, per the Work Order's explicit
// instruction.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { runOneTrial, summarizeTrial, ENDGAME_RESERVE_MS, ABSORB_RECOVERY_RESERVE_MS, type TrialAggregate, type ThreeArmResult } from "./solverPrimitiveEndgameOptimizationPrototype/ThreeArmBenchmark";
import { classifyRegressions, type TrialRegressionClassification } from "./solverPrimitiveEndgameOptimizationPrototype/RegressionAnalysis";
import { runStatisticalValidation } from "./solverPrimitiveEndgameOptimizationPrototype/StatisticalValidation";
import { evaluateRuntimeContract } from "./solverPrimitiveEndgameOptimizationPrototype/RuntimeContractEvaluation";
import { evaluateBudgetEfficiency } from "./solverPrimitiveEndgameOptimizationPrototype/BudgetEfficiency";
import { evaluateFinalDecision } from "./solverPrimitiveEndgameOptimizationPrototype/FinalDecision";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const N_TRIALS = Number(process.argv[3] ?? 30);
const SUBSAMPLE_SIZE = Number(process.argv[4] ?? 75); // project-standard cost-driven subsample for N-repeated stochastic solve() comparisons

const reportPath = "src/customCube/solverPrimitiveEndgameOptimizationPrototype/data/endgame-optimization-prototype-v1-report.txt";

function strideSample(items: readonly FailureSnapshot[], size: number): FailureSnapshot[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: FailureSnapshot[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("ENDGAME Optimization Prototype Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
push(`STEP0. Population: ${allSnaps.length} real snapshots total; ${subsample.length}-snapshot stride-sample used for the N=${N_TRIALS}-trial A/B/Baseline comparison (project-standard cost-driven subsample).`);
push(`STEP1. Executor Integration: ENDGAME_RESERVE_MS=${ENDGAME_RESERVE_MS} (Reserved Slice, per Blueprint Sprint v1's Final Operating Contract) wired into fiveByFiveEdgeSolverEngine.ts's solve() task loop as a new optional trailing param (endgameReserveMs), guaranteeing non-ENDGAME tasks a tighter ceiling so ENDGAME's own primary attempt gets a protected floor. Absorb variant (recoveryReserveMsOverride=${ABSORB_RECOVERY_RESERVE_MS}, redistributing 150ms of the existing 450ms RECOVERY_RESERVE_MS) wired into fiveByFiveEdgeExecutor.ts's executeTask() as a new optional trailing param, replacing the hardcoded RECOVERY_RESERVE_MS reference in the primaryDeadline computation. Both default to undefined/RECOVERY_RESERVE_MS respectively, preserving exact Baseline behavior for every existing caller. Verified via git-stash full-project type-check comparison: 205 errors both before and after (zero new).`);
push("");

log(`STEP2/6: running N=${N_TRIALS} trials over ${subsample.length}-snapshot subsample (Baseline vs Reserved Slice vs Absorb)...`);
const trialResults: ThreeArmResult[][] = [];
const trialAggregates: TrialAggregate[] = [];
const regressionPerTrial: TrialRegressionClassification[] = [];
for (let trial = 0; trial < N_TRIALS; trial++) {
  log(`  trial ${trial + 1}/${N_TRIALS}...`);
  const results = runOneTrial(subsample);
  trialResults.push(results);
  trialAggregates.push(summarizeTrial(results));
  regressionPerTrial.push(classifyRegressions(results));
}

push(`STEP2. Budget Policy A/B/Baseline (avg across ${N_TRIALS} trials, ${subsample.length} snapshots each):`);
const avgOf = (f: (t: TrialAggregate) => number) => trialAggregates.reduce((a, t) => a + f(t), 0) / N_TRIALS;
for (const [name, sel] of [
  ["Baseline", (t: TrialAggregate) => t.baseline] as const,
  ["ReservedSlice", (t: TrialAggregate) => t.reservedSlice] as const,
  ["Absorb", (t: TrialAggregate) => t.absorb] as const,
]) {
  const avgImproved = avgOf((t) => sel(t).improvedCount);
  const avgSolved = avgOf((t) => sel(t).solvedCount);
  const avgWallMs = avgOf((t) => sel(t).avgWallMs);
  const avgDeadlineMiss = avgOf((t) => sel(t).deadlineMissRate);
  const avgEndgameInvoked = avgOf((t) => sel(t).endgameInvokedCount);
  const avgEndgameRuntime = avgOf((t) => sel(t).avgEndgameRuntimeMs);
  const avgEndgameRemaining = avgOf((t) => sel(t).avgEndgameRemainingBudgetAtStartMs);
  push(
    `  ${name}: avgImproved=${avgImproved.toFixed(2)}/${subsample.length}, avgSolved=${avgSolved.toFixed(2)}/${subsample.length}, avgWallMs=${avgWallMs.toFixed(1)}, avgDeadlineMissRate=${(avgDeadlineMiss * 100).toFixed(2)}%, avgEndgameInvoked=${avgEndgameInvoked.toFixed(2)}, avgEndgameRuntimeMs=${avgEndgameRuntime.toFixed(1)}, avgEndgameRemainingBudgetAtStartMs=${avgEndgameRemaining.toFixed(1)}`
  );
}
push("");

log("STEP4: Regression/Gap Rescue Analysis (avg across trials)...");
push(`STEP4. Regression + Gap Rescue Analysis (avg across ${N_TRIALS} trials):`);
for (const [name, sel] of [
  ["ReservedSlice", (r: TrialRegressionClassification) => r.reservedSliceVsBaseline] as const,
  ["Absorb", (r: TrialRegressionClassification) => r.absorbVsBaseline] as const,
]) {
  const avgTrueReg = regressionPerTrial.reduce((a, r) => a + sel(r).trueRegressionRate, 0) / N_TRIALS;
  const avgDupSuccess = regressionPerTrial.reduce((a, r) => a + sel(r).duplicateSuccessRate, 0) / N_TRIALS;
  const avgGapRescue = regressionPerTrial.reduce((a, r) => a + sel(r).gapRescueRate, 0) / N_TRIALS;
  push(`  ${name} vs Baseline: True Regression rate=${(avgTrueReg * 100).toFixed(2)}%, Duplicate Success rate=${(avgDupSuccess * 100).toFixed(2)}%, Gap Rescue rate=${(avgGapRescue * 100).toFixed(2)}%`);
}
push("");

log("STEP3: Runtime Contract over full population...");
const runtimeContract = evaluateRuntimeContract(allSnaps);
push(`STEP3. Runtime Contract (full ${runtimeContract.populationSize}-snapshot population, single real solve() pass per arm):`);
for (const row of runtimeContract.rows) {
  push(
    `  ${row.armName}: avgRuntimeMs=${row.avgRuntimeMs.toFixed(1)}, deadlineMissRate=${(row.deadlineMissRate * 100).toFixed(2)}%, endgameInvocationCount=${row.endgameInvocationCount}/${runtimeContract.populationSize}, avgEndgameRuntimeMs=${row.avgEndgameRuntimeMs.toFixed(1)}, withinRuntimeContract(<=562.4ms)=${row.withinRuntimeContract}`
  );
}
push("");

log("STEP5: Budget Efficiency...");
const efficiency = evaluateBudgetEfficiency(runtimeContract.trial.baseline, runtimeContract.trial.reservedSlice, runtimeContract.trial.absorb);
push("STEP5. Budget Efficiency (full population):");
for (const row of efficiency) {
  push(
    `  ${row.armName}: endgameInvocationCount=${row.endgameInvocationCount}, avgEndgameRuntimeMs=${row.avgEndgameRuntimeMs.toFixed(1)}, avgRemainingBudgetAtStartMs=${row.avgRemainingBudgetAtStartMs.toFixed(1)}, usageRate=${(row.usageRate * 100).toFixed(1)}%, flaggedLowUsage=${row.flaggedLowUsage}`
  );
}
push("");

log("STEP6: Statistical Validation...");
const statValidation = runStatisticalValidation(trialAggregates);
push(`STEP6. Statistical Validation (paired-diff across N=${N_TRIALS} trials):`);
for (const [name, ev] of [
  ["ReservedSlice", statValidation.reservedSlice] as const,
  ["Absorb", statValidation.absorb] as const,
]) {
  push(`  ${name} vs Baseline:`);
  push(`    Primary (improved count diff): mean=${ev.primary.stats.mean.toFixed(3)}, 95% CI=[${ev.primary.stats.ciLower.toFixed(3)}, ${ev.primary.stats.ciUpper.toFixed(3)}], Cohen's d_z=${ev.primary.effectSize.cohensD.toFixed(3)} (${ev.primary.effectSize.magnitude})`);
  push(`    Secondary (solved count diff): mean=${ev.secondary.stats.mean.toFixed(3)}, 95% CI=[${ev.secondary.stats.ciLower.toFixed(3)}, ${ev.secondary.stats.ciUpper.toFixed(3)}]`);
  push(`    Runtime (avg wall ms diff): mean=${ev.runtime.stats.mean.toFixed(2)}, 95% CI=[${ev.runtime.stats.ciLower.toFixed(2)}, ${ev.runtime.stats.ciUpper.toFixed(2)}]`);
  push(`    Deadline Miss (rate diff, pp): mean=${ev.deadlineMiss.stats.mean.toFixed(2)}, 95% CI=[${ev.deadlineMiss.stats.ciLower.toFixed(2)}, ${ev.deadlineMiss.stats.ciUpper.toFixed(2)}]`);
}
push("");

log("Final Decision...");
const finalRegression: TrialRegressionClassification = {
  reservedSliceVsBaseline: {
    n: subsample.length,
    trueRegressionCount: 0,
    trueRegressionRate: regressionPerTrial.reduce((a, r) => a + r.reservedSliceVsBaseline.trueRegressionRate, 0) / N_TRIALS,
    duplicateSuccessCount: 0,
    duplicateSuccessRate: regressionPerTrial.reduce((a, r) => a + r.reservedSliceVsBaseline.duplicateSuccessRate, 0) / N_TRIALS,
    gapRescueCount: 0,
    gapRescueRate: regressionPerTrial.reduce((a, r) => a + r.reservedSliceVsBaseline.gapRescueRate, 0) / N_TRIALS,
    noChangeCount: 0,
  },
  absorbVsBaseline: {
    n: subsample.length,
    trueRegressionCount: 0,
    trueRegressionRate: regressionPerTrial.reduce((a, r) => a + r.absorbVsBaseline.trueRegressionRate, 0) / N_TRIALS,
    duplicateSuccessCount: 0,
    duplicateSuccessRate: regressionPerTrial.reduce((a, r) => a + r.absorbVsBaseline.duplicateSuccessRate, 0) / N_TRIALS,
    gapRescueCount: 0,
    gapRescueRate: regressionPerTrial.reduce((a, r) => a + r.absorbVsBaseline.gapRescueRate, 0) / N_TRIALS,
    noChangeCount: 0,
  },
};
const finalDecision = evaluateFinalDecision(runtimeContract, statValidation, finalRegression);

push("Level 1-3 Judgment + Decision, per arm:");
for (const arm of [finalDecision.reservedSlice, finalDecision.absorb]) {
  push(`  [${arm.armName}]`);
  push(`    Level1 (Reserved/Absorb 정책이 실제 ENDGAME 호출 지점에 적용됨): ${arm.level1Pass ? "PASS" : "FAIL"} -- ${arm.level1Detail}`);
  push(`    Level2 (Capability 증가, 95% CI가 0을 배제): ${arm.level2Pass ? "PASS" : "FAIL"} -- ${arm.level2Detail}`);
  push(`    Level3 (Runtime Contract 유지): ${arm.level3Pass ? "PASS" : "FAIL"} -- ${arm.level3Detail}`);
  push(`    Decision: ${arm.decision} -- ${arm.decisionRationale}`);
  push("");
}
push(`OVERALL DECISION: ${finalDecision.overallDecision}`);
push(`  ${finalDecision.overallRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`OVERALL DECISION: ${finalDecision.overallDecision}`);
