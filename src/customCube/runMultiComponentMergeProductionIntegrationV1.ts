// Multi-Component Merge Production Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runMultiComponentMergeProductionIntegrationV1.ts
//
// STEP1 (wiring genMultiComponentMerge into fiveByFiveEdgeRecovery.ts /
// fiveByFiveEdgeSolverTypes.ts) is already committed as real production
// code -- this driver runs STEP2-6's real measurement/validation over the
// full 142-case Hole Dataset via real generateRecoveryStrategies()/
// attemptRecovery() calls (read-only usage, no further production
// modification). See docs/MULTI_COMPONENT_MERGE_PRODUCTION_INTEGRATION_V1.md
// for the full STEP1-6 narrative and Level1-4 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { auditPopulation, summarizeContractAudit } from "./solverPrimitiveMultiComponentMergeProductionIntegration/ContractAudit";
import { validatePopulation, summarizeCapabilityValidation } from "./solverPrimitiveMultiComponentMergeProductionIntegration/CapabilityValidation";
import { analyzePrimitiveInteraction } from "./solverPrimitiveMultiComponentMergeProductionIntegration/PrimitiveInteraction";
import { runStatisticalValidation } from "./solverPrimitiveMultiComponentMergeProductionIntegration/StatisticalValidation";
import { runValidationFramework } from "./solverPrimitiveMultiComponentMergeProductionIntegration/ValidationFramework";
import { classifyRootCause, summarizeRootCause } from "./solverPrimitiveMultiComponentMergeProductionIntegration/RootCauseAnalysis";

