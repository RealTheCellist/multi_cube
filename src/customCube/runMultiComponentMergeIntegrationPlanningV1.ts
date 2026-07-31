// Multi-Component Merge Production Integration Planning Sprint v1 -- driver.
//   npx tsx src/customCube/runMultiComponentMergeIntegrationPlanningV1.ts
//
// Design-only Sprint (per its own Directive: "이번 Sprint는 설계(Planning)만
// 수행"). STEP1/STEP2 use real, unmodified production functions read-only
// (generateRecoveryStrategies/chooseBestRecovery, detectComponents,
// generateBridgeCandidates, computeStructuralFeatures, analyzeCcrGate) over
// the full 142-case Hole Dataset. STEP2/STEP4 join against the Comparative
// Prototype Sprint v1's own real per-case Replay result JSON (no new
// Replay run). NO Production Solver file is modified. See
// docs/MULTI_COMPONENT_MERGE_PRODUCTION_INTEGRATION_PLANNING_V1.md for the
// full STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { POSITIONS, chooseRecommendedPosition, measurePipeline, summarizePipeline } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/IntegrationPositionAnalysis";
import { computeAllCaseFeatures, evaluateGates, summarizeGates, type JoinedGroundTruth } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/GateDesign";
import { BUDGET_POLICY_OPTIONS } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/BudgetContract";
import { computePrimitiveInteraction, computeCounterfactualIntegration } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/CounterfactualIntegrationSimulation";
import { assessRisk } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/RiskAssessment";
import { decideContract } from "./solverPrimitiveMultiComponentMergeIntegrationPlanning/ProductionIntegrationContract";

