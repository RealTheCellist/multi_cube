// Parity-Gated Cycle Integration Architecture Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleIntegrationArchitectureAnalysisV1.ts
//
// Read-only Sprint: NO production file is modified. Determines whether
// PARITY_GATED_CYCLE's Capability absence (offered=0/142 in the
// Production Integration Sprint's real Replay) is structurally caused by
// Gate design, Budget Competition with CCR, Scheduler Position/Ordering,
// or the Primitive itself -- via real onEvent timeline instrumentation
// (STEP1/2), real Counterfactual Scheduler Replay (STEP3), real Dedicated
// Budget Simulation at the fixed real position (STEP4), a real Gate Audit
// funnel (STEP5), and a Root Cause Matrix (STEP6) combining all of the
// above per-case. See
// docs/PARITY_GATED_CYCLE_INTEGRATION_ARCHITECTURE_ANALYSIS.md for the
// full STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { collectTimelines, ALL_RECOVERY_TYPES } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/RecoveryTimelineCollector";
import { analyzeBudgetConsumption } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/BudgetConsumptionAnalyzer";
import { replayAllOptions } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/CounterfactualSchedulerReplay";
import { replayAllBudgetPolicies } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/DedicatedBudgetSimulation";
import { auditGateFunnel } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/GateAudit";
import { buildRootCauseMatrix, DEFICIENCY_CAUSES } from "./solverPrimitiveParityGatedCycleIntegrationArchitecture/RootCauseMatrix";

