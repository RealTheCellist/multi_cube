// Multi-Component Merge Validation Methodology Qualification Sprint v1 --
// driver.
//
// Usage:
//   npx tsx .../runMultiComponentMergeValidationMethodologyQualificationV1.ts
//
// Pure Validation Methodology Sprint -- NO production/Primitive/Budget/
// Scheduler modification. Targets the SAME 2 known-effect cases the prior
// Short-Circuit Production Integration Sprint v1 established
// (scrambleDepth30:2, scrambleDepth100:5) as its real-execution evidence
// base, reusing loadRawHoleDataset() + buildWingLibrary/buildFlipLibrary/
// buildCaseLibrary exactly as every prior driver in this arc has done.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { MEASUREMENT_COVERAGE_MATRIX } from "./solverPrimitiveMultiComponentMergeValidationMethodology/MeasurementPathAudit";
import { buildBudgetEnvelopeComparison } from "./solverPrimitiveMultiComponentMergeValidationMethodology/BudgetEnvelopeAnalysis";
import { runSensitivityAnalysis } from "./solverPrimitiveMultiComponentMergeValidationMethodology/SensitivityAnalysis";
import { auditMetricSensitivity } from "./solverPrimitiveMultiComponentMergeValidationMethodology/MetricSensitivityAudit";
import { buildCounterfactualValidation } from "./solverPrimitiveMultiComponentMergeValidationMethodology/CounterfactualValidation";
import { evaluateMethodologyDecision } from "./solverPrimitiveMultiComponentMergeValidationMethodology/MethodologyDecisionMatrix";

