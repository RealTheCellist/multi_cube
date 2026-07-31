// Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Production
// Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleProductionIntegrationV1.ts
//
// Wires Integration Planning Refinement Sprint v1's own confirmed
// Operating Contract (Position=after_CCR, Gate=componentCount>1,
// Budget=2000ms) into the REAL Production Recovery Pipeline
// (fiveByFiveEdgeRecovery.ts -- the ONLY production file this Sprint edits,
// plus the disclosed 1-line RecoveryType companion extension in
// fiveByFiveEdgeSolverTypes.ts, user-approved) and validates it via real
// attemptRecovery() replay (Recovery layer, this Sprint's own allowed
// integration layer) over the full 142-case Hole Dataset. See
// docs/PARITY_GATED_CYCLE_PRODUCTION_INTEGRATION_V1.md for the full
// STEP1-6 narrative and Level1-6 verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { auditPosition, auditGate, auditBudgetClamping } from "./parityGatedCycleProductionIntegrationV1/ContractAudit";
import { replayPopulation } from "./parityGatedCycleProductionIntegrationV1/Replay";
import { summarizeKpi } from "./parityGatedCycleProductionIntegrationV1/KPI";
import { summarizeCompetition } from "./parityGatedCycleProductionIntegrationV1/Competition";
import { buildPairedComparison, runValidationFramework } from "./parityGatedCycleProductionIntegrationV1/Statistics";
import { decideFinal } from "./parityGatedCycleProductionIntegrationV1/FinalDecision";

