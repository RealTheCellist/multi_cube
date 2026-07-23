// ENDGAME Optimization Prototype Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runEndgameOptimizationPrototypeRefinementSprintV1.ts [dbPath] [nTrials] [subsampleSize]
//
// STEP1-6 per the Work Order. Zero new Production changes -- this Sprint
// only varies recoveryReserveMsOverride, an existing optional parameter on
// executeTask() (fiveByFiveEdgeExecutor.ts), added and left UNMODIFIED by
// the prior ENDGAME Optimization Prototype Sprint v1. Reuses that Sprint's
// own SolveProbe.ts (extended with one new instrumentation field,
// recoveryTriggered, reading an EXISTING trace label -- not a new
// mechanism) to call the REAL, unmirrored solve() directly.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { BUDGET_VALUES_MS, BASELINE_BUDGET_MS, runOneTrialAllBudgets, summarizeBudgetTrial, type BudgetTrialAggregate } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/BudgetSweep";
import { classifyAgainstBaseline } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/RegressionAnalysis";
import { runStatisticalValidation } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/StatisticalValidation";
import { computeParetoFrontier, paretoEfficientSet, type BudgetPoint } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/ParetoFrontier";
import { analyzeSensitivity } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/SensitivityAnalysis";
import { selectFinalBudget, evaluateLevel1To3 } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/FinalOperatingContract";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const N_TRIALS = Number(process.argv[3] ?? 30);
const SUBSAMPLE_SIZE = Number(process.argv[4] ?? 75);

const reportPath = "src/customCube/solverPrimitiveEndgameOptimizationPrototypeRefinement/data/endgame-optimization-prototype-refinement-v1-report.txt";

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

