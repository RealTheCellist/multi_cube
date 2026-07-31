// Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Production
// Integration Planning Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleIntegrationPlanningV1.ts
//
// Determines WHERE/WHEN/UNDER-WHAT-CONDITIONS the Prototype Sprint v1
// Decision-A Cross-Component Bridge Cycle Resolver should be called from
// the real Production Recovery Pipeline. Production code is never edited
// -- every "insertion"/"competition"/"integration" here is a counterfactual
// computed by THIS Sprint's own code, calling the real, unmodified
// generateRecoveryStrategies()/chooseBestRecovery()/
// tryCrossComponentBridgeCycleResolver() read-only. See
// docs/PARITY_GATED_CYCLE_INTEGRATION_PLANNING_V1.md for the full
// STEP1-6 narrative and the Level1-5 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { loadUnknownPopulation } from "./parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { measureRecoveryFlow, summarizeByType } from "./parityGatedCycleIntegrationPlanningV1/RecoveryAnalysis";
import { analyzeInsertionPositions, summarizeByPosition } from "./parityGatedCycleIntegrationPlanningV1/InsertionPointAnalysis";
import { analyzeGates, summarizeGates } from "./parityGatedCycleIntegrationPlanningV1/GateAnalysis";
import { runBudgetSweep } from "./parityGatedCycleIntegrationPlanningV1/BudgetSweep";
import { runCompetitionAnalysis, summarizeCompetition } from "./parityGatedCycleIntegrationPlanningV1/CompetitionAnalysis";
import { runIntegrationSimulation } from "./parityGatedCycleIntegrationPlanningV1/IntegrationSimulation";
import { buildPairedComparison, runValidationFramework } from "./parityGatedCycleIntegrationPlanningV1/StatisticalValidation";
import { decideIntegrationContract } from "./parityGatedCycleIntegrationPlanningV1/IntegrationContract";