const COMPARATIVE_RESULT_PATH = "src/customCube/solverPrimitiveParityComparativePrototype/data/parity-gated-cycle-comparative-prototype-v1-result.json";
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeIntegrationPlanning/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-integration-planning-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-integration-planning-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- full population, n=142)...");
  const holes = loadRawHoleDataset();

  console.log(`Loading Comparative Prototype Sprint v1's own real result JSON (${COMPARATIVE_RESULT_PATH}, no new Replay)...`);
  const comparative = JSON.parse(fs.readFileSync(COMPARATIVE_RESULT_PATH, "utf-8"));
  const groundTruth: JoinedGroundTruth[] = comparative.perCase.map((c: any) => ({
    label: c.label,
    componentCountBefore: c.multi.componentCountBefore,
    multiImproved: c.multiImproved,
  }));
  const multiAvgRuntimeMs: number = comparative.benchmark.multiAvgRuntimeMs;
  const multiRegressionCount: number = comparative.benchmark.multiRegressionCount;

  console.log("STEP1: Integration Position Analysis (real production generateRecoveryStrategies(), read-only)...");
  const pipelineRows = measurePipeline(holes, libs);
  const pipelineSummary = summarizePipeline(pipelineRows);
  console.log(`  parityGatedCycleGeneratedRate=${(pipelineSummary.parityGatedCycleGeneratedRate * 100).toFixed(1)}%, finalCandidatesEmptyRate=${(pipelineSummary.finalCandidatesEmptyRate * 100).toFixed(1)}%`);
  const recommendedPosition = chooseRecommendedPosition();
  console.log(`  recommendedPosition=${recommendedPosition}`);

  console.log("STEP2: Gate Design (real detectComponents/generateBridgeCandidates, joined with Comparative Sprint ground truth)...");
  const features = computeAllCaseFeatures(holes);
  const gateRows = evaluateGates(features, groundTruth);
  const gateSummaries = summarizeGates(gateRows, holes.length);
  for (const g of gateSummaries) {
    console.log(`  [${g.gate}] coverage=${(g.coverage * 100).toFixed(1)}%, newCapability=${g.newCapabilityCount}, duplicateOfProduction=${g.duplicateOfProductionCount}, precision=${(g.precisionNewCapabilityAmongMatched * 100).toFixed(1)}%`);
  }
  const recommendedGateSummary = gateSummaries.find((g) => g.gate === "COMPONENT_COUNT_GE3")!;

  console.log("STEP3: Budget Contract comparison...");
  for (const b of BUDGET_POLICY_OPTIONS) console.log(`  [${b.id}] ${b.name}`);

  console.log("STEP4: Counterfactual Integration Simulation (Replay-derived, no new implementation)...");
  const interaction = computePrimitiveInteraction(holes, (componentCount) => componentCount >= 3);
  console.log(`  ccrOverlapRate=${(interaction.ccrOverlapRate * 100).toFixed(1)}%, repairOverlapRate=${(interaction.repairOverlapRate * 100).toFixed(1)}%`);
  const counterfactual = computeCounterfactualIntegration(holes.length, recommendedGateSummary, multiAvgRuntimeMs, interaction);
  console.log(`  expectedInvocationCount=${counterfactual.expectedInvocationCount}, expectedRescueCount=${counterfactual.expectedRescueCount}, duplicateSuccessCount=${counterfactual.duplicateSuccessCount}`);
  console.log(`  runtimeCostTotalMs=${counterfactual.runtimeCostTotalMs.toFixed(1)}, runtimeCostPerRescueMs=${counterfactual.runtimeCostPerRescueMs.toFixed(1)}`);

  console.log("STEP5: Risk Assessment...");
  const risk = assessRisk(multiRegressionCount, counterfactual);
  console.log(`  regressionRisk=${risk.regressionRisk.level}, runtimeRisk=${risk.runtimeRisk.level}, schedulerRisk=${risk.schedulerRisk.level}, budgetRisk=${risk.budgetRisk.level}, primitiveInteractionRisk=${risk.primitiveInteractionRisk.level}`);

  console.log("STEP6: Production Integration Contract...");
  const contractDecision = decideContract(risk, counterfactual);
  console.log(`  decision=${contractDecision.decision}`);
  console.log(`  rationale: ${contractDecision.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Integration Planning Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length} (real production functions, read-only); Comparative Prototype Sprint v1의 실측 Replay 결과 재사용 (새 Replay 없음)`);
  push();
  push("STEP1. Integration Position Analysis");
  push(`  parityGatedCycleGeneratedRate=${(pipelineSummary.parityGatedCycleGeneratedRate * 100).toFixed(1)}% (componentCount>1 실측 비율)`);
  push(`  finalCandidatesEmptyRate=${(pipelineSummary.finalCandidatesEmptyRate * 100).toFixed(1)}% (pipeline_last 도달 가능성)`);
  for (const p of POSITIONS) {
    push(`  [${p.id}] ${p.label} (budgetMs=${p.budgetMs})`);
    push(`    ${p.rationale}`);
  }
  push(`  recommendedPosition=${recommendedPosition}`);
  push();
  push("STEP2. Gate Design");
  for (const g of gateSummaries) {
    push(`  [${g.gate}] ${g.label}`);
    push(`    coverage=${(g.coverage * 100).toFixed(1)}% (${g.matchedCount}/${g.n}), newCapabilityCount=${g.newCapabilityCount}, duplicateOfProductionCount=${g.duplicateOfProductionCount}, precisionNewCapability=${(g.precisionNewCapabilityAmongMatched * 100).toFixed(1)}%`);
  }
  push();
  push("STEP3. Budget Contract");
  for (const b of BUDGET_POLICY_OPTIONS) {
    push(`  [${b.id}] ${b.name}`);
    push(`    ${b.description}`);
    push(`    pros: ${b.pros}`);
    push(`    cons: ${b.cons}`);
  }
  push();
  push("STEP4. Counterfactual Integration Simulation");
  push(`  expectedInvocationCount=${counterfactual.expectedInvocationCount} (${(counterfactual.expectedInvocationRate * 100).toFixed(1)}%), expectedRescueCount=${counterfactual.expectedRescueCount} (${(counterfactual.expectedRescueRate * 100).toFixed(1)}%)`);
  push(`  duplicateSuccessCount=${counterfactual.duplicateSuccessCount}`);
  push(`  runtimeCostTotalMs=${counterfactual.runtimeCostTotalMs.toFixed(1)}, runtimeCostPerRescueMs=${counterfactual.runtimeCostPerRescueMs.toFixed(1)}`);
  push(`  ccrOverlap=${interaction.ccrOverlapCount}/${interaction.gateMatchedCount} (${(interaction.ccrOverlapRate * 100).toFixed(1)}%), repairOverlap=${interaction.repairOverlapCount}/${interaction.gateMatchedCount} (${(interaction.repairOverlapRate * 100).toFixed(1)}%)`);
  push();
  push("STEP5. Risk Assessment");
  push(`  regressionRisk=${risk.regressionRisk.level}: ${risk.regressionRisk.rationale}`);
  push(`  runtimeRisk=${risk.runtimeRisk.level}: ${risk.runtimeRisk.rationale}`);
  push(`  schedulerRisk=${risk.schedulerRisk.level}: ${risk.schedulerRisk.rationale}`);
  push(`  budgetRisk=${risk.budgetRisk.level}: ${risk.budgetRisk.rationale}`);
  push(`  primitiveInteractionRisk=${risk.primitiveInteractionRisk.level}: ${risk.primitiveInteractionRisk.rationale}`);
  push();
  push("STEP6. Production Integration Contract");
  push(`  position=${contractDecision.contract.position}, gate=${contractDecision.contract.gate}, budget=${contractDecision.contract.budget}`);
  push(`  schedulingRule: ${contractDecision.contract.schedulingRule}`);
  push(`  decision=${contractDecision.decision}`);
  push(`  rationale: ${contractDecision.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        pipelineSummary,
        recommendedPosition,
        gateSummaries,
        interaction,
        counterfactual,
        risk,
        contractDecision,
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