push("ENDGAME Optimization Prototype Refinement Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
push(`STEP0. Population: ${allSnaps.length} real snapshots total; ${subsample.length}-snapshot stride-sample used (project-standard cost-driven subsample), N=${N_TRIALS} trials per budget.`);
push(`Budgets swept (recoveryReserveMsOverride): ${BUDGET_VALUES_MS.join(", ")}ms. Baseline: ${BASELINE_BUDGET_MS}ms (today's real, unmodified RECOVERY_RESERVE_MS).`);
push("Zero new Production changes this Sprint -- only the budget VALUE passed to the existing executeTask() parameter varies.");
push("");

const trialsByBudget = new Map<number, BudgetTrialAggregate[]>();
for (const b of BUDGET_VALUES_MS) trialsByBudget.set(b, []);
const regressionRatesByBudget = new Map<number, number[]>();
for (const b of BUDGET_VALUES_MS) if (b !== BASELINE_BUDGET_MS) regressionRatesByBudget.set(b, []);

log(`STEP1/2: sweeping ${BUDGET_VALUES_MS.length} budgets x N=${N_TRIALS} trials x ${subsample.length} snapshots...`);
for (let trial = 0; trial < N_TRIALS; trial++) {
  log(`  trial ${trial + 1}/${N_TRIALS}...`);
  const resultsByBudget = runOneTrialAllBudgets(subsample, BUDGET_VALUES_MS);
  const baselineResults = resultsByBudget.get(BASELINE_BUDGET_MS)!;
  for (const [budgetMs, results] of resultsByBudget) {
    trialsByBudget.get(budgetMs)!.push(summarizeBudgetTrial(results, budgetMs));
    if (budgetMs !== BASELINE_BUDGET_MS) {
      const classification = classifyAgainstBaseline(baselineResults, results);
      regressionRatesByBudget.get(budgetMs)!.push(classification.trueRegressionRate);
    }
  }
}

push(`STEP1/2. Budget Sweep results (avg across ${N_TRIALS} trials, ${subsample.length} snapshots each):`);
push("  Budget | avgImproved | avgSolved | avgWallMs | DeadlineMissRate | EndgameInvoked | avgEndgameRuntimeMs | RecoveryTriggerRate | TrueRegressionRate(vs 450ms)");
const avgRegressionRateByBudget = new Map<number, number>();
avgRegressionRateByBudget.set(BASELINE_BUDGET_MS, 0);
for (const budgetMs of BUDGET_VALUES_MS) {
  const trials = trialsByBudget.get(budgetMs)!;
  const n = trials.length;
  const avgImproved = trials.reduce((a, t) => a + t.improvedCount, 0) / n;
  const avgSolved = trials.reduce((a, t) => a + t.solvedCount, 0) / n;
  const avgWallMs = trials.reduce((a, t) => a + t.avgWallMs, 0) / n;
  const avgDeadlineMiss = trials.reduce((a, t) => a + t.deadlineMissRate, 0) / n;
  const avgEndgameInvoked = trials.reduce((a, t) => a + t.endgameInvokedCount, 0) / n;
  const avgEndgameRuntime = trials.reduce((a, t) => a + t.avgEndgameRuntimeMs, 0) / n;
  const avgRecoveryTrigger = trials.reduce((a, t) => a + t.recoveryTriggerRate, 0) / n;
  const regRates = regressionRatesByBudget.get(budgetMs);
  const avgRegRate = regRates && regRates.length ? regRates.reduce((a, r) => a + r, 0) / regRates.length : 0;
  if (budgetMs !== BASELINE_BUDGET_MS) avgRegressionRateByBudget.set(budgetMs, avgRegRate);
  push(
    `  ${budgetMs}ms | ${avgImproved.toFixed(2)}/${subsample.length} | ${avgSolved.toFixed(2)}/${subsample.length} | ${avgWallMs.toFixed(1)} | ${(avgDeadlineMiss * 100).toFixed(2)}% | ${avgEndgameInvoked.toFixed(2)} | ${avgEndgameRuntime.toFixed(1)} | ${(avgRecoveryTrigger * 100).toFixed(2)}% | ${(avgRegRate * 100).toFixed(2)}%`
  );
}
push("");

log("STEP3: Statistical Validation...");
const evaluations = runStatisticalValidation(trialsByBudget, BASELINE_BUDGET_MS);
push(`STEP3. Statistical Validation (paired-diff vs ${BASELINE_BUDGET_MS}ms Baseline, N=${N_TRIALS} trials):`);
push("  Budget | Primary(improved diff) mean [95% CI] d_z | Runtime diff mean [95% CI] | DeadlineMiss diff pp | RecoveryTrigger diff pp");
for (const e of evaluations) {
  push(
    `  ${e.budgetMs}ms | ${e.primary.stats.mean.toFixed(3)} [${e.primary.stats.ciLower.toFixed(3)}, ${e.primary.stats.ciUpper.toFixed(3)}] d_z=${e.primary.effectSize.cohensD.toFixed(3)} (${e.primary.effectSize.magnitude}) | ${e.runtime.stats.mean.toFixed(2)} [${e.runtime.stats.ciLower.toFixed(2)}, ${e.runtime.stats.ciUpper.toFixed(2)}] | ${e.deadlineMiss.stats.mean.toFixed(2)} [${e.deadlineMiss.stats.ciLower.toFixed(2)}, ${e.deadlineMiss.stats.ciUpper.toFixed(2)}] | ${e.recoveryTrigger.stats.mean.toFixed(2)} [${e.recoveryTrigger.stats.ciLower.toFixed(2)}, ${e.recoveryTrigger.stats.ciUpper.toFixed(2)}]`
  );
}
push("");

log("STEP4: Pareto Frontier...");
const budgetPoints: BudgetPoint[] = BUDGET_VALUES_MS.map((budgetMs) => {
  const trials = trialsByBudget.get(budgetMs)!;
  const n = trials.length;
  return {
    budgetMs,
    avgImprovedCount: trials.reduce((a, t) => a + t.improvedCount, 0) / n,
    avgWallMs: trials.reduce((a, t) => a + t.avgWallMs, 0) / n,
    avgTrueRegressionRate: avgRegressionRateByBudget.get(budgetMs) ?? 0,
  };
});
const paretoResults = computeParetoFrontier(budgetPoints);
const efficientSet = paretoEfficientSet(paretoResults);
push("STEP4. Pareto Frontier (Capability/Runtime/Regression):");
for (const r of paretoResults) {
  push(
    `  ${r.point.budgetMs}ms: avgImproved=${r.point.avgImprovedCount.toFixed(2)}, avgWallMs=${r.point.avgWallMs.toFixed(1)}, avgTrueRegressionRate=${(r.point.avgTrueRegressionRate * 100).toFixed(2)}% -- ${r.dominated ? `DOMINATED by [${r.dominatedBy.join(", ")}]ms` : "PARETO-EFFICIENT"}`
  );
}
push(`  Pareto-efficient set: [${efficientSet.map((p) => p.budgetMs).join(", ")}]ms`);
push("");

log("STEP5: Sensitivity Analysis...");
const sensitivityPairs = analyzeSensitivity(evaluations, efficientSet.map((p) => p.budgetMs));
push("STEP5. Sensitivity Analysis (CI overlap between neighboring Pareto-efficient budgets):");
for (const pair of sensitivityPairs) {
  push(`  ${pair.budgetA}ms vs ${pair.budgetB}ms: CI overlap=${pair.ciOverlap}${pair.ciOverlap ? `, recommended simpler value=${pair.recommendedSimplerBudget}ms` : ""}`);
}
push("");

log("STEP6: Final Operating Contract...");
const contract = selectFinalBudget(paretoResults, evaluations, trialsByBudget, avgRegressionRateByBudget, sensitivityPairs);
const judgment = evaluateLevel1To3(trialsByBudget, paretoResults, contract, N_TRIALS, BUDGET_VALUES_MS.length);
push("STEP6. Final Operating Contract:");
push(`  Selected recoveryReserveMsOverride: ${contract.selectedBudgetMs}ms`);
push(`  Rationale: ${contract.selectionRationale}`);
push(`  Expected Runtime: ${contract.expectedRuntimeMs.toFixed(1)}ms`);
push(`  Expected Capability (improved-count diff vs 450ms Baseline): ${contract.expectedCapabilityDiff.toFixed(3)}`);
push(`  Expected Regression (True Regression rate): ${(contract.expectedRegressionRate * 100).toFixed(2)}%`);
push(`  Budget Compliance (1 - Recovery Trigger rate): ${(contract.budgetComplianceRate * 100).toFixed(2)}%`);
push("");

push("Level 1-3 Judgment:");
push(`  Level1 (Budget Sweep 완료): ${judgment.level1Pass ? "PASS" : "FAIL"} -- ${judgment.level1Detail}`);
push(`  Level2 (Pareto Frontier 확정): ${judgment.level2Pass ? "PASS" : "FAIL"} -- ${judgment.level2Detail}`);
push(`  Level3 (최종 Operating Contract 확정): ${judgment.level3Pass ? "PASS" : "FAIL"} -- ${judgment.level3Detail}`);
push("");
push(`DECISION: ${judgment.decision}`);
push(`  ${judgment.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${judgment.decision}`);