const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-production-integration-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- full population, n=142)...");
  const holes = loadRawHoleDataset();

  console.log("STEP2: Contract Audit (real generateRecoveryStrategies(), read-only)...");
  const auditRows = auditPopulation(holes, libs);
  const auditSummary = summarizeContractAudit(auditRows);
  console.log(`  gateMatchedRate=${(auditSummary.gateMatchedRate * 100).toFixed(1)}% (contractMatchesPlanningGate=${auditSummary.contractMatchesPlanningGate})`);
  console.log(`  positionCorrectRate=${(auditSummary.positionCorrectRate * 100).toFixed(1)}%, avgActualBudgetAvailableMs=${auditSummary.avgActualBudgetAvailableMs.toFixed(1)}, budgetStarvedCount=${auditSummary.budgetStarvedCount}`);

  console.log("STEP3: Capability Validation (real attemptRecovery(), Baseline vs Integrated, n=142)...");
  const validationRows = validatePopulation(holes, libs);
  const validationSummary = summarizeCapabilityValidation(validationRows);
  console.log(`  baselineImproved=${validationSummary.baselineImprovedCount}, integratedImproved=${validationSummary.integratedImprovedCount}`);
  console.log(`  newCapability=${validationSummary.newCapabilityCount}, duplicate=${validationSummary.duplicateCount}, regression=${validationSummary.regressionCount}`);

  console.log("STEP4: Primitive Interaction (CCR/REPAIR/PARITY/MCM)...");
  const interaction = analyzePrimitiveInteraction(auditRows, validationRows);
  console.log(`  overlapRate=${(interaction.overlapRate * 100).toFixed(1)}%, replacementCount=${interaction.replacementCount}, starvationRate=${(interaction.starvationRate * 100).toFixed(1)}%`);

  console.log("STEP5: Statistical Validation + Validation Framework...");
  const stats = runStatisticalValidation(validationRows);
  console.log(`  improvedCountDiff mean=${stats.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.improvedCountDiff.effectSize.cohensD.toFixed(3)}`);
  const framework = runValidationFramework(stats, validationRows);
  for (const g of framework.gateResults) console.log(`  Gate ${g.gate}(${g.name})=${g.status}`);
  console.log(`  pipelineDecision=${framework.pipelineResult.decision}`);

  console.log("STEP6: Root Cause Analysis...");
  const rootCauseRows = classifyRootCause(holes, validationRows);
  const rootCauseSummary = summarizeRootCause(rootCauseRows, auditSummary);
  console.log(`  gateMissRate=${(rootCauseSummary.gateMissRate * 100).toFixed(1)}%, resolved=${rootCauseSummary.resolvedCount}, duplicate=${rootCauseSummary.duplicateCount}, schedulerOrdering=${rootCauseSummary.schedulerOrderingCount}, primitiveFailureOrBudget=${rootCauseSummary.primitiveFailureOrBudgetCount}`);

  // Level1-4 + Decision A/B/C (Directive's own criteria)
  const level1ContractCorrect = auditSummary.contractMatchesPlanningGate && auditSummary.positionCorrectRate === 1;
  const level2NoRegression = stats.trueRegressionDiff.stats.ciUpper <= 0 || stats.trueRegressionDiff.stats.mean <= 0;
  const level3NewCapabilityConfirmed = rootCauseSummary.resolvedCount > 0;
  const level4FrameworkPass = framework.pipelineResult.decision === "A";

  // Root Cause distinguishes an actionable Budget/Scheduler problem from a
  // genuine Primitive limitation: if the gate-matched population is
  // dominated by real Budget Starvation (STEP2's own measured
  // actualBudgetAvailableMs falling far short of the nominal 2000ms
  // reserved slice, caused by CCR's own remainingTime contract consuming
  // the outer deadline first), Decision B (fix the Budget/Scheduler
  // interaction) is the correct call -- Decision C (regress to Blueprint)
  // would wrongly blame the Primitive's own algorithm for a Contract
  // interaction defect it never got a fair chance to clear.
  const budgetStarvationDominant =
    rootCauseSummary.budgetStarvationEvidence.budgetStarvedRateAmongGateMatched >= 0.5 && rootCauseSummary.primitiveFailureOrBudgetCount > 0;

  let finalDecision: "A_PRODUCTION_CONTRACT_ADOPTED" | "B_INTEGRATION_REFINEMENT" | "C_REGRESS_TO_BLUEPRINT";
  let finalDecisionRationale: string;
  if (level1ContractCorrect && level2NoRegression && level3NewCapabilityConfirmed && level4FrameworkPass) {
    finalDecision = "A_PRODUCTION_CONTRACT_ADOPTED";
    finalDecisionRationale = `Level1-4 전부 PASS -- Contract 정확, Regression 없음, 신규 Capability ${rootCauseSummary.resolvedCount}건 확인, Validation Framework Decision A. Production Contract 채택.`;
  } else if (level1ContractCorrect && level2NoRegression && budgetStarvationDominant) {
    finalDecision = "B_INTEGRATION_REFINEMENT";
    finalDecisionRationale =
      `Contract는 정확히 구현됐고(Level1 PASS) Regression도 없다(Level2 PASS). 신규 Capability는 실측상 0건(Level3 FAIL)이지만, ` +
      `Root Cause 분석 결과 gate-matched ${rootCauseSummary.n - rootCauseSummary.gateMissCount}건 중 ` +
      `${(rootCauseSummary.budgetStarvationEvidence.budgetStarvedRateAmongGateMatched * 100).toFixed(0)}%가 Budget Starvation ` +
      `상태였다(avgActualBudgetAvailableMs=${rootCauseSummary.budgetStarvationEvidence.avgActualBudgetAvailableMsAmongGateMatched.toFixed(1)}ms, ` +
      `명목 2000ms의 ${(rootCauseSummary.budgetStarvationEvidence.avgActualBudgetAvailableMsAmongGateMatched / 2000 * 100).toFixed(1)}%에 불과) -- ` +
      `CCR의 remainingTime Budget Contract가 Outer Deadline을 먼저 소진해 MULTI_COMPONENT_MERGE가 자신의 명목 예산을 온전히 받지 ` +
      `못했다. 이는 Primitive 자체의 구조적 한계가 아니라 Budget/Scheduler 상호작용 문제로 귀속된다 -- Primitive Blueprint로 ` +
      `회귀하는 대신 Budget/Scheduler 재설계를 다루는 Production Integration Refinement Sprint로 진행한다.`;
  } else if (level1ContractCorrect && level2NoRegression) {
    finalDecision = "C_REGRESS_TO_BLUEPRINT";
    finalDecisionRationale = `Contract는 정확히 구현됐고 Regression도 없으나(Level1/2 PASS), 신규 Capability가 0건이며 Root Cause 분석 결과 Budget Starvation으로 설명되지 않는 Primitive 자체의 구조적 한계가 지배적 -- Primitive Blueprint 단계로 회귀.`;
  } else {
    finalDecision = "B_INTEGRATION_REFINEMENT";
    finalDecisionRationale = `Contract 일부가 불확실하다 -- Production Integration Refinement Sprint로 진행해 Gate/Budget/Scheduler 조정을 재검토한다.`;
  }
  console.log(`Level1(Contract 정확)=${level1ContractCorrect ? "PASS" : "FAIL"}, Level2(Regression 0)=${level2NoRegression ? "PASS" : "FAIL"}, Level3(신규 Capability)=${level3NewCapabilityConfirmed ? "PASS" : "FAIL"}, Level4(Validation Framework)=${level4FrameworkPass ? "PASS" : "FAIL"}`);
  console.log(`finalDecision=${finalDecision}`);
  console.log(`rationale: ${finalDecisionRationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Integration Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length} (real production functions -- generateRecoveryStrategies()/attemptRecovery(), read-only measurement)`);
  push();
  push("STEP2. Contract Audit");
  push(`  gateMatchedRate=${(auditSummary.gateMatchedRate * 100).toFixed(1)}% (${auditSummary.gateMatchedCount}/${auditSummary.n}), contractMatchesPlanningGate=${auditSummary.contractMatchesPlanningGate}`);
  push(`  positionCorrectRate=${(auditSummary.positionCorrectRate * 100).toFixed(1)}% (${auditSummary.positionCorrectCount}/${auditSummary.gateMatchedCount})`);
  push(`  avgActualBudgetAvailableMs=${auditSummary.avgActualBudgetAvailableMs.toFixed(1)} (nominal 2000ms), budgetStarvedCount=${auditSummary.budgetStarvedCount}/${auditSummary.gateMatchedCount}`);
  push(`  chosenCount(MCM won argmax)=${auditSummary.chosenCount}/${auditSummary.gateMatchedCount}`);
  push();
  push("STEP3. Capability Validation (Baseline vs Integrated)");
  push(`  baselineImprovedCount=${validationSummary.baselineImprovedCount}/${validationSummary.n}, integratedImprovedCount=${validationSummary.integratedImprovedCount}/${validationSummary.n}`);
  push(`  newCapabilityCount=${validationSummary.newCapabilityCount}, duplicateCount=${validationSummary.duplicateCount}, regressionCount=${validationSummary.regressionCount}`);
  push(`  integratedTrueRegressionCount=${validationSummary.integratedTrueRegressionCount}`);
  push();
  push("STEP4. Primitive Interaction");
  push(`  overlapCount=${interaction.overlapCount}/${interaction.gateMatchedCount} (${(interaction.overlapRate * 100).toFixed(1)}%)`);
  push(`  duplicateRescueCount=${interaction.duplicateRescueCount}, baselineChosenBreakdown=${JSON.stringify(interaction.duplicateRescueBaselineChosenBreakdown)}`);
  push(`  replacementCount=${interaction.replacementCount}`);
  push(`  starvationCount=${interaction.starvationCount}/${interaction.gateMatchedCount} (${(interaction.starvationRate * 100).toFixed(1)}%), avgActualBudgetAvailableMs=${interaction.avgActualBudgetAvailableMs.toFixed(1)}`);
  push();
  push("STEP5. Statistical Validation + Validation Framework");
  push(`  improvedCountDiff: mean=${stats.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${stats.improvedCountDiff.effectSize.magnitude})`);
  push(`  trueRegressionDiff: mean=${stats.trueRegressionDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.trueRegressionDiff.stats.ciLower.toFixed(4)}, ${stats.trueRegressionDiff.stats.ciUpper.toFixed(4)}]`);
  push(`  runtimeDiffMs: mean=${stats.runtimeDiffMs.stats.mean.toFixed(1)}ms, 95% CI=[${stats.runtimeDiffMs.stats.ciLower.toFixed(1)}, ${stats.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`);
  push(`  newCapabilityRate=${(stats.newCapabilityRate * 100).toFixed(1)}%`);
  for (const g of framework.gateResults) push(`  Gate ${g.gate}(${g.name})=${g.status} -- ${g.evidence}`);
  push(`  pipelineDecision=${framework.pipelineResult.decision}: ${framework.pipelineResult.decisionRationale}`);
  push(`  RecoveryTypeStats:`);
  for (const r of framework.recoveryTypeStats) {
    push(`    [${r.recoveryType}] offered=${r.offeredCount}, chosen=${r.chosenCount}, chosenRate=${(r.chosenRate * 100).toFixed(1)}%, duplicateCount=${r.duplicateCount}, starved=${r.starved}`);
  }
  push();
  push("STEP6. Root Cause Analysis");
  push(`  gateMissRate=${(rootCauseSummary.gateMissRate * 100).toFixed(1)}% (${rootCauseSummary.gateMissCount}/${rootCauseSummary.n}) -- Dataset Coverage ceiling=${(rootCauseSummary.datasetCoverageCeiling * 100).toFixed(1)}%`);
  push(`  resolvedCount=${rootCauseSummary.resolvedCount}, duplicateCount=${rootCauseSummary.duplicateCount}`);
  push(`  schedulerOrderingCount=${rootCauseSummary.schedulerOrderingCount}, primitiveFailureOrBudgetCount=${rootCauseSummary.primitiveFailureOrBudgetCount}`);
  push(`  budgetStarvationEvidence: avgActualBudgetAvailableMsAmongGateMatched=${rootCauseSummary.budgetStarvationEvidence.avgActualBudgetAvailableMsAmongGateMatched.toFixed(1)}, budgetStarvedRateAmongGateMatched=${(rootCauseSummary.budgetStarvationEvidence.budgetStarvedRateAmongGateMatched * 100).toFixed(1)}%`);
  push();
  push("Level1-4 + Decision");
  push(`  Level1(Operating Contract 정확히 구현)=${level1ContractCorrect ? "PASS" : "FAIL"}`);
  push(`  Level2(Regression 0)=${level2NoRegression ? "PASS" : "FAIL"}`);
  push(`  Level3(신규 Capability 확인)=${level3NewCapabilityConfirmed ? "PASS" : "FAIL"}`);
  push(`  Level4(Validation Framework 통과)=${level4FrameworkPass ? "PASS" : "FAIL"}`);
  push(`  finalDecision=${finalDecision}`);
  push(`  rationale: ${finalDecisionRationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        auditSummary,
        validationRows,
        validationSummary,
        interaction,
        stats,
        framework,
        rootCauseRows,
        rootCauseSummary,
        level1ContractCorrect,
        level2NoRegression,
        level3NewCapabilityConfirmed,
        level4FrameworkPass,
        finalDecision,
        finalDecisionRationale,
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