const DATA_DIR = "src/customCube/solverPrimitiveParityGatedCycleIntegrationArchitecture/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-integration-architecture-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-integration-architecture-analysis-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- no new dataset, n=142)...");
  const holes = loadRawHoleDataset();

  console.log(`STEP1: Recovery Timeline 계측 (real attemptRecovery()-equivalent call, n=${holes.length})...`);
  const timelines = collectTimelines(holes, libs);

  console.log("STEP2: Budget Consumption Attribution...");
  const consumption = analyzeBudgetConsumption(timelines);
  for (const row of consumption) {
    console.log(`  [${row.type}] started=${row.startedCount}, avgRuntimeMs=${row.avgRuntimeMs.toFixed(1)}, p95RuntimeMs=${row.p95RuntimeMs.toFixed(1)}, avgRemainingAfterMs=${row.avgRemainingTimeAfterMs.toFixed(1)}, budgetShare=${row.budgetSharePercent.toFixed(2)}%`);
  }

  console.log("STEP3: Counterfactual Scheduler Replay (Options A/B/C, real re-execution)...");
  const optionResults = replayAllOptions(holes, libs);
  for (const option of Object.keys(optionResults) as (keyof typeof optionResults)[]) {
    const results = optionResults[option];
    const offered = results.filter((r) => r.offered.includes("PARITY_GATED_CYCLE")).length;
    const chosen = results.filter((r) => r.chosen === "PARITY_GATED_CYCLE").length;
    const avgImprovement = results.reduce((s, r) => s + r.expectedImprovement, 0) / results.length;
    console.log(`  [${option}] parityOffered=${offered}/${results.length}, parityChosen=${chosen}/${results.length}, avgExpectedImprovement=${avgImprovement.toFixed(2)}`);
  }

  console.log("STEP4: Dedicated Budget Simulation (same position, PARITY budget policy varies)...");
  const budgetResults = replayAllBudgetPolicies(holes, libs);
  for (const policy of Object.keys(budgetResults)) {
    const results = budgetResults[policy];
    const offered = results.filter((r) => r.parityOffered).length;
    const chosen = results.filter((r) => r.parityChosen).length;
    console.log(`  [policy=${policy}] parityOffered=${offered}/${results.length}, parityChosen=${chosen}/${results.length}`);
  }

  console.log("STEP5: Gate Audit (Funnel: Gate PASS -> Offered -> Budget 부족 / Primitive 실패 -> 선택)...");
  const funnel = auditGateFunnel(holes, timelines);
  console.log(`  totalCases=${funnel.totalCases}, gatePass=${funnel.gatePassCount}, offered=${funnel.offeredCount}, budgetInsufficient=${funnel.budgetInsufficientCount}, primitiveFailure=${funnel.primitiveFailureCount}, chosen=${funnel.chosenCount}`);

  console.log("STEP6: Root Cause Matrix (Gate Miss / Budget Starvation / Scheduler Ordering / Primitive Failure / Candidate Selection)...");
  const { perCase, matrix } = buildRootCauseMatrix(holes, timelines, libs);
  console.log(`  totalCases=${matrix.totalCases}, deficiencyPopulation=${matrix.deficiencyPopulation}`);
  for (const cause of Object.keys(matrix.counts) as (keyof typeof matrix.counts)[]) {
    console.log(`  [${cause}] count=${matrix.counts[cause]}, %ofTotal=${matrix.percentOfTotal[cause].toFixed(1)}%`);
  }
  console.log(`  dominantDeficiencyCause=${matrix.dominantDeficiencyCause}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Integration Architecture Analysis Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length}`);
  push();
  push("STEP1/2. Recovery Timeline + Budget Consumption Attribution");
  push(`  RecoveryType candidates measured: ${ALL_RECOVERY_TYPES.join(", ")}`);
  for (const row of consumption) {
    push(`  [${row.type}] started=${row.startedCount}, avgRuntimeMs=${row.avgRuntimeMs.toFixed(1)}, p95RuntimeMs=${row.p95RuntimeMs.toFixed(1)}, avgRemainingTimeAfterMs=${row.avgRemainingTimeAfterMs.toFixed(1)}, budgetSharePercent=${row.budgetSharePercent.toFixed(2)}%`);
  }
  push();
  push("STEP3. Counterfactual Scheduler Replay (real re-execution, same wall-clock budgets, order only varies)");
  for (const option of Object.keys(optionResults) as (keyof typeof optionResults)[]) {
    const results = optionResults[option];
    const offered = results.filter((r) => r.offered.includes("PARITY_GATED_CYCLE")).length;
    const chosen = results.filter((r) => r.chosen === "PARITY_GATED_CYCLE").length;
    const avgImprovement = results.reduce((s, r) => s + r.expectedImprovement, 0) / results.length;
    const avgRuntime = results.reduce((s, r) => s + r.totalRuntimeMs, 0) / results.length;
    push(`  [${option}] parityOffered=${offered}/${results.length}, parityChosen=${chosen}/${results.length}, avgExpectedImprovement=${avgImprovement.toFixed(2)}, avgRuntimeMs=${avgRuntime.toFixed(1)}`);
  }
  push();
  push("STEP4. Dedicated Budget Simulation (position fixed at real production order, PARITY budget policy swept)");
  for (const policy of Object.keys(budgetResults)) {
    const results = budgetResults[policy];
    const offered = results.filter((r) => r.parityOffered).length;
    const chosen = results.filter((r) => r.parityChosen).length;
    push(`  [policy=${policy}] parityOffered=${offered}/${results.length}, parityChosen=${chosen}/${results.length}`);
  }
  push();
  push("STEP5. Gate Audit Funnel");
  push(`  totalCases=${funnel.totalCases}`);
  push(`  gatePassCount(componentCount>1)=${funnel.gatePassCount}`);
  push(`  offeredCount(=Primitive 성공, see GateAudit.ts disclosure)=${funnel.offeredCount}`);
  push(`  budgetInsufficientCount(remainingTimeBefore<500ms)=${funnel.budgetInsufficientCount}`);
  push(`  primitiveFailureCount(remainingTimeBefore>=500ms, still not offered)=${funnel.primitiveFailureCount}`);
  push(`  chosenCount=${funnel.chosenCount}`);
  push();
  push("STEP6. Root Cause Matrix");
  push(`  totalCases=${matrix.totalCases}, deficiencyPopulation(=totalCases-RESOLVED)=${matrix.deficiencyPopulation}`);
  for (const cause of Object.keys(matrix.counts) as (keyof typeof matrix.counts)[]) {
    push(`  [${cause}] count=${matrix.counts[cause]}, %ofTotal=${matrix.percentOfTotal[cause].toFixed(1)}%`);
  }
  push(`  %ofDeficiency (excludes RESOLVED):`);
  for (const cause of DEFICIENCY_CAUSES) {
    push(`    [${cause}] ${matrix.percentOfDeficiency[cause].toFixed(1)}%`);
  }
  push(`  dominantDeficiencyCause=${matrix.dominantDeficiencyCause}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        consumption,
        optionResults,
        budgetResults,
        funnel,
        perCase,
        matrix,
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
