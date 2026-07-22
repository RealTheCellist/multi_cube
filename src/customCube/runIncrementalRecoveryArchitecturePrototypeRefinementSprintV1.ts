// Incremental Recovery Architecture Prototype Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryArchitecturePrototypeRefinementSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. Zero Production code changes this Sprint --
// reuses Architecture Prototype Sprint v1's own Traversal Interruptibility
// mechanism (bfsMoveWingToPosition's deadline/granularity/checkEveryNodes
// parameters) as-is, only varying the budget VALUE across
// [40,60,80,100,120,140,160,200]ms with queuePop granularity (that Sprint's
// own winning choice). New directory
// solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/ only --
// no Planner/Executor/Recovery/Primitive Gate/Primitive Logic/Solver
// algorithm changes.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildTestCases } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/TraversalInterruptibilityCore";
import {
  BUDGET_VALUES_MS,
  runBudgetSweep,
  runBaselineNoDeadline,
  summarizeBudgetSweep,
} from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/BudgetSweep";
import { analyzeCapabilityRecovery } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/CapabilityRecovery";
import { analyzeRegressionCurve } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/RegressionCurve";
import { computeParetoFrontier, analyzeParetoFrontier } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/ParetoFrontier";
import { validateBudgetVs40ms } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/StatisticalValidation";
import { decideOperatingContract } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/OperatingContract";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/data/incremental-recovery-architecture-prototype-refinement-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("Incremental Recovery Architecture Prototype Refinement Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const snapshotsWithCubies = allSnaps.map((s) => ({ hash: s.hash, cubies: deserializeCube(s.cubeState) }));
const cases = buildTestCases(snapshotsWithCubies);
log(`Built ${cases.length} real test cases from ${snapshotsWithCubies.length} snapshots.`);
push(`STEP0. Population: ${snapshotsWithCubies.length} real snapshots, ${cases.length} real test cases (same construction as Architecture Prototype Sprint v1).`);
push("");

log("STEP1: Budget Sweep across 8 budgets (this will take a while)...");
const baselineNoDeadline = runBaselineNoDeadline(cases);
const sweepByBudget = runBudgetSweep(cases, BUDGET_VALUES_MS);
const sweepSummaries = BUDGET_VALUES_MS.map((b) => summarizeBudgetSweep(sweepByBudget.get(b)!));

push("STEP1. Budget Sweep:");
const ceilingSuccessRate = baselineNoDeadline.filter((r) => r.foundPath).length / baselineNoDeadline.length;
push(`  Unconstrained ceiling (no deadline): avgRuntimeMs=${(baselineNoDeadline.reduce((a, r) => a + r.runtimeMs, 0) / baselineNoDeadline.length).toFixed(2)}, successRate=${(ceilingSuccessRate * 100).toFixed(2)}%`);
for (const s of sweepSummaries) {
  push(`  ${s.budgetMs}ms: avgRuntimeMs=${s.avgRuntimeMs.toFixed(2)}, overrunRate=${(s.overrunRate * 100).toFixed(2)}%, abortRate=${(s.abortRate * 100).toFixed(2)}%, completionRate=${(s.completionRate * 100).toFixed(2)}%`);
}
push("");

log("STEP2: Capability Recovery curve...");
const capabilityRecovery = analyzeCapabilityRecovery(sweepByBudget, baselineNoDeadline);
push("STEP2. Capability Recovery (vs 40ms baseline, vs unconstrained ceiling):");
for (const c of capabilityRecovery) {
  push(`  ${c.budgetMs}ms: successRate=${(c.successRate * 100).toFixed(2)}%, recoveryVs40ms=${c.recoveryVs40msPp.toFixed(2)}pp, recoveryVsCeiling=${c.recoveryVsCeilingPct.toFixed(1)}%, deferredReject=${c.deferredReject}`);
}
push("");

log("STEP3: Regression Curve...");
const regressionCurve = analyzeRegressionCurve(sweepByBudget, baselineNoDeadline);
push("STEP3. Regression Curve:");
for (const r of regressionCurve) {
  push(`  ${r.budgetMs}ms: trueRegression=${r.trueRegressionCount}(${(r.trueRegressionRate * 100).toFixed(2)}%), falseRegression=${r.falseRegressionCount}, abortRegression=${r.abortRegressionCount}(${(r.abortRegressionRate * 100).toFixed(2)}%), duplicateImpact=${r.duplicateImpact}`);
}
push("");

log("STEP4: Pareto Frontier...");
const successRateByBudget = new Map(capabilityRecovery.map((c) => [c.budgetMs, c.successRate]));
const paretoPoints = computeParetoFrontier(sweepSummaries, successRateByBudget, ceilingSuccessRate);
const paretoAnalysis = analyzeParetoFrontier(paretoPoints);
push("STEP4. Pareto Frontier (X=Capability Loss vs ceiling, Y=Budget Compliance):");
for (const p of paretoPoints) {
  push(`  ${p.budgetMs}ms: capabilityLoss=${(p.capabilityLoss * 100).toFixed(2)}%, budgetCompliance=${(p.budgetCompliance * 100).toFixed(2)}%, avgRuntimeMs=${p.avgRuntimeMs.toFixed(2)}, paretoOptimal=${p.isParetoOptimal}`);
}
push(`  Optimal budgets: [${paretoAnalysis.optimalBudgets.join(", ")}]ms`);
push(`  Compliance range: [${(paretoAnalysis.complianceRange.min * 100).toFixed(2)}%, ${(paretoAnalysis.complianceRange.max * 100).toFixed(2)}%] -- ${paretoAnalysis.complianceIsBudgetInvariant ? "effectively budget-invariant" : "varies by budget"}`);
push("");

log("STEP5: Statistical Validation vs 40ms...");
const validation = validateBudgetVs40ms(sweepByBudget);
push("STEP5. Statistical Validation (paired-diff success-rate change vs 40ms, n=" + cases.length + "):");
for (const v of validation) {
  push(`  ${v.budgetMs}ms: meanDiff=${v.successDiffStats.mean.toFixed(4)}, 95% CI=[${v.successDiffStats.ciLower.toFixed(4)}, ${v.successDiffStats.ciUpper.toFixed(4)}], Cohen's d_z=${v.effectSize.cohensD.toFixed(3)} (${v.effectSize.magnitude}), significant=${v.significantImprovement}`);
}
push("");

log("STEP6: Operating Contract decision...");
const contract = decideOperatingContract(sweepSummaries, capabilityRecovery, paretoAnalysis, validation);
push("STEP6. Operating Contract + Level 1-3 Judgment:");
push(`  Level1 (Budget Sweep completed): ${contract.level1Pass ? "PASS" : "FAIL"}`);
push(`    ${contract.level1Detail}`);
push(`  Level2 (meaningful recovery + compliance maintained): ${contract.level2Pass ? "PASS" : "FAIL"}`);
push(`    ${contract.level2Detail}`);
push(`  Level3 (Pareto-optimal budget confirmed): ${contract.level3Pass ? "PASS" : "FAIL"}`);
push(`    ${contract.level3Detail}`);
push("");
push(`  Recommended Contract: ${contract.recommendedContract}${contract.recommendedBudgetMs !== null ? ` @ ${contract.recommendedBudgetMs}ms` : ""}`);
push(`    ${contract.rationale}`);
push("");
push(`DECISION: ${contract.decision}`);
push(`  ${contract.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${contract.decision}`);