const TARGET_LABELS = ["scrambleDepth30:2", "scrambleDepth100:5"];
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeValidationMethodology/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-validation-methodology-qualification-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-validation-methodology-qualification-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (n=142), filtering to the 2 known-effect cases...");
  const allHoles = loadRawHoleDataset();
  const cases = allHoles.filter((h) => TARGET_LABELS.includes(h.label));
  if (cases.length !== TARGET_LABELS.length) {
    throw new Error(`expected ${TARGET_LABELS.length} target cases, found ${cases.length}`);
  }

  console.log("STEP1: Measurement Path Audit (synthesis, no execution)...");
  console.log(`  ${MEASUREMENT_COVERAGE_MATRIX.length} measurement paths documented.`);

  console.log("STEP2: Budget Envelope Analysis (real attemptRecovery_direct @ outer=1000/2000ms + real solve_e2e @ recoveryReserveMsOverride=250ms)...");
  const budgetEnvelope = buildBudgetEnvelopeComparison(cases, libs);
  for (const r of budgetEnvelope) {
    console.log(`  ${r.label} [${r.path} ${r.configDescription}]: remainingTime=${r.actualRemainingTimeAtMcmOrRecoveryStartMs}, effectiveBudget=${r.effectiveBudgetMs}`);
  }

  console.log("STEP3: Sensitivity Analysis (attemptRecovery outer=1000/1500/2000/60000ms, solve recoveryReserveMsOverride=250/450/900ms)...");
  const sensitivity = runSensitivityAnalysis(cases, libs);
  for (const label of TARGET_LABELS) {
    console.log(`  ${label}: attemptRecoveryThresholdMs=${sensitivity.attemptRecoveryThresholdMs[label]}, solveThresholdMs=${sensitivity.solveThresholdMs[label]}`);
  }

  console.log("STEP4: Metric Sensitivity Audit (improvedCount vs recoverySuccessCount/wrongWingReductionTotal)...");
  const metricSensitivity = auditMetricSensitivity(sensitivity.attemptRecoverySweep, sensitivity.solveSweep);
  console.log(`  allMetricsMoveTogether=${metricSensitivity.allMetricsMoveTogether}`);
  console.log(`  proposedNewKpi=${metricSensitivity.proposedNewKpi.name}`);

  console.log("STEP5: Counterfactual Validation (same 2 cases, Method-only change)...");
  const counterfactual = buildCounterfactualValidation(sensitivity.attemptRecoverySweep, sensitivity.solveSweep);
  for (const r of counterfactual) {
    console.log(`  ${r.label}: shortCircuitMethod=${r.shortCircuitMethodResult}, productValidationMethod=${r.productValidationMethodResult}, flips=${r.methodFlipsResult}`);
  }

  console.log("STEP6: Methodology Decision Matrix...");
  const decisionResult = evaluateMethodologyDecision(MEASUREMENT_COVERAGE_MATRIX, budgetEnvelope, sensitivity, counterfactual);
  console.log(`  Level1=${decisionResult.level1Pass}, Level2=${decisionResult.level2Pass}, Level3=${decisionResult.level3Pass}`);
  console.log(`  Decision=${decisionResult.decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Validation Methodology Qualification Sprint v1 -- Report ===");
  push();
  push("STEP1. Measurement Path Audit -- Measurement Coverage Matrix");
  for (const row of MEASUREMENT_COVERAGE_MATRIX) {
    push(`  [${row.path}]`);
    push(`    describedAs: ${row.describedAs}`);
    push(`    contractMeasured: ${row.contractMeasured}`);
    push(`    budgetCondition: ${row.budgetCondition}`);
    push(`    primitivesIncluded: ${row.primitivesIncluded}`);
    push(`    usedInSprints: ${row.usedInSprints.join(" / ")}`);
    push(`    knownLimitation: ${row.knownLimitation}`);
    push();
  }
  push("STEP2. Budget Envelope Analysis -- Budget Envelope Comparison");
  for (const r of budgetEnvelope) {
    push(`  ${r.label} [${r.path} ${r.configDescription}]`);
    push(`    outerOrPlanDeadlineMs=${r.outerOrPlanDeadlineMs}, actualRemainingTimeAtMcmOrRecoveryStartMs=${r.actualRemainingTimeAtMcmOrRecoveryStartMs}, dedicatedBudgetMs=${r.dedicatedBudgetMs}, effectiveBudgetMs=${r.effectiveBudgetMs}`);
  }
  push();
  push("STEP3. Sensitivity Analysis");
  for (const label of TARGET_LABELS) {
    push(`  ${label}:`);
    push(`    attemptRecovery sweep: ${sensitivity.attemptRecoverySweep.filter((r) => r.label === label).map((r) => `[outer=${r.outerDeadlineMs}ms improved=${r.result.improved} chosenType=${r.result.chosenType}]`).join(" ")}`);
    push(`    solve sweep: ${sensitivity.solveSweep.filter((r) => r.label === label).map((r) => `[reserve=${r.recoveryReserveMsOverride}ms improved=${r.result.improved} chosenType=${r.result.chosenType}]`).join(" ")}`);
    push(`    attemptRecoveryThresholdMs=${sensitivity.attemptRecoveryThresholdMs[label]}, solveThresholdMs=${sensitivity.solveThresholdMs[label]}`);
  }
  push();
  push("STEP4. Metric Sensitivity Audit");
  push(`  attemptRecoveryAxis: ${JSON.stringify(metricSensitivity.attemptRecoveryAxis)}`);
  push(`  solveAxis: ${JSON.stringify(metricSensitivity.solveAxis)}`);
  push(`  allMetricsMoveTogether=${metricSensitivity.allMetricsMoveTogether}`);
  push(`  proposedNewKpi: ${metricSensitivity.proposedNewKpi.name} -- ${metricSensitivity.proposedNewKpi.definition}`);
  push(`    rationale: ${metricSensitivity.proposedNewKpi.rationale}`);
  push();
  push("STEP5. Counterfactual Validation");
  for (const r of counterfactual) {
    push(`  ${r.label}: shortCircuitMethod(attemptRecovery_direct@outer=2000ms)=${r.shortCircuitMethodResult}, productValidationMethod(solve_e2e@reserve=250ms)=${r.productValidationMethodResult}, methodFlipsResult=${r.methodFlipsResult}`);
  }
  push();
  push("STEP6. Methodology Decision Matrix");
  push(`  Level1(Measurement Coverage 완전 정리)=${decisionResult.level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level2(Mismatch 원인 단일 귀속)=${decisionResult.level2Pass ? "PASS" : "FAIL"}`);
  push(`  Level3(향후 Validation Protocol 확정)=${decisionResult.level3Pass ? "PASS" : "FAIL"}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rootCause: ${decisionResult.rootCause}`);
  push(`  recommendedProtocol: ${decisionResult.recommendedProtocol}`);
  push(`  rationale: ${decisionResult.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        measurementCoverage: MEASUREMENT_COVERAGE_MATRIX,
        budgetEnvelope,
        sensitivity,
        metricSensitivity,
        counterfactual,
        decisionResult,
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