const DATA_DIR = "src/customCube/parityGatedCycleIntegrationPlanningV1/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-integration-planning-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-integration-planning-v1-result.json`;
const REALISTIC_INTEGRATED_BUDGET_MS = 500; // SETUP's own reserved-slice size -- largest realistic Recovery-layer budget already in production

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("STEP1: Recovery Pipeline analysis (real generateRecoveryStrategies+onEvent instrumentation, full 142-case Hole Dataset)...");
  const allHoles = loadRawHoleDataset();
  const flowRows = measureRecoveryFlow(allHoles, libs);
  const typeSummaries = summarizeByType(flowRows);
  for (const t of typeSummaries) {
    console.log(`  [${t.type}] generatedRate=${(t.generatedRate * 100).toFixed(1)}%, winRateAmongGenerated=${(t.winRateAmongGenerated * 100).toFixed(1)}%, avgOwnMs=${t.avgOwnMsAmongGenerated.toFixed(1)}`);
  }

  console.log("STEP2: Insertion-point Counterfactual analysis (real Unknown Population 53건, 5 positions)...");
  const unknownCases = loadUnknownPopulation();
  const insertionResults = analyzeInsertionPositions(unknownCases, libs);
  const positionSummaries = summarizeByPosition(insertionResults);
  for (const p of positionSummaries) {
    console.log(`  [${p.position}] rescueRate=${(p.rescueRate * 100).toFixed(1)}%, winRateAmongProduced=${(p.winRateAmongProduced * 100).toFixed(1)}%, avgWallMs=${p.avgWallMs.toFixed(0)}, deadlineMiss=${p.deadlineMissCount}/${p.n}`);
  }

  console.log("STEP3: Gate design comparison (full 142-case Hole Dataset, 4 candidate Gates)...");
  const gateResults = analyzeGates(allHoles, libs.lib);
  const gateSummaries = summarizeGates(gateResults, allHoles.length);
  for (const g of gateSummaries) {
    console.log(`  [${g.gate}] coverage=${(g.coverage * 100).toFixed(1)}%, improvedCount=${g.improvedCount}, precision=${(g.precisionAmongMatched * 100).toFixed(1)}%, avgRuntimeMs=${g.avgRuntimeMsAmongMatched.toFixed(0)}`);
  }

  console.log("STEP4: Budget sweep (40/80/120/160/200ms, real Unknown Population 53건)...");
  const budgetResults = runBudgetSweep(unknownCases, libs.lib);
  for (const b of budgetResults) {
    console.log(`  [${b.budgetMs}ms] improved=${b.summary.improvedCount}, rescueRate=${(b.summary.rescueRate * 100).toFixed(1)}%, trueRegression=${b.summary.trueRegressionCount}, deadlineMiss=${b.deadlineMissCount}/${b.summary.n}, avgRuntimeMs=${b.summary.avgRuntimeMs.toFixed(1)}`);
  }

  console.log("STEP5: Competition analysis vs existing Primitives (full 142-case Hole Dataset, 2 realistic budgets)...");
  const competitionByBudget = [300, 500].map((budgetMs) => {
    const rounds = runCompetitionAnalysis(allHoles, libs, budgetMs);
    const { stats, avgScoreGap } = summarizeCompetition(rounds);
    console.log(`  budget=${budgetMs}ms: avgScoreGap=${avgScoreGap.toFixed(2)}`);
    for (const s of stats) {
      console.log(`    [${s.type}] offered=${s.offeredCount}, chosen=${s.chosenCount}, chosenRate=${(s.chosenRate * 100).toFixed(1)}%, starved=${s.starved}, duplicate=${s.duplicateCount}`);
    }
    return { budgetMs, rounds, stats, avgScoreGap };
  });

  console.log(`STEP6: Integration Simulation (Baseline vs Integrated @ ${REALISTIC_INTEGRATED_BUDGET_MS}ms realistic budget, full 142-case Hole Dataset) + Statistical Validation...`);
  const simulation = runIntegrationSimulation(allHoles, libs, REALISTIC_INTEGRATED_BUDGET_MS);
  const pairedComparison = buildPairedComparison(simulation.baseline, simulation.integrated);
  const competitionForGates = competitionByBudget.find((c) => c.budgetMs === REALISTIC_INTEGRATED_BUDGET_MS)!.stats;
  const framework = runValidationFramework(pairedComparison, competitionForGates);
  console.log(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  console.log(`  pipeline decision=${framework.pipelineResult.decision}`);

  const finalContract = decideIntegrationContract(positionSummaries, gateSummaries, budgetResults, competitionForGates, pairedComparison, framework);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Production Integration Planning Sprint v1 -- Report ===");
  push();
  push("STEP1. Recovery Pipeline Analysis (real instrumented replay, n=142)");
  for (const t of typeSummaries) {
    push(`  [${t.type}] generated=${t.generatedCount}/142(${(t.generatedRate * 100).toFixed(1)}%), empty=${t.emptyCount}, skipped=${t.skippedCount}, chosen=${t.chosenCount}, winRateAmongGenerated=${(t.winRateAmongGenerated * 100).toFixed(1)}%, avgOwnMs=${t.avgOwnMsAmongGenerated.toFixed(1)}`);
  }
  push();
  push("STEP2. Insertion Point Analysis (real Unknown Population, n=53 per position)");
  for (const p of positionSummaries) {
    push(`  [${p.position}] budget=${p.budgetMs}ms, produced=${p.producedCount}/${p.n}(${(p.rescueRate * 100).toFixed(1)}%), wouldWin=${p.wouldWinCount}(${(p.winRateAmongProduced * 100).toFixed(1)}% of produced), avgWallMs=${p.avgWallMs.toFixed(0)}, deadlineMiss=${p.deadlineMissCount}`);
  }
  push();
  push("STEP3. Gate Design Comparison (full Hole Dataset, n=142)");
  for (const g of gateSummaries) {
    push(`  [${g.gate}] coverage=${g.matchedCount}/142(${(g.coverage * 100).toFixed(1)}%), improved=${g.improvedCount}, precision=${(g.precisionAmongMatched * 100).toFixed(1)}%, avgRuntimeMsAmongMatched=${g.avgRuntimeMsAmongMatched.toFixed(0)}`);
  }
  push();
  push("STEP4. Budget Sweep (real Unknown Population, n=53)");
  for (const b of budgetResults) {
    push(`  [${b.budgetMs}ms] improved=${b.summary.improvedCount}/53(${(b.summary.rescueRate * 100).toFixed(1)}%), trueRegression=${b.summary.trueRegressionCount}, deadlineMiss=${b.deadlineMissCount}, avgRuntimeMs=${b.summary.avgRuntimeMs.toFixed(1)}`);
  }
  push();
  push("STEP5. Competition Analysis (full Hole Dataset, n=142)");
  for (const c of competitionByBudget) {
    push(`  budget=${c.budgetMs}ms, avgScoreGap=${c.avgScoreGap.toFixed(2)}`);
    for (const s of c.stats) {
      push(`    [${s.type}] offered=${s.offeredCount}, chosen=${s.chosenCount}, chosenRate=${(s.chosenRate * 100).toFixed(1)}%, starved=${s.starved}, duplicate=${s.duplicateCount}`);
    }
  }
  push();
  push("STEP6. Integration Simulation + Statistical Validation");
  push(`  n=${pairedComparison.n}, realistic budget=${REALISTIC_INTEGRATED_BUDGET_MS}ms`);
  push(`  improvedCount paired-diff: mean=${pairedComparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${pairedComparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${pairedComparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's dz=${pairedComparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}`);
  push(`  trueRegression paired-diff: mean=${pairedComparison.trueRegressionDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${pairedComparison.trueRegressionDiffEvaluation.stats.ciLower.toFixed(4)}, ${pairedComparison.trueRegressionDiffEvaluation.stats.ciUpper.toFixed(4)}]`);
  push(`  runtime paired-diff(ms): mean=${pairedComparison.runtimeDiffMsEvaluation.stats.mean.toFixed(2)}`);
  push(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  push(`  pipeline decision=${framework.pipelineResult.decision}, rationale=${framework.pipelineResult.decisionRationale}`);
  push();
  push("Level1-5 + Final Decision");
  for (const l of finalContract.levels) {
    push(`  Level${l.level}(${l.label}): ${l.pass ? "PASS" : "FAIL"} -- ${l.detail}`);
  }
  push(`  Decision: ${finalContract.decision}`);
  push(`  Rationale: ${finalContract.rationale}`);
  push();
  push("Integration Contract");
  push(`  position=${finalContract.contract.position}`);
  push(`  gate=${finalContract.contract.gate}`);
  push(`  budgetMs=${finalContract.contract.budgetMs ?? "미확정"}`);
  push(`  priority=${finalContract.contract.priority}`);
  push(`  fallback=${finalContract.contract.fallback}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        typeSummaries,
        positionSummaries,
        gateSummaries,
        budgetResults: budgetResults.map((b) => ({ budgetMs: b.budgetMs, summary: b.summary, deadlineMissCount: b.deadlineMissCount })),
        competitionByBudget: competitionByBudget.map((c) => ({ budgetMs: c.budgetMs, stats: c.stats, avgScoreGap: c.avgScoreGap })),
        pairedComparison,
        gateResults: framework.gateResults,
        pipelineResult: framework.pipelineResult,
        finalContract,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
