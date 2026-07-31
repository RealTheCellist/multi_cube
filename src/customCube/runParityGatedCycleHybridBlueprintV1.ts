// Parity-Gated Cycle Hybrid Primitive Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleHybridBlueprintV1.ts
//
// Design-only Sprint (no new Replay, no new Primitive implementation).
// Loads the Comparative Prototype Sprint v1's own real per-case result
// JSON (parity-gated-cycle-comparative-prototype-v1-result.json) and
// derives STEP1-6 (Capability Overlap -> Hybrid Scheduling Design ->
// Budget Architecture -> Counterfactual Capability Estimation ->
// Integration Risk -> Blueprint Selection) entirely from it. NO
// Production Solver / Primitive file is touched. See
// docs/PARITY_GATED_CYCLE_HYBRID_BLUEPRINT_V1.md for the full STEP1-6
// narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { classifyOverlap, summarizeOverlap } from "./solverPrimitiveParityHybridBlueprint/CapabilityOverlapAnalysis";
import { buildHybridSchedulingOptions } from "./solverPrimitiveParityHybridBlueprint/HybridSchedulingDesign";
import { BUDGET_POLICY_OPTIONS } from "./solverPrimitiveParityHybridBlueprint/BudgetArchitecture";
import { estimateCounterfactualCapability } from "./solverPrimitiveParityHybridBlueprint/CounterfactualCapabilityEstimation";
import { assessIntegrationRisk } from "./solverPrimitiveParityHybridBlueprint/IntegrationRisk";
import { selectBlueprint } from "./solverPrimitiveParityHybridBlueprint/BlueprintSelection";

const COMPARATIVE_RESULT_PATH =
  "src/customCube/solverPrimitiveParityComparativePrototype/data/parity-gated-cycle-comparative-prototype-v1-result.json";
const DATA_DIR = "src/customCube/solverPrimitiveParityHybridBlueprint/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-hybrid-blueprint-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-hybrid-blueprint-v1-result.json`;

