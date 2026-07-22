// Incremental Recovery Production Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryProductionIntegrationSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. Wires Architecture Prototype Refinement
// Sprint v1's own confirmed 140ms Fixed Budget Operating Contract into the
// REAL production PAIR-task call site (tryFixWing, called from
// fiveByFiveEdgeExecutor.ts's runPrimaryPipeline) for the first time, and
// validates that Prototype-level findings (91.4% capability recovery,
// 99.29% Budget Compliance, 1.53% True Regression -- all measured at the
// isolated bfsMoveWingToPosition-call layer) hold up when exercised through
// the REAL, unmodified FiveByFiveEdgeSolverEngine.solve().
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { buildLibs, runOneTrial, summarizeTrial, type TrialAggregate, type PairedSolveResult } from "./solverPrimitiveIncrementalRecoveryProductionIntegration/EndToEndBenchmark";
import { classifyRegressions, type RegressionClassification } from "./solverPrimitiveIncrementalRecoveryProductionIntegration/RegressionAnalysis";
import { runStandardEvaluation } from "./solverPrimitiveIncrementalRecoveryProductionIntegration/StandardEvaluation";
import { analyzeProductionReadiness } from "./solverPrimitiveIncrementalRecoveryProductionIntegration/ProductionReadinessReport";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryProductionIntegration/data/incremental-recovery-production-integration-v1-report.txt";

const SUBSAMPLE_SIZE = 75; // same cost-driven, project-standard population as every prior N=30 comparison Sprint
const N_TRIALS = Number(process.argv[3] ?? 30);

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

