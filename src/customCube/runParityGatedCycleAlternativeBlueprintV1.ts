// Parity-Gated Cycle Alternative Primitive Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleAlternativeBlueprintV1.ts
//
// Design-only Sprint -- NO new algorithm is implemented, NO Production
// Solver file is touched. Verifies Prototype Refinement Sprint v1's own
// conclusion (single-wing-relocation Bridge is structurally insufficient)
// and designs 4 alternative Primitive mechanisms, assesses their
// structural feasibility, estimates their theoretical capability ceiling
// (grounded in real component-count data recomputed from the same 41
// real PRIMITIVE_FAILURE cases, via the unmodified ComponentDetection.ts),
// builds a Cost/Benefit matrix, and computes a real Pareto Frontier to
// select which Blueprint(s) the next Sprint should implement. See
// docs/PARITY_GATED_CYCLE_ALTERNATIVE_BLUEPRINT_V1.md for the full
// STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { PIPELINE_STAGES, FAILURE_MODEL_SUMMARY } from "./solverPrimitiveParityAlternativeBlueprint/FailureModel";
import { ALTERNATIVE_MECHANISMS } from "./solverPrimitiveParityAlternativeBlueprint/AlternativeMechanisms";
import { STRUCTURAL_FEASIBILITY } from "./solverPrimitiveParityAlternativeBlueprint/StructuralFeasibility";
import { computeStructuralGrounding, estimateTheoreticalCapability } from "./solverPrimitiveParityAlternativeBlueprint/CounterfactualCapabilityAnalysis";
import { buildCostBenefitMatrix, computeParetoFrontier } from "./solverPrimitiveParityAlternativeBlueprint/CostBenefitMatrix";
import { selectBlueprint } from "./solverPrimitiveParityAlternativeBlueprint/BlueprintSelection";

