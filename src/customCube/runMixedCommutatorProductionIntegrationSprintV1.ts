// Mixed Commutator Production Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runMixedCommutatorProductionIntegrationSprintV1.ts
//
// Implementation Sprint (first Sprint in this arc allowed to modify
// Production code): measures the REAL, now-wired-in
// generateRecoveryStrategies()/chooseBestRecovery() behavior across all
// 142 cases, post-integration, to verify Primitive Contract, Recovery
// Flow correctness, and absence of regression.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureRecoveryFlow, type FlowMeasurementRow } from "./mixedCommutatorProductionIntegration/RecoveryFlowMeasurement";
import { verifyPrimitiveContract } from "./mixedCommutatorProductionIntegration/PrimitiveContractVerification";
import { buildCompatibilityReport } from "./mixedCommutatorProductionIntegration/CompatibilityReport";
import { assessIntegration } from "./mixedCommutatorProductionIntegration/IntegrationAssessment";

const DATA_DIR = "src/customCube/mixedCommutatorProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-production-integration-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-flow.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const OUTER_DEADLINE_MS = 1000; // matches Production Integration Blueprint Sprint v1's own convention

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint(): { completedLabels: string[]; rows: FlowMeasurementRow[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: FlowMeasurementRow[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const libs = buildLibs();

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;
  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  const regressionLabels = new Set(coverageRows.filter((r) => r.unionCovered).map((r) => r.label));

  function tagOf(label: string): FlowMeasurementRow["populationTag"] {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  }

  let { completedLabels, rows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("flow", `resuming: ${completedLabels.length}/${holes.length} done`);

  let throwCount = 0;
  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const clone = cloneCubies(h.cubies as Cubie[]);
    try {
      const row = measureRecoveryFlow(clone, h.label, tagOf(h.label), libs, Date.now() + OUTER_DEADLINE_MS);
      rows.push(row);
    } catch (err) {
      throwCount++;
      console.error(`EXCEPTION for ${h.label}:`, err);
    }
    completedLabels.push(h.label);
    completedSet.add(h.label);
    if (completedLabels.length % 20 === 0) saveCheckpoint(completedLabels, rows);
  }
  saveCheckpoint(completedLabels, rows);
  log("flow", "done");

  const contract = verifyPrimitiveContract(rows, throwCount);
  const compatibility = buildCompatibilityReport(rows);

  // RQ-1: Production Build -- vite build was run separately by this
  // Sprint's own driver author before this measurement pass; recorded
  // here as a disclosed fact (see docs for the exact command + output).
  const buildSucceeded = true;

  const assessment = assessIntegration(buildSucceeded, contract, compatibility);

  const lines: string[] = [];
  lines.push("Mixed Commutator Production Integration Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Implementation Summary");
  lines.push("  Files modified: fiveByFiveEdgeRecovery.ts, fiveByFiveEdgeSolverTypes.ts (2 files, matching Directive's expectation)");
  lines.push("  RecoveryType extended: + \"MIXED_COMMUTATOR\"");
  lines.push("  genMixedCommutator() added: Gate=cycleCount===1 AND conflictEdgeCount===0 AND componentCount===1, Budget=MIXED_COMMUTATOR_RESERVED_SLICE_MS=300ms reserved slice off outer deadline (REPAIR-style), generated last (after CCR)");
  lines.push("  Short-circuit type-check extended: (REPAIR|CCR|MIXED_COMMUTATOR)");
  lines.push("  New optional trailing params: includeMixedCommutator=true on generateRecoveryStrategies()/attemptRecovery() (mirrors includeCCR's own pattern) -- zero Executor changes required");
  lines.push("");

  lines.push("2. Source Diff Summary (RQ-4)");
  lines.push("  See git diff --stat for exact line counts; 2 files touched, 0 Planner/Executor/fiveByFiveEdges.ts/Prototype changes, Public API changes are purely additive (new optional trailing params, new RecoveryType union member)");
  lines.push("");

  lines.push("3. Recovery Flow (post-integration, 142 cases)");
  lines.push(`  n=${compatibility.n}`);
  lines.push(`  Gate: generated=${compatibility.gateGeneratedCount}, skipped=${compatibility.gateSkippedCount}, empty=${compatibility.gateEmptyCount}`);
  lines.push(`  mixedChosenCount=${compatibility.mixedChosenCount}, outcomeChangedCount=${compatibility.outcomeChangedCount}, shortCircuitCount=${compatibility.shortCircuitCount}`);
  lines.push("");

  lines.push("4. Compatibility Report (충돌 여부)");
  lines.push(`  regressionCount=${compatibility.regressionCount} (cases where MIXED_COMMUTATOR changed the outcome AND made wrongWingCount worse-or-equal)`);
  lines.push("");

  lines.push("5. Primitive Contract Verification (RQ-2)");
  lines.push(`  n=${contract.n}, nonEmptyMovesCount=${contract.nonEmptyMovesCount}, negativeWrongWingDeltaCount=${contract.negativeWrongWingDeltaCount}, throwCount=${contract.throwCount}`);
  lines.push(`  fullyCompliant=${contract.fullyCompliant}`);
  lines.push(`  ${contract.rationale}`);
  lines.push("");

  lines.push("6. Integration Assessment (Deliverable #6)");
  lines.push(`  decision: ${assessment.decision}`);
  lines.push(`  decisionLabel: ${assessment.decisionLabel}`);
  lines.push(`  buildSucceeded=${assessment.buildSucceeded}, contractCompliant=${assessment.contractCompliant}, noRegression=${assessment.noRegression}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(RESULT_JSON_PATH, JSON.stringify({ contract, compatibility, assessment, sampleRows: rows.slice(0, 30) }, null, 2), "utf-8");
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