push("Incremental Recovery Production Integration Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
push(`STEP0. Population: ${allSnaps.length} real snapshots total; ${subsample.length}-snapshot stride-sample used for the N=${N_TRIALS}-trial comparison (project-standard cost-driven subsample).`);
push("STEP1. Production wiring: fiveByFiveEdges.ts's tryFixWing() gained an optional perCallBudgetMs param (byte-identical to pre-Sprint behavior when omitted); fiveByFiveEdgeExecutor.ts's runPrimaryPipeline()/executeTask() thread FIXED_BUDGET_MS=140 through as the new real production default. Verified via git-stash type-check comparison: 192 errors both before and after (zero new).");
push("");

const libs = buildLibs();
const allPairs: PairedSolveResult[][] = [];
const trialAggregates: TrialAggregate[] = [];
const regressionPerTrial: RegressionClassification[] = [];

for (let trial = 0; trial < N_TRIALS; trial++) {
  log(`Trial ${trial + 1}/${N_TRIALS}...`);
  const pairs = runOneTrial(subsample, libs);
  allPairs.push(pairs);
  trialAggregates.push(summarizeTrial(pairs));
  regressionPerTrial.push(classifyRegressions(pairs));
}

push(`STEP2-3. End-to-End Runtime + Capability Validation (${N_TRIALS} trials, ${subsample.length} snapshots each):`);
const avgBaselineImproved = trialAggregates.reduce((a, t) => a + t.baselineImprovedCount, 0) / N_TRIALS;
const avgCandidateImproved = trialAggregates.reduce((a, t) => a + t.candidateImprovedCount, 0) / N_TRIALS;
const avgBaselineSolved = trialAggregates.reduce((a, t) => a + t.baselineSolvedCount, 0) / N_TRIALS;
const avgCandidateSolved = trialAggregates.reduce((a, t) => a + t.candidateSolvedCount, 0) / N_TRIALS;
const avgBaselineWallMs = trialAggregates.reduce((a, t) => a + t.baselineAvgWallMs, 0) / N_TRIALS;
const avgCandidateWallMs = trialAggregates.reduce((a, t) => a + t.candidateAvgWallMs, 0) / N_TRIALS;
const avgBaselineDeadlineMiss = trialAggregates.reduce((a, t) => a + t.baselineDeadlineMissRate, 0) / N_TRIALS;
const avgCandidateDeadlineMiss = trialAggregates.reduce((a, t) => a + t.candidateDeadlineMissRate, 0) / N_TRIALS;
const avgBaselineTaskActive = trialAggregates.reduce((a, t) => a + t.baselineTaskActiveRate, 0) / N_TRIALS;
const avgCandidateTaskActive = trialAggregates.reduce((a, t) => a + t.candidateTaskActiveRate, 0) / N_TRIALS;
push(`  avg whole-cube-improved count: baseline=${avgBaselineImproved.toFixed(2)}/${subsample.length}, candidate=${avgCandidateImproved.toFixed(2)}/${subsample.length}`);
push(`  avg whole-cube-solved count: baseline=${avgBaselineSolved.toFixed(2)}/${subsample.length}, candidate=${avgCandidateSolved.toFixed(2)}/${subsample.length}`);
push(`  avg Runtime: baseline=${avgBaselineWallMs.toFixed(1)}ms, candidate=${avgCandidateWallMs.toFixed(1)}ms`);
push(`  avg Deadline Miss rate: baseline=${(avgBaselineDeadlineMiss * 100).toFixed(2)}%, candidate=${(avgCandidateDeadlineMiss * 100).toFixed(2)}%`);
push(`  avg task-active rate (task-level capability proxy): baseline=${(avgBaselineTaskActive * 100).toFixed(2)}%, candidate=${(avgCandidateTaskActive * 100).toFixed(2)}%`);
push(`  Deferred Reject: not-applicable-at-this-layer (Visited Registry untouched)`);
push("");

push("STEP4. Regression Analysis (avg across trials):");
const avgTrueReg = regressionPerTrial.reduce((a, r) => a + r.trueRegressionRate, 0) / N_TRIALS;
const avgDupSuccess = regressionPerTrial.reduce((a, r) => a + r.duplicateSuccessRate, 0) / N_TRIALS;
const avgIncrOnly = regressionPerTrial.reduce((a, r) => a + r.incrementalRecoveryOnlySuccessRate, 0) / N_TRIALS;
const avgAbortReg = regressionPerTrial.reduce((a, r) => a + r.abortRegressionRate, 0) / N_TRIALS;
push(`  True Regression rate: ${(avgTrueReg * 100).toFixed(2)}%`);
push(`  Duplicate Success rate: ${(avgDupSuccess * 100).toFixed(2)}%`);
push(`  Incremental-Recovery-Only Success rate: ${(avgIncrOnly * 100).toFixed(2)}%`);
push(`  Abort Regression rate (aliased to True Regression, see file header): ${(avgAbortReg * 100).toFixed(2)}%`);
push("");

log("STEP5: Standard Evaluation...");
const evaluation = runStandardEvaluation(trialAggregates);
push(`STEP5. Standard Evaluation (paired-diff across N=${N_TRIALS} trials):`);
push(`  Primary (whole-cube-improved count diff): mean=${evaluation.primary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.primary.stats.ciLower.toFixed(3)}, ${evaluation.primary.stats.ciUpper.toFixed(3)}], Cohen's d_z=${evaluation.primary.effectSize.cohensD.toFixed(3)} (${evaluation.primary.effectSize.magnitude})`);
push(`  Secondary (whole-cube-solved count diff): mean=${evaluation.secondary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.secondary.stats.ciLower.toFixed(3)}, ${evaluation.secondary.stats.ciUpper.toFixed(3)}]`);
push(`  Integration Runtime (avg wall ms diff): mean=${evaluation.integrationRuntime.stats.mean.toFixed(2)}ms, 95% CI=[${evaluation.integrationRuntime.stats.ciLower.toFixed(2)}, ${evaluation.integrationRuntime.stats.ciUpper.toFixed(2)}]`);
push(`  Integration Deadline Miss (rate diff, pp): mean=${evaluation.integrationDeadlineMiss.stats.mean.toFixed(2)}pp, 95% CI=[${evaluation.integrationDeadlineMiss.stats.ciLower.toFixed(2)}, ${evaluation.integrationDeadlineMiss.stats.ciUpper.toFixed(2)}]`);
push("");

log("STEP6: Production Readiness Review...");
const readiness = analyzeProductionReadiness(trialAggregates, regressionPerTrial, evaluation);
push("STEP6. Production Readiness Review + Level 1-3 Judgment:");
push(`  Level1 (Production Integration works): ${readiness.level1Pass ? "PASS" : "FAIL"}`);
push(`    ${readiness.level1Detail}`);
push(`  Level2 (140ms Contract reproduced, Compliance >=99%): ${readiness.level2Pass ? "PASS" : "FAIL"}`);
push(`    ${readiness.level2Detail}`);
push(`  Level3 (net capability gain, no Regression increase): ${readiness.level3Pass ? "PASS" : "FAIL"}`);
push(`    ${readiness.level3Detail}`);
push("");
push(`  Prototype-vs-Production error: production True Regression rate ${(readiness.prototypeVsProductionError.productionTrueRegressionRate * 100).toFixed(2)}% vs Prototype's own ${(readiness.prototypeVsProductionError.prototypeTrueRegressionRate * 100).toFixed(2)}% (abs error ${readiness.prototypeVsProductionError.absoluteErrorPp.toFixed(2)}pp)`);
push(`    ${readiness.prototypeVsProductionError.note}`);
push("");
push(`DECISION: ${readiness.decision}`);
push(`  ${readiness.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${readiness.decision}`);
