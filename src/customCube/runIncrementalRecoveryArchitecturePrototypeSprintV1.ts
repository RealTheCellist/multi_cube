// Incremental Recovery Architecture Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryArchitecturePrototypeSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. This is the FIRST Sprint in the whole
// research arc that includes a real Production change: fiveByFiveEdges.ts's
// bfsMoveWingToPosition() gained an OPTIONAL deadline/granularity/
// checkEveryNodes parameter set, fully backward-compatible (every existing
// real caller -- tryFixWing, enumerateWingCandidates, etc. -- passes no
// deadline and is byte-identical to its pre-Sprint behavior; see that
// function's own comment in fiveByFiveEdges.ts). Zero Planner/Executor/
// Recovery/Primitive Gate/Primitive Logic/Solver-algorithm changes -- new
// directory solverPrimitiveIncrementalRecoveryArchitecturePrototype/ only,
// besides the one sanctioned production diff.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import {
  buildTestCases,
  compareGranularities,
  verifyRegressionSafety,
} from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/TraversalInterruptibilityCore";
import {
  runBudgetProbe,
  runBaselineProbe,
  summarizeBudgetCompliance,
} from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/BudgetCompliance";
import {
  pairResults,
  analyzeCapabilityPreservation,
  analyzeRegression,
} from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/CapabilityRegressionAnalysis";
import { runStandardEvaluation } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/StandardEvaluation";
import { analyzeProductionImpact } from "./solverPrimitiveIncrementalRecoveryArchitecturePrototype/ProductionImpact";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryArchitecturePrototype/data/incremental-recovery-architecture-prototype-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("Incremental Recovery Architecture Prototype Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
push(`STEP0. Population: ${allSnaps.length} real snapshots (full dataset).`);

const snapshotsWithCubies = allSnaps.map((s) => ({ hash: s.hash, cubies: deserializeCube(s.cubeState) }));
const cases = buildTestCases(snapshotsWithCubies);
log(`Built ${cases.length} real test cases from ${snapshotsWithCubies.length} snapshots.`);
push(`STEP1. Test cases: ${cases.length} (one per wrong wing with a same-needed-color match), from ${snapshotsWithCubies.length} snapshots.`);
push("");

log("STEP1: Traversal Interruptibility -- granularity comparison + regression safety...");
const granularityResults = compareGranularities(cases);
push("STEP1. Traversal Interruptibility -- granularity comparison (deliberately-expired deadline, forces abort at first check):");
for (const g of granularityResults) {
  push(`  ${g.granularity}: n=${g.n}, avgOvershootMs=${g.avgOvershootMs.toFixed(2)}, maxOvershootMs=${g.maxOvershootMs}, abortedCount=${g.abortedCount}/${g.n}`);
}
const regressionSafety = verifyRegressionSafety(cases);
push(`STEP1. Regression safety (deadline=undefined vs deadline=+60s, must be byte-identical): ${regressionSafety.identicalResultCount}/${regressionSafety.n} identical, ${regressionSafety.mismatchCount} mismatches.`);
push("");

log("STEP2: Budget Compliance (real 40ms deadline, queuePop granularity)...");
const baselineBudget = runBaselineProbe(cases);
const budgetedBudget = runBudgetProbe(cases);
const baselineSummary = summarizeBudgetCompliance(baselineBudget);
const budgetedSummary = summarizeBudgetCompliance(budgetedBudget);
push("STEP2. Budget Compliance:");
push(`  Baseline (no deadline): n=${baselineSummary.n}, avgRuntimeMs=${baselineSummary.avgRuntimeMs.toFixed(2)}, overrunRate=${(baselineSummary.overrunRate * 100).toFixed(2)}% (${baselineSummary.overrunCount}/${baselineSummary.n})`);
push(`  Budgeted (40ms deadline, queuePop): n=${budgetedSummary.n}, avgRuntimeMs=${budgetedSummary.avgRuntimeMs.toFixed(2)}, overrunRate=${(budgetedSummary.overrunRate * 100).toFixed(2)}% (${budgetedSummary.overrunCount}/${budgetedSummary.n})`);
push("");

log("STEP3-4: Capability Preservation + Regression Analysis...");
const pairs = pairResults(baselineBudget, budgetedBudget);
const capability = analyzeCapabilityPreservation(pairs);
const regression = analyzeRegression(pairs);
push("STEP3. Capability Preservation (native path-finding success rate, disclosed proxy for whole-cube/task-level capability):");
push(`  baselineSuccessRate=${(capability.baselineSuccessRate * 100).toFixed(2)}%, budgetedSuccessRate=${(capability.budgetedSuccessRate * 100).toFixed(2)}%, delta=${capability.successRateDeltaPct.toFixed(2)}pp`);
push("STEP4. Regression Analysis:");
push(`  True Regression (baseline found path, budgeted call aborted before finding it): ${regression.trueRegressionCount}/${regression.n} (${(regression.abortCausedCapabilityLossRate * 100).toFixed(2)}%)`);
push(`  False Regression (both arms found nothing regardless): ${regression.falseRegressionCount}/${regression.n}`);
push(`  Duplicate impact: ${regression.duplicateImpact}`);
push("");

log("STEP5: Standard Evaluation (paired-diff CI + effect size, n>=30)...");
const evaluation = runStandardEvaluation(pairs, regression, capability);
push("STEP5. Standard Evaluation (5-metric framework, reused from Architecture Revision Sprint v1):");
push(`  Primary (Budget Overrun reduction, paired per-case, n=${evaluation.primary.stats.n}): mean=${evaluation.primary.stats.mean.toFixed(4)}, 95% CI=[${evaluation.primary.stats.ciLower.toFixed(4)}, ${evaluation.primary.stats.ciUpper.toFixed(4)}], Cohen's d_z=${evaluation.primary.effectSize.cohensD.toFixed(3)} (${evaluation.primary.effectSize.magnitude})`);
push(`  Secondary (native path-finding success, both arms): baseline=${(evaluation.secondary.baselineSuccessRate * 100).toFixed(2)}%, budgeted=${(evaluation.secondary.budgetedSuccessRate * 100).toFixed(2)}%`);
push(`  Regression (candidate-strictly-worse count): ${evaluation.regression.trueRegressionCount} (${(evaluation.regression.trueRegressionRate * 100).toFixed(2)}%)`);
push(`  Capability (task-level proxy delta): ${evaluation.capability.successRateDeltaPct.toFixed(2)}pp`);
push(`  Integration (Runtime delta AND Overrun rate delta together): ${evaluation.integration.avgRuntimeDeltaMs.toFixed(2)}ms, ${evaluation.integration.overrunRateDeltaPct.toFixed(2)}pp`);
push("");

log("STEP6: Production Impact + Decision synthesis...");
// git-stash type-check comparison result, established earlier this Sprint (see conclusion doc):
// with the production change reverted vs applied, the ONLY diff was 6 errors
// in this Sprint's own new file (unexported-symbol errors, since the file
// imports symbols this Sprint's own edit exports) -- zero errors anywhere
// else changed. So typeCheckDiffIntroducedNewErrors = false.
const productionImpact = analyzeProductionImpact(
  granularityResults,
  regressionSafety,
  baselineSummary,
  budgetedSummary,
  capability,
  regression,
  false
);
push("STEP6. Production Impact + Level 1-3 Judgment:");
push(`  Level1 (Traversal Interruptibility correctly implemented): ${productionImpact.level1Pass ? "PASS" : "FAIL"}`);
push(`    ${productionImpact.level1Detail}`);
push(`  Level2 (Budget Overrun reduced to <=40%): ${productionImpact.level2Pass ? "PASS" : "FAIL"}`);
push(`    ${productionImpact.level2Detail}`);
push(`  Level3 (Capability maintained, no Regression increase): ${productionImpact.level3Pass ? "PASS" : "FAIL"}`);
push(`    ${productionImpact.level3Detail}`);
push("");
push(`  Cost-Benefit: runtimeReductionMs=${productionImpact.costBenefit.runtimeReductionMs.toFixed(2)}, overrunRateReduction=${(productionImpact.costBenefit.overrunRateReduction * 100).toFixed(2)}pp, capabilityCostPct=${productionImpact.costBenefit.capabilityCostPct.toFixed(2)}pp, trueRegressionCount=${productionImpact.costBenefit.trueRegressionCount}`);
push("");
push(`DECISION: ${productionImpact.decision}`);
push(`  ${productionImpact.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${productionImpact.decision}`);
