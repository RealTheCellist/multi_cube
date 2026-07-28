// Move Representation Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runMoveRepresentationPrototypeSprintV1.ts
//
// Research Prototype (NOT integrated into production): validates whether
// Move Representation Blueprint Sprint v1's "Adaptive Cycle Rotation via
// Commutator composition" mechanism actually improves Solver Capability,
// with a low-side-effect footprint, and without regressions -- using a
// standalone module never wired into Recovery/Executor/Planner.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { runAdaptiveCycleCommutator } from "./moveRepresentationPrototype/AdaptiveCycleCommutatorPrototype";
import { summarizeCapability, type CaseResult } from "./moveRepresentationPrototype/CapabilityEvaluation";
import { summarizeSideEffect } from "./moveRepresentationPrototype/SideEffectEvaluation";
import { summarizeSearchCost } from "./moveRepresentationPrototype/SearchCostEvaluation";
import { tallyFailures } from "./moveRepresentationPrototype/FailureAnalysis";
import { analyzeRegression } from "./moveRepresentationPrototype/RegressionAnalysis";
import { assessPrototype } from "./moveRepresentationPrototype/PrototypeAssessment";

const DATA_DIR = "src/customCube/moveRepresentationPrototype/data";
const REPORT_PATH = `${DATA_DIR}/move-representation-prototype-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/move-representation-prototype-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-prototype.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const EVAL_BUDGET_MS = 5000; // this research arc's own established "extended budget" convention

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface StoredCaseResult extends CaseResult {
  runtimeMs: number;
}

function loadCheckpoint(): { completedLabels: string[]; rows: StoredCaseResult[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: StoredCaseResult[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  log("init", `loaded ${holes.length} holes`);

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;

  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label)); // all 53 residual
  const regressionLabels = new Set(coverageRows.filter((r) => r.unionCovered).map((r) => r.label));
  log("init", `Primary=${primaryLabels.size}, Secondary(all residual)=${secondaryLabels.size}, Regression(Union Covered)=${regressionLabels.size}`);

  function tagOf(label: string): CaseResult["populationTag"] {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  }

  log("eval", `running Adaptive Cycle Commutator @ ${EVAL_BUDGET_MS}ms on all ${holes.length} cases...`);
  let { completedLabels, rows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("eval", `resuming: ${completedLabels.length}/${holes.length} done`);
  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const clone = cloneCubies(h.cubies as Cubie[]);
    const t0 = Date.now();
    const result = runAdaptiveCycleCommutator(clone, libs.lib, Date.now() + EVAL_BUDGET_MS);
    const runtimeMs = Date.now() - t0;
    rows.push({ label: h.label, populationTag: tagOf(h.label), result, runtimeMs });
    completedLabels.push(h.label);
    completedSet.add(h.label);
    if (completedLabels.length % 10 === 0) saveCheckpoint(completedLabels, rows);
  }
  saveCheckpoint(completedLabels, rows);
  log("eval", "done");

  const primaryRows = rows.filter((r) => r.populationTag === "PRIMARY");
  const secondaryRows = rows.filter((r) => primaryLabels.has(r.label) || secondaryLabels.has(r.label));
  const regressionRows = rows.filter((r) => regressionLabels.has(r.label));

  const primaryCapability = summarizeCapability("PRIMARY (PURE_CYCLE_ISOLATION)", primaryRows, 0); // CCR's own known baseline on this population is 0/28 by definition (it's the residual)
  const secondaryCapability = summarizeCapability("SECONDARY (all 53 residual)", secondaryRows, 0);
  const regressionCapability = summarizeCapability("REGRESSION (89 Union Covered)", regressionRows, regressionRows.length); // baseline here is "already 100% solved elsewhere"

  const sideEffect = summarizeSideEffect(primaryRows);
  const searchCost = summarizeSearchCost(primaryRows);
  const failureTally = tallyFailures(primaryRows);
  const regressionAnalysis = analyzeRegression(regressionRows);
  const assessment = assessPrototype(primaryCapability, sideEffect, regressionAnalysis);

  const lines: string[] = [];
  lines.push("Move Representation Prototype Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Prototype Capability Report + Coverage Comparison");
  for (const summary of [primaryCapability, secondaryCapability, regressionCapability]) {
    lines.push(`  ${summary.populationTag}: n=${summary.n}, solved=${summary.solvedCount} (${(summary.successRate * 100).toFixed(1)}%), baseline=${summary.baselineSolvedCount}, ΔCoverage=${summary.coverageDelta}`);
  }
  lines.push("");

  lines.push("2. Representation Validation (per-case, PRIMARY population)");
  for (const r of primaryRows) {
    lines.push(
      `  ${r.label}: solved=${!!r.result.moves}, cycleLength=${r.result.cycleLength}, leavesExplored=${r.result.leavesExplored}, affectedWingCount=${r.result.affectedWingCount ?? "N/A"}, setupLabel=${r.result.setupLabel ?? "N/A"}, runtime=${r.runtimeMs}ms`
    );
  }
  lines.push("");

  lines.push("3. Side Effect Analysis (solved PRIMARY cases only)");
  lines.push(`  n=${sideEffect.n}, avgAffectedWingCount=${sideEffect.avgAffectedWingCount.toFixed(2)}, avgCycleLength=${sideEffect.avgCycleLength.toFixed(2)}, avgFootprintRatio=${sideEffect.avgFootprintRatio.toFixed(2)}`);
  lines.push(`  Blueprint target (footprintRatio<=2.0) achieved: ${sideEffect.blueprintTargetAchievedCount}/${sideEffect.n} (${(sideEffect.blueprintTargetAchievedRate * 100).toFixed(1)}%)`);
  lines.push("");

  lines.push("4. Search Cost (PRIMARY population)");
  lines.push(`  avgLeavesExplored=${searchCost.avgLeavesExplored.toFixed(1)}, avgMaxDepthReached=${searchCost.avgMaxDepthReached.toFixed(1)}, avgRuntimeMs=${searchCost.avgRuntimeMs.toFixed(0)}`);
  lines.push("");

  lines.push("5. Failure Analysis (PRIMARY population)");
  for (const t of failureTally) {
    lines.push(`  ${t.reason}: ${t.count}/${primaryRows.length}`);
    if (t.reason !== "SOLVED") lines.push(`    labels: ${t.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("6. Regression Report (89 Union Covered cases)");
  lines.push(`  n=${regressionAnalysis.n}, regressionCount=${regressionAnalysis.regressionCount}, incidentalSolveCount=${regressionAnalysis.incidentalSolveCount}, cleanCount=${regressionAnalysis.cleanCount}`);
  lines.push("");

  lines.push("7. Prototype Assessment");
  lines.push(`  decision: ${assessment.decision}`);
  lines.push(`  decisionLabel: ${assessment.decisionLabel}`);
  lines.push(`  capabilityPass=${assessment.capabilityPass}, sideEffectPass=${assessment.sideEffectPass}, regressionPass=${assessment.regressionPass}, integrationPass=${assessment.integrationPass}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      { primaryCapability, secondaryCapability, regressionCapability, sideEffect, searchCost, failureTally, regressionAnalysis, assessment, primaryRows, regressionRows: regressionRows.slice(0, 20) },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