const DATA_DIR = "src/customCube/solverPrimitiveParityAlternativeBlueprint/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-alternative-blueprint-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-alternative-blueprint-v1-result.json`;
const PRIOR_RESULT_JSON_PATH = "src/customCube/solverPrimitiveParityGatedCyclePrototypeRefinement/data/parity-gated-cycle-prototype-refinement-v1-result.json";

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("STEP1: Existing Primitive Failure Model...");
  for (const stage of PIPELINE_STAGES) {
    console.log(`  [${stage.name}] realFailureShare=${stage.realFailureSharePercent ?? "N/A"}`);
  }

  console.log("STEP2: Alternative Mechanism Survey...");
  for (const m of ALTERNATIVE_MECHANISMS) console.log(`  [${m.id}] ${m.name}`);

  console.log("STEP3: Structural Feasibility...");
  for (const f of STRUCTURAL_FEASIBILITY) {
    console.log(`  [${f.mechanismId}] production scope: ${f.productionModificationScope.join(" | ")}`);
  }

  console.log("STEP4: Counterfactual Capability Analysis (real grounding data)...");
  const priorResult = JSON.parse(fs.readFileSync(PRIOR_RESULT_JSON_PATH, "utf-8"));
  const candidateGenerationFailureLabels: Set<string> = new Set(
    priorResult.taxonomyPerCase.filter((c: { category: string }) => c.category === "CANDIDATE_GENERATION_FAILURE").map((c: { label: string }) => c.label)
  );
  const allFailureLabels: Set<string> = new Set(priorResult.taxonomyPerCase.map((c: { label: string }) => c.label));
  const allHoles = loadRawHoleDataset();
  const failureHoles: HoleCase[] = allHoles.filter((h) => allFailureLabels.has(h.label));
  const observedSingleWingValidRate = priorResult.candidateAudit.avgValidCount / priorResult.candidateAudit.avgPairsAttempted;
  const grounding = computeStructuralGrounding(failureHoles, candidateGenerationFailureLabels, observedSingleWingValidRate);
  console.log(`  totalFailureCases=${grounding.totalFailureCases}, exactlyTwoComponents=${grounding.exactlyTwoComponentsCount}, moreThanTwoComponents=${grounding.moreThanTwoComponentsCount}`);
  const capability = estimateTheoreticalCapability(grounding);
  for (const c of capability) console.log(`  [${c.mechanismId}] applicable=${c.applicablePopulationPercent.toFixed(1)}%, range=[${c.estimatedResolutionPercentRange[0].toFixed(1)}, ${c.estimatedResolutionPercentRange[1].toFixed(1)}], confidence=${c.confidenceLevel}`);

  console.log("STEP5: Cost/Benefit Matrix + Pareto Frontier...");
  const matrix = buildCostBenefitMatrix(STRUCTURAL_FEASIBILITY, capability);
  for (const r of matrix) console.log(`  [${r.mechanismId}] capability=${r.capabilityScore.toFixed(1)}, complexity=${r.complexityScore}, risk=${r.riskScore}, productionImpact=${r.productionImpactScore}`);
  const pareto = computeParetoFrontier(matrix);
  console.log(`  frontier=${pareto.frontier.join(", ")}`);

  console.log("STEP6: Blueprint Selection...");
  const selection = selectBlueprint(matrix, pareto);
  console.log(`  finalDecision=${selection.finalDecision}`);
  console.log(`  rationale: ${selection.finalDecisionRationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Alternative Primitive Blueprint Sprint v1 -- Report ===");
  push();
  push("STEP1. Existing Primitive Failure Model");
  for (const stage of PIPELINE_STAGES) {
    push(`  [${stage.name}] ${stage.description}`);
    push(`    realFailureSharePercent=${stage.realFailureSharePercent ?? "N/A"} (${stage.failureShareSource})`);
  }
  push(`  요약: ${FAILURE_MODEL_SUMMARY}`);
  push();
  push("STEP2. Alternative Mechanism Survey (4 candidates)");
  for (const m of ALTERNATIVE_MECHANISMS) {
    push(`  [${m.id}] ${m.name}`);
    push(`    설명: ${m.description}`);
    push(`    차이점: ${m.mechanismDifference}`);
    push(`    기대효과: ${m.expectedEffect}`);
    push(`    복잡도: ${m.complexityNote}`);
  }
  push();
  push("STEP3. Structural Feasibility");
  for (const f of STRUCTURAL_FEASIBILITY) {
    push(`  [${f.mechanismId}]`);
    for (const l of f.layerImpacts) push(`    ${l.layer}: ${l.impact} -- ${l.note}`);
    push(`    Production 수정 범위: ${f.productionModificationScope.join(" | ")}`);
    push(`    요약: ${f.feasibilitySummary}`);
  }
  push();
  push("STEP4. Counterfactual Capability Analysis");
  push(`  구조적 그라운딩: totalFailureCases=${grounding.totalFailureCases}, exactlyTwoComponents=${grounding.exactlyTwoComponentsCount}(${((grounding.exactlyTwoComponentsCount / grounding.totalFailureCases) * 100).toFixed(1)}%), moreThanTwoComponents=${grounding.moreThanTwoComponentsCount}(${((grounding.moreThanTwoComponentsCount / grounding.totalFailureCases) * 100).toFixed(1)}%)`);
  push(`  observedSingleWingValidRate=${(grounding.observedSingleWingValidRate * 100).toFixed(2)}% (Prototype Refinement Sprint v1 STEP2 cited)`);
  for (const c of capability) {
    push(`  [${c.mechanismId}] applicablePopulation=${c.applicablePopulationPercent.toFixed(1)}%, estimatedRange=[${c.estimatedResolutionPercentRange[0].toFixed(1)}%, ${c.estimatedResolutionPercentRange[1].toFixed(1)}%], confidence=${c.confidenceLevel}`);
    push(`    근거: ${c.rationale}`);
  }
  push();
  push("STEP5. Cost/Benefit Matrix + Pareto Frontier");
  for (const r of matrix) {
    push(`  [${r.mechanismId}] capability=${r.capabilityScore.toFixed(1)}, complexity=${r.complexityScore}, risk=${r.riskScore}, productionImpact=${r.productionImpactScore}, loopOrDivergenceRisk=${r.loopOrDivergenceRisk}`);
  }
  push(`  Pareto Frontier (${pareto.frontier.length}개): ${pareto.frontier.join(", ")}`);
  if (Object.keys(pareto.dominatedBy).length > 0) {
    push(`  지배당하는 후보: ${Object.entries(pareto.dominatedBy).map(([k, v]) => `${k} <- ${v!.join(",")}`).join(" | ")}`);
  }
  push();
  push("STEP6. Blueprint Selection");
  push(`  paretoFrontierSize=${selection.paretoFrontierSize}`);
  push(`  frontierMechanisms=${selection.frontierMechanisms.join(", ")}`);
  if (selection.recommendedForComparativeSprint.length > 0) {
    push(`  recommendedForComparativeSprint=${selection.recommendedForComparativeSprint.join(", ")}`);
  }
  push(`  finalDecision=${selection.finalDecision}`);
  push(`  rationale: ${selection.finalDecisionRationale}`);
  push(`  Level1(대체 Primitive >=4개 설계)=${selection.level1Pass ? "PASS" : "FAIL"} (n=${selection.level1MechanismCount})`);
  push(`  Level2(구조적 비교 완료)=${selection.level2StructuralComparisonDone ? "PASS" : "FAIL"}`);
  push(`  Level3(구현 대상 하나 확정)=${selection.level3SingleTargetConfirmed ? "PASS" : "PARTIAL(복수 후보 -- Comparative Prototype Sprint로 좁혀야 함)"}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        pipelineStages: PIPELINE_STAGES,
        failureModelSummary: FAILURE_MODEL_SUMMARY,
        alternativeMechanisms: ALTERNATIVE_MECHANISMS,
        structuralFeasibility: STRUCTURAL_FEASIBILITY,
        structuralGrounding: grounding,
        capabilityEstimates: capability,
        costBenefitMatrix: matrix,
        pareto,
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