interface ComparativeResultCase {
  label: string;
  dualImproved: boolean;
  multiImproved: boolean;
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`Loading Comparative Prototype Sprint v1's own real result JSON (${COMPARATIVE_RESULT_PATH}, no new Replay)...`);
  const comparative = JSON.parse(fs.readFileSync(COMPARATIVE_RESULT_PATH, "utf-8"));
  const perCase: ComparativeResultCase[] = comparative.perCase.map((c: any) => ({
    label: c.label,
    dualImproved: c.dualImproved,
    multiImproved: c.multiImproved,
  }));
  const dualAvgRuntimeMs: number = comparative.benchmark.dualAvgRuntimeMs;
  const multiAvgRuntimeMs: number = comparative.benchmark.multiAvgRuntimeMs;

  console.log(`STEP1: Capability Overlap Analysis (n=${perCase.length})...`);
  const overlapPerCase = classifyOverlap(perCase);
  const overlap = summarizeOverlap(overlapPerCase);
  console.log(
    `  dualOnlyCount=${overlap.dualOnlyCount}, multiOnlyCount=${overlap.multiOnlyCount}, bothCount=${overlap.bothCount}, neitherCount=${overlap.neitherCount}`
  );
  console.log(
    `  jaccardIndex=${overlap.jaccardIndex.toFixed(3)}, overlapRatioOfSmaller=${overlap.overlapRatioOfSmaller.toFixed(3)}, exclusiveCapabilityCount=${overlap.exclusiveCapabilityCount}`
  );

  console.log("STEP2: Hybrid Scheduling Design (>=3 call orders)...");
  const schedulingOptions = buildHybridSchedulingOptions(dualAvgRuntimeMs, multiAvgRuntimeMs);
  for (const o of schedulingOptions) console.log(`  [${o.id}] ${o.name}`);

  console.log("STEP3: Budget Architecture (>=4 policies)...");
  for (const b of BUDGET_POLICY_OPTIONS) console.log(`  [${b.id}] ${b.name}`);

  console.log("STEP4: Counterfactual Capability Estimation (Replay-derived, no new implementation)...");
  const capability = estimateCounterfactualCapability(overlap, dualAvgRuntimeMs, multiAvgRuntimeMs);
  console.log(
    `  expectedRescueOverBestSingle=${capability.expectedRescueOverBestSingle}, upperBoundSuccessCount=${capability.upperBoundSuccessCount}, duplicateSuccessCount=${capability.duplicateSuccessCount}`
  );
  console.log(`  bestSinglePrimitive=${capability.bestSinglePrimitive}, marginalRescuePercentOfPopulation=${capability.marginalRescuePercentOfPopulation.toFixed(1)}%`);

  console.log("STEP5: Integration Risk...");
  const risk = assessIntegrationRisk(capability, overlap.totalCases);

  console.log("STEP6: Blueprint Selection...");
  const selection = selectBlueprint(overlap, capability, schedulingOptions, BUDGET_POLICY_OPTIONS, risk);
  console.log(`  decision=${selection.decision}`);
  console.log(`  rationale: ${selection.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Hybrid Primitive Blueprint Sprint v1 -- Report ===");
  push();
  push(`Comparative Prototype Sprint v1의 실측 결과(${COMPARATIVE_RESULT_PATH})를 그대로 재사용 (n=${perCase.length}, 새 Replay 없음)`);
  push();
  push("STEP1. Capability Overlap Analysis");
  push(`  dualOnlyCount=${overlap.dualOnlyCount}, multiOnlyCount=${overlap.multiOnlyCount}, bothCount=${overlap.bothCount}, neitherCount=${overlap.neitherCount}`);
  push(`  dualTotalSuccessCount=${overlap.dualTotalSuccessCount}, multiTotalSuccessCount=${overlap.multiTotalSuccessCount}, unionSuccessCount=${overlap.unionSuccessCount}`);
  push(`  jaccardIndex=${overlap.jaccardIndex.toFixed(3)}, overlapRatioOfSmaller=${overlap.overlapRatioOfSmaller.toFixed(3)}`);
  push(`  exclusiveCapabilityCount=${overlap.exclusiveCapabilityCount}, exclusiveCapabilityPercentOfUnion=${overlap.exclusiveCapabilityPercentOfUnion.toFixed(1)}%`);
  push();
  push("STEP2. Hybrid Scheduling Design");
  for (const o of schedulingOptions) {
    push(`  [${o.id}] ${o.name}`);
    push(`    ${o.description}`);
    push(`    runtimeImpact: ${o.runtimeImpact}`);
    push(`    budgetImpact: ${o.budgetImpact}`);
    push(`    schedulerImpact: ${o.schedulerImpact}`);
  }
  push();
  push("STEP3. Budget Architecture");
  for (const b of BUDGET_POLICY_OPTIONS) {
    push(`  [${b.id}] ${b.name}`);
    push(`    ${b.description}`);
    push(`    pros: ${b.pros}`);
    push(`    cons: ${b.cons}`);
  }
  push();
  push("STEP4. Counterfactual Capability Estimation");
  push(`  bestSinglePrimitive=${capability.bestSinglePrimitive}, bestSingleSuccessCount=${capability.bestSingleSuccessCount}`);
  push(`  upperBoundSuccessCount=${capability.upperBoundSuccessCount}, expectedRescueOverBestSingle=${capability.expectedRescueOverBestSingle}`);
  push(`  duplicateSuccessCount=${capability.duplicateSuccessCount}, marginalRescuePercentOfPopulation=${capability.marginalRescuePercentOfPopulation.toFixed(1)}%`);
  push(`  extraRuntimeCostForMarginalRescueMs=${capability.extraRuntimeCostForMarginalRescueMs.toFixed(1)}`);
  push();
  push("STEP5. Integration Risk");
  push(`  schedulerImpact: ${risk.schedulerImpact}`);
  push(`  recoveryImpact: ${risk.recoveryImpact}`);
  push(`  runtimeImpact: ${risk.runtimeImpact}`);
  push(`  productionChangeAmount: ${risk.productionChangeAmount}`);
  push(`  regressionRisk: ${risk.regressionRisk}`);
  push();
  push("STEP6. Blueprint Selection");
  push(`  decision=${selection.decision}`);
  push(`  rationale: ${selection.rationale}`);
  push(`  recommendedSchedulingOptionId=${selection.recommendedSchedulingOptionId}`);
  push(`  recommendedBudgetPolicyId=${selection.recommendedBudgetPolicyId}`);
  push(`  selectionCriteria.capability: ${selection.selectionCriteria.capability}`);
  push(`  selectionCriteria.runtime: ${selection.selectionCriteria.runtime}`);
  push(`  selectionCriteria.risk: ${selection.selectionCriteria.risk}`);
  push(`  selectionCriteria.implementationComplexity: ${selection.selectionCriteria.implementationComplexity}`);
  push(`  Level1(Capability 중복 구조 규명)=${selection.level1CapabilityOverlapResolved ? "PASS" : "FAIL"}`);
  push(`  Level2(Hybrid Architecture 확정)=${selection.level2HybridArchitectureConfirmed ? "PASS" : "N/A (Decision C)"}`);
  push(`  Level3(Prototype 구현 대상 1개 선정)=${selection.level3PrototypeTargetSelected}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: perCase.length,
        overlapPerCase,
        overlap,
        schedulingOptions,
        budgetOptions: BUDGET_POLICY_OPTIONS,
        capability,
        risk,
        selection,
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