const DATA_DIR = "src/customCube/parityGatedCycleProductionIntegrationV1/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-production-integration-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- no new dataset, n=142)...");
  const holes = loadRawHoleDataset();

  console.log("STEP2: Contract Audit (Position/Gate/Budget, real production path)...");
  const position = auditPosition(holes[0].cubies, libs);
  const gate = auditGate(holes, libs);
  const budget = auditBudgetClamping(holes[0].cubies, libs);
  console.log(`  Position: ${position.pass} -- ${position.detail}`);
  console.log(`  Gate: ${gate.pass} -- ${gate.detail}`);
  console.log(`  Budget: ${budget.pass} -- ${budget.detail}`);

  console.log(`STEP3/4: Production Replay (real attemptRecovery(), n=${holes.length}, Baseline vs Integrated)...`);
  const pairs = replayPopulation(holes, libs);
  const kpi = summarizeKpi(pairs);
  console.log(`  baselineImproved=${kpi.baselineImprovedCount}, integratedImproved=${kpi.integratedImprovedCount}, netNewRescue=${kpi.netNewRescueCount}/${kpi.n}`);
  console.log(`  baselineRegression=${kpi.baselineRegressionCount}, integratedRegression=${kpi.integratedRegressionCount}`);
  console.log(`  runtimeMeanMs baseline=${kpi.runtimeMeanMsBaseline.toFixed(0)} integrated=${kpi.runtimeMeanMsIntegrated.toFixed(0)}, p95 baseline=${kpi.runtimeP95MsBaseline.toFixed(0)} integrated=${kpi.runtimeP95MsIntegrated.toFixed(0)}`);
  console.log(`  PARITY_GATED_CYCLE offered=${kpi.parityGatedCycleOfferedCount}, chosen=${kpi.parityGatedCycleChosenCount}, winRate=${(kpi.parityGatedCycleWinRate * 100).toFixed(1)}%, duplicate=${kpi.duplicateCount}, starved=${kpi.starved}`);

  console.log("STEP5: Competition Analysis (real solve()-adjacent traces, vs 5 other real RecoveryTypes)...");
  const competition = summarizeCompetition(pairs.map((p) => p.integrated));
  for (const s of competition.stats) {
    console.log(`  [${s.type}] offered=${s.offeredCount}, chosen=${s.chosenCount}, chosenRate=${(s.chosenRate * 100).toFixed(1)}%, replacedByPGC=${s.replacedByParityGatedCycleCount}`);
  }
  console.log(`  avgScoreGapWhenChosen=${competition.avgScoreGapWhenParityGatedCycleChosen.toFixed(2)}, avgScoreGapWhenLost=${competition.avgScoreGapWhenParityGatedCycleLost.toFixed(2)}`);

  console.log("STEP6: Statistical Validation (Validation Framework, Category C, production stage)...");
  const comparison = buildPairedComparison(pairs);
  const framework = runValidationFramework(comparison, kpi.duplicateCount, kpi.starved ? 1 : 0);
  console.log(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  console.log(`  pipeline decision=${framework.pipelineResult.decision}`);

  const finalDecision = decideFinal(position, gate, budget, kpi, competition, comparison, framework);
  console.log(`  Decision: ${finalDecision.decision}`);
  console.log(`  Rationale: ${finalDecision.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Production Integration Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length}`);
  push();
  push("STEP2. Contract Audit");
  push(`  Position(after_CCR): ${position.pass} -- ${position.detail}`);
  push(`  Gate(componentCount>1): ${gate.pass} -- ${gate.detail}`);
  push(`  Budget(2000ms clamping): ${budget.pass} -- ${budget.detail}`);
  push();
  push("STEP3/4. Production Replay + KPI (real attemptRecovery(), Baseline vs Integrated)");
  push(`  n=${kpi.n}`);
  push(`  baselineImproved=${kpi.baselineImprovedCount}, integratedImproved=${kpi.integratedImprovedCount}, netNewRescue=${kpi.netNewRescueCount}`);
  push(`  baselineRegression=${kpi.baselineRegressionCount}, integratedRegression=${kpi.integratedRegressionCount}`);
  push(`  runtimeMeanMs: baseline=${kpi.runtimeMeanMsBaseline.toFixed(1)}, integrated=${kpi.runtimeMeanMsIntegrated.toFixed(1)}`);
  push(`  runtimeP95Ms: baseline=${kpi.runtimeP95MsBaseline.toFixed(1)}, integrated=${kpi.runtimeP95MsIntegrated.toFixed(1)}`);
  push(`  deadlineMissCount: baseline=${kpi.deadlineMissCountBaseline}, integrated=${kpi.deadlineMissCountIntegrated}`);
  push(`  PARITY_GATED_CYCLE: offered=${kpi.parityGatedCycleOfferedCount}, chosen=${kpi.parityGatedCycleChosenCount}, winRate=${(kpi.parityGatedCycleWinRate * 100).toFixed(1)}%, duplicateCount=${kpi.duplicateCount}, starved=${kpi.starved}`);
  push();
  push("STEP5. Competition Analysis (real 6-way RecoveryType competition)");
  for (const s of competition.stats) {
    push(`  [${s.type}] offered=${s.offeredCount}, chosen=${s.chosenCount}, chosenRate=${(s.chosenRate * 100).toFixed(1)}%, replacedByPGC=${s.replacedByParityGatedCycleCount}`);
  }
  push(`  avgScoreGapWhenParityGatedCycleChosen=${competition.avgScoreGapWhenParityGatedCycleChosen.toFixed(2)}`);
  push(`  avgScoreGapWhenParityGatedCycleLost=${competition.avgScoreGapWhenParityGatedCycleLost.toFixed(2)}`);
  push();
  push("STEP6. Statistical Validation");
  push(`  improvedCount paired-diff: mean=${comparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's dz=${comparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}`);
  push(`  trueRegression paired-diff: mean=${comparison.trueRegressionDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${comparison.trueRegressionDiffEvaluation.stats.ciLower.toFixed(4)}, ${comparison.trueRegressionDiffEvaluation.stats.ciUpper.toFixed(4)}]`);
  push(`  runtime paired-diff(ms): mean=${comparison.runtimeDiffMsEvaluation.stats.mean.toFixed(2)}`);
  push(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  push(`  pipeline decision=${framework.pipelineResult.decision}, rationale=${framework.pipelineResult.decisionRationale}`);
  push();
  push("Level1-6 + Final Decision");
  for (const l of finalDecision.levels) {
    push(`  Level${l.level}(${l.label}): ${l.pass ? "PASS" : "FAIL"} -- ${l.detail}`);
  }
  push(`  Decision: ${finalDecision.decision}`);
  push(`  Rationale: ${finalDecision.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        position,
        gate,
        budget,
        kpi,
        competition,
        comparison,
        gateResults: framework.gateResults,
        pipelineResult: framework.pipelineResult,
        finalDecision,
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
