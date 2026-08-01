// PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1 -- driver.
//
// Usage:
//   npx tsx .../runParityGatedCycleValidationProtocolQualificationV1.ts
//
// Validation Qualification Sprint -- NO Production/Primitive/Budget/
// Scheduler/Validation Framework modification. Targets the 3 real
// known-effect cases this Sprint itself discovered via a full 49-case
// Gate-passing (componentCount>1) scan of the 142-case Hole Dataset at
// outer=2000ms: worstCase:5e5b20b, snapshot335:60b5c3b1,
// snapshot335:ad12c377.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { PARITY_MEASUREMENT_PATH_MATRIX } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/MeasurementPathAudit";
import { buildBudgetEnvelopeComparison } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/BudgetEnvelopeAnalysis";
import { runSensitivityAnalysis } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/SensitivityAnalysis";
import { buildMethodComparison } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/MethodComparison";
import { evaluateApplicability } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/ApplicabilityAnalysis";
import { evaluateValidationProtocolDecision } from "./solverPrimitiveParityGatedCycleValidationProtocolQualification/ValidationProtocolDecision";

const TARGET_LABELS = ["worstCase:5e5b20b", "snapshot335:60b5c3b1", "snapshot335:ad12c377"];
const DATA_DIR = "src/customCube/solverPrimitiveParityGatedCycleValidationProtocolQualification/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-validation-protocol-qualification-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-validation-protocol-qualification-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (n=142), filtering to the 3 known-effect cases...");
  const allHoles = loadRawHoleDataset();
  const cases = allHoles.filter((h) => TARGET_LABELS.includes(h.label));
  if (cases.length !== TARGET_LABELS.length) {
    throw new Error(`expected ${TARGET_LABELS.length} target cases, found ${cases.length}`);
  }

  console.log("STEP1: Measurement Path Audit (real code citation, no execution)...");
  console.log(`  ${PARITY_MEASUREMENT_PATH_MATRIX.length} measurement paths documented.`);

  console.log("STEP2: Budget Envelope Analysis...");
  const budgetEnvelope = buildBudgetEnvelopeComparison(cases, libs);
  for (const r of budgetEnvelope) {
    console.log(`  ${r.label} [${r.path} ${r.configDescription}]: remainingTime=${r.actualRemainingTimeAtParityOrRecoveryStartMs}, effectiveBudget=${r.effectiveBudgetMs}`);
  }

  console.log("STEP3: Sensitivity Analysis...");
  const sensitivity = runSensitivityAnalysis(cases, libs);
  for (const label of TARGET_LABELS) {
    console.log(`  ${label}: attemptRecoveryThresholdMs=${sensitivity.attemptRecoveryThresholdMs[label]}, solveThresholdMs=${sensitivity.solveThresholdMs[label]}`);
  }

  console.log("STEP4: Measurement Method Comparison...");
  const methodComparison = buildMethodComparison(sensitivity.attemptRecoverySweep, sensitivity.solveSweep);
  for (const r of methodComparison) {
    console.log(`  ${r.label}: methodA=${r.methodAResult}(${r.methodAChosenType}), methodB=${r.methodBResult}(${r.methodBChosenType}), flips=${r.methodFlipsResult}`);
  }

  console.log("STEP5: Applicability Analysis...");
  const applicability = evaluateApplicability(budgetEnvelope, methodComparison);
  for (const c of applicability.checks) console.log(`  [${c.satisfied ? "PASS" : "FAIL"}] ${c.condition}`);
  console.log(`  classification=${applicability.classification}`);

  console.log("STEP6: Validation Protocol Decision...");
  const decisionResult = evaluateValidationProtocolDecision(PARITY_MEASUREMENT_PATH_MATRIX, budgetEnvelope, sensitivity, methodComparison, applicability);
  console.log(`  Level1(MeasurementMismatch)=${decisionResult.level1MeasurementMismatch}, Level2(CapabilityExists)=${decisionResult.level2CapabilityExists}, Level3(ProtocolNecessity)=${decisionResult.level3ProtocolNecessity}`);
  console.log(`  Decision=${decisionResult.decision}`);

  // Overall Level1-6 success table per the Directive's own criteria table.
  const overallLevels = {
    level1MeasurementPathAudit: PARITY_MEASUREMENT_PATH_MATRIX.length === 3,
    level2BudgetEnvelopeAnalysis: budgetEnvelope.length === cases.length * 3,
    level3SensitivityAnalysis: sensitivity.attemptRecoverySweep.length === cases.length * 4 && sensitivity.solveSweep.length === cases.length * 3,
    level4MethodComparison: methodComparison.length === cases.length,
    level5ApplicabilityAnalysis: applicability.checks.length === 3,
    level6ValidationProtocolDecision: decisionResult.decision === "A_PROTOCOL_ADOPTED",
  };

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1 -- Report ===");
  push();
  push("STEP1. Measurement Path Audit -- PARITY Measurement Path Matrix");
  for (const row of PARITY_MEASUREMENT_PATH_MATRIX) {
    push(`  [${row.path}]`);
    push(`    invocationLocation: ${row.invocationLocation}`);
    push(`    gate: ${row.gate}`);
    push(`    dedicatedSliceApplied: ${row.dedicatedSliceApplied}`);
    push(`    shortCircuitStatus: ${row.shortCircuitStatus}`);
    push(`    realProductionEvidence: ${row.realProductionEvidence}`);
    push();
  }
  push("STEP2. Budget Envelope Table");
  for (const r of budgetEnvelope) {
    push(`  ${r.label} [${r.path} ${r.configDescription}]`);
    push(`    outerOrPlanDeadlineMs=${r.outerOrPlanDeadlineMs}, actualRemainingTimeAtParityOrRecoveryStartMs=${r.actualRemainingTimeAtParityOrRecoveryStartMs}, dedicatedBudgetMs=${r.dedicatedBudgetMs}, effectiveBudgetMs=${r.effectiveBudgetMs}`);
  }
  push();
  push("STEP3. Capability Sensitivity Curve");
  for (const label of TARGET_LABELS) {
    push(`  ${label}:`);
    push(`    attemptRecovery sweep: ${sensitivity.attemptRecoverySweep.filter((r) => r.label === label).map((r) => `[outer=${r.outerDeadlineMs}ms offered=${r.result.parityOffered} chosen=${r.result.parityChosen} improved=${r.result.improved} wrongWingReduction=${r.result.wrongWingBefore - r.result.wrongWingAfter}]`).join(" ")}`);
    push(`    solve sweep: ${sensitivity.solveSweep.filter((r) => r.label === label).map((r) => `[reserve=${r.recoveryReserveMsOverride}ms improved=${r.result.improved} chosenType=${r.result.chosenType}]`).join(" ")}`);
    push(`    attemptRecoveryThresholdMs=${sensitivity.attemptRecoveryThresholdMs[label]}, solveThresholdMs=${sensitivity.solveThresholdMs[label]}`);
  }
  push();
  push("STEP4. Method Comparison Matrix");
  for (const r of methodComparison) {
    push(`  ${r.label}: methodA(attemptRecovery_direct@outer=2000ms)=${r.methodAResult}(chosenType=${r.methodAChosenType}, runtimeProxy=${r.methodARuntimeProxy}ms), methodB(solve_e2e@reserve=250ms)=${r.methodBResult}(chosenType=${r.methodBChosenType}, runtimeProxy=${r.methodBRuntimeProxy}), methodFlipsResult=${r.methodFlipsResult}`);
  }
  push();
  push("STEP5. Applicability Analysis");
  for (const c of applicability.checks) {
    push(`  [${c.satisfied ? "PASS" : "FAIL"}] ${c.condition}`);
    push(`    evidence: ${c.evidence}`);
  }
  push(`  classification=${applicability.classification}`);
  push();
  push("STEP6. Validation Protocol Decision");
  push(`  Level1(Measurement Mismatch 존재+단일귀속)=${decisionResult.level1MeasurementMismatch ? "PASS" : "FAIL"}`);
  push(`  Level2(Capability 존재)=${decisionResult.level2CapabilityExists ? "PASS" : "FAIL"}`);
  push(`  Level3(Protocol 필요성)=${decisionResult.level3ProtocolNecessity ? "PASS" : "FAIL"}`);
  push(`  frameworkCompatible=${decisionResult.frameworkCompatible}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rootCause: ${decisionResult.rootCause}`);
  push(`  rationale: ${decisionResult.rationale}`);
  push();
  push("전체 성공 기준 (Level1-6)");
  push(`  Level1(Measurement Path Audit)=${overallLevels.level1MeasurementPathAudit ? "PASS" : "FAIL"}`);
  push(`  Level2(Budget Envelope 분석)=${overallLevels.level2BudgetEnvelopeAnalysis ? "PASS" : "FAIL"}`);
  push(`  Level3(Sensitivity Analysis)=${overallLevels.level3SensitivityAnalysis ? "PASS" : "FAIL"}`);
  push(`  Level4(Method Comparison)=${overallLevels.level4MethodComparison ? "PASS" : "FAIL"}`);
  push(`  Level5(Applicability Analysis)=${overallLevels.level5ApplicabilityAnalysis ? "PASS" : "FAIL"}`);
  push(`  Level6(Validation Protocol Decision, Decision A 도출)=${overallLevels.level6ValidationProtocolDecision ? "PASS" : "FAIL"}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        targetLabels: TARGET_LABELS,
        measurementPathMatrix: PARITY_MEASUREMENT_PATH_MATRIX,
        budgetEnvelope,
        sensitivity,
        methodComparison,
        applicability,
        decisionResult,
        overallLevels,
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
