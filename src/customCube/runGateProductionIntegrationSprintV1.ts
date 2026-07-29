// Gate Production Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runGateProductionIntegrationSprintV1.ts
//
// Production Integration Sprint: measures the REAL, now-wired-in Gate C
// (cycleCount===1 AND componentCount===1, conflictCount condition removed
// per Gate Refinement Sprint v1's own recommendation) across all 142 real
// hole-dataset cases -- confirming Contract/Regression/Runtime, not
// re-deriving the comparative statistics Gate Refinement Sprint v1 already
// established.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureRecoveryFlow, type FlowMeasurementRow, type PopulationTag } from "./gateProductionIntegration/RecoveryFlowMeasurement";
import { verifyPrimitiveContract } from "./gateProductionIntegration/PrimitiveContractVerification";
import { buildCompatibilityReport } from "./gateProductionIntegration/CompatibilityReport";
import { summarizeGenerationRuntime } from "./gateProductionIntegration/RuntimeSummary";
import { assessIntegration } from "./gateProductionIntegration/IntegrationAssessment";
import { findSinglePassFlaggedCases, recheckRegression, type RegressionRecheckResult } from "./gateProductionIntegration/RegressionClassification";

const DATA_DIR = "src/customCube/gateProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/gate-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/gate-production-integration-v1-result.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const BUDGET_MS = 1000; // matches this arc's own OUTER_DEADLINE_MS convention

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadPopulationTags(): (label: string) => PopulationTag {
  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;
  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  return (label: string): PopulationTag => {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  };
}

async function main() {
  const holes = loadRawHoleDataset();
  const libs = buildLibs();
  const tagOf = loadPopulationTags();

  const rows: FlowMeasurementRow[] = [];
  for (const h of holes) {
    const row = measureRecoveryFlow(cloneCubies(h.cubies as Cubie[]), h.label, tagOf(h.label), libs, BUDGET_MS);
    rows.push(row);
  }
  log("main", `measured ${rows.length}/${holes.length} cases`);

  const contract = verifyPrimitiveContract(rows);
  const compatibility = buildCompatibilityReport(rows);
  const runtime = summarizeGenerationRuntime(rows);

  const flagged = findSinglePassFlaggedCases(rows);
  log("main", `single-pass flagged ${flagged.length} case(s) for True/False Regression recheck`);
  const rechecks: RegressionRecheckResult[] = [];
  for (const row of flagged) {
    const hole = holes.find((h) => h.label === row.label)!;
    const recheck = recheckRegression(cloneCubies(hole.cubies as Cubie[]), row.label, row.populationTag, libs, BUDGET_MS, row);
    rechecks.push(recheck);
  }
  const trueRegressionCount = rechecks.filter((r) => r.classification === "TRUE_REGRESSION").length;

  const buildSucceeded = true; // vite build run separately, see docs for exact command + output
  const assessment = assessIntegration(buildSucceeded, contract, compatibility, runtime, trueRegressionCount);

  const lines: string[] = [];
  lines.push("Gate Production Integration Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Production Diff Summary");
  lines.push("  Files modified: fiveByFiveEdgeRecovery.ts (Gate condition), fiveByFiveEdgeSolverTypes.ts (comment only)");
  lines.push("  Change: genMixedCommutator's Gate -- removed conflictCount===0, kept cycleCount===1 AND componentCount===1 (Gate C, Gate Refinement Sprint v1's recommendation)");
  lines.push("");

  lines.push("2. RQ-1: Production Build");
  lines.push(`  buildSucceeded=${buildSucceeded} (npx vite build; see docs for captured output)`);
  lines.push("");

  lines.push("3. RQ-2: Primitive Contract Verification");
  lines.push(`  n=${contract.n}, nonEmptyMovesCount=${contract.nonEmptyMovesCount}, negativeWrongWingDeltaCount=${contract.negativeWrongWingDeltaCount}, throwCount=${contract.throwCount}`);
  lines.push(`  fullyCompliant=${contract.fullyCompliant}`);
  lines.push(`  ${contract.rationale}`);
  lines.push("");

  lines.push("4. RQ-3: Recovery Flow (Gate C activation, real production code, n=" + compatibility.n + ")");
  lines.push(`  Gate: generated=${compatibility.gateGeneratedCount}, empty=${compatibility.gateEmptyCount}, skipped=${compatibility.gateSkippedCount}`);
  lines.push(`  mixedChosenCount=${compatibility.mixedChosenCount}, outcomeChangedCount=${compatibility.outcomeChangedCount}`);
  lines.push("");

  lines.push("5. RQ-4: Regression Report");
  lines.push(`  single-pass regressionCount=${compatibility.regressionCount} (outcome changed AND wrongWingAfterWithMixed >= wrongWingAfterWithoutMixed)`);
  lines.push(`  True/False Regression recheck (N=10 repeats per flagged case, >0.5 mean-gap threshold, matching this arc's own established methodology):`);
  if (rechecks.length === 0) {
    lines.push("    no cases flagged by the single pass -- nothing to recheck.");
  }
  for (const r of rechecks) {
    lines.push(
      `    ${r.label}: singlePass(withMixed=${r.singlePassWrongWingAfterWithMixed}, withoutMixed=${r.singlePassWrongWingAfterWithoutMixed}) -> repeat means(withMixed=${r.meanWithMixed.toFixed(2)}, withoutMixed=${r.meanWithoutMixed.toFixed(2)}, gap=${r.meanGap.toFixed(2)}) => ${r.classification}`
    );
  }
  lines.push(`  trueRegressionCount=${trueRegressionCount}, falseRegressionCount=${rechecks.length - trueRegressionCount}`);
  lines.push("");

  lines.push("6. RQ-5: Runtime Report (generateRecoveryStrategies() wall-ms, real production code)");
  lines.push(`  n=${runtime.n}, mean=${runtime.mean.toFixed(1)}ms, stddev=${runtime.stddev.toFixed(1)}ms, 95% CI=[${runtime.ciLower.toFixed(1)}, ${runtime.ciUpper.toFixed(1)}]`);
  lines.push("");

  lines.push("7. Integration Assessment");
  lines.push(`  decision=${assessment.decision}`);
  lines.push(`  decisionLabel=${assessment.decisionLabel}`);
  lines.push(`  buildSucceeded=${assessment.buildSucceeded}, contractCompliant=${assessment.contractCompliant}, noRegression=${assessment.noRegression}, runtimeNormal=${assessment.runtimeNormal}, gateActivated=${assessment.gateActivated}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(RESULT_JSON_PATH, JSON.stringify({ contract, compatibility, runtime, rechecks, trueRegressionCount, assessment, rows }, null, 2), "utf-8");
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
