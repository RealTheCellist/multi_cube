// Multi-Component Merge Production Validation Sprint v1 -- driver
// (Final Capability Qualification, Product Validation -- no production
// code change of this Sprint's own).
//
// Usage:
//   npx tsx .../runMultiComponentMergeProductionValidationV1.ts capture baseline
//   npx tsx .../runMultiComponentMergeProductionValidationV1.ts capture integrated
//   npx tsx .../runMultiComponentMergeProductionValidationV1.ts compare
//
// "capture <label>" runs the real, full end-to-end FiveByFiveEdgeSolverEngine
// .solve() over the full 142-case Hole Dataset at TODAY'S ON-DISK production
// defaults and writes data/{label}-raw.json. "baseline" = pre-Short-Circuit-
// fix state (git-checkout the parent of commit e386da8 for
// fiveByFiveEdgeRecovery.ts only, run, then restore HEAD) -- the exact same
// toggle mechanism the Short-Circuit Production Integration Sprint itself
// used, since this one-line fix has no runtime flag. "integrated" = current
// production (fix present). "compare" loads both raw captures and runs
// STEP3 (Statistical Validation) + STEP4 (Primitive Interaction Audit) +
// STEP5 (Validation Framework) + STEP6 (Product Qualification), never
// re-running the replay itself.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { auditOperatingContract } from "./solverPrimitiveMultiComponentMergeProductionValidation/ContractAudit";
import { runPopulationReplay } from "./solverPrimitiveMultiComponentMergeProductionValidation/PopulationReplay";
import type { EndToEndSolveResult } from "./solverPrimitiveMultiComponentMergeProductionValidation/EndToEndSolveProbe";
import { compareBaselineVsIntegrated } from "./solverPrimitiveMultiComponentMergeProductionValidation/StatisticalValidation";
import { buildPrimitiveInteractionMatrix } from "./solverPrimitiveMultiComponentMergeProductionValidation/PrimitiveInteractionAudit";
import { runValidationFramework } from "./solverPrimitiveMultiComponentMergeProductionValidation/ValidationFramework";
import { evaluateProductQualification } from "./solverPrimitiveMultiComponentMergeProductionValidation/ProductQualification";

const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeProductionValidation/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-production-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-production-validation-v1-result.json`;

function rawPath(label: string) {
  return `${DATA_DIR}/${label}-raw.json`;
}

function capture(label: string) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[${label}] Loading Hole Dataset (n=142)...`);
  const holes = loadRawHoleDataset();

  console.log(`[${label}] STEP1: Operating Contract Audit (only meaningful for the integrated capture, run anyway for record)...`);
  const contractAudit = auditOperatingContract();
  console.log(`  allShortCircuitTypesPresent=${contractAudit.allShortCircuitTypesPresent}, noDriftSinceFix=${contractAudit.noDriftSinceFix}`);

  console.log(`[${label}] STEP2: Large Population Replay (real end-to-end solve(), today's on-disk production defaults, N=142)...`);
  const start = Date.now();
  const population = runPopulationReplay(holes);
  const improvedCount = population.filter((r) => r.improved).length;
  const solvedCount = population.filter((r) => r.solved).length;
  const regressionCount = population.filter((r) => r.wrongWingAfter > r.wrongWingBefore).length;
  console.log(`  improvedCount=${improvedCount}, solvedCount=${solvedCount}, regressionCount=${regressionCount}, wallMs=${Date.now() - start}`);

  fs.writeFileSync(rawPath(label), JSON.stringify({ label, contractAudit, population }, null, 2), "utf-8");
  console.log(`[${label}] raw capture written: ${rawPath(label)}`);
}

function compare() {
  const baselineRaw = JSON.parse(fs.readFileSync(rawPath("baseline"), "utf-8"));
  const integratedRaw = JSON.parse(fs.readFileSync(rawPath("integrated"), "utf-8"));
  const baseline: EndToEndSolveResult[] = baselineRaw.population;
  const integrated: EndToEndSolveResult[] = integratedRaw.population;
  const contractAudit = integratedRaw.contractAudit;

  console.log("STEP3: Statistical Validation (primary=improvedCount, secondary=solvedCount)...");
  const comparison = compareBaselineVsIntegrated(baseline, integrated);
  console.log(`  improvedCountDiff mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  console.log(`  solvedCountDiff mean=${comparison.solvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.solvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.solvedCountDiff.stats.ciUpper.toFixed(4)}]`);

  console.log("STEP4: Primitive Interaction Audit (vs REPAIR/CCR/MIXED_COMMUTATOR/PARITY_GATED_CYCLE/SETUP)...");
  const interaction = buildPrimitiveInteractionMatrix(baseline, integrated);
  for (const r of interaction.rows) console.log(`  ${r.type}: competition=${r.competitionCount}, starvedByMcm=${r.starvedByMcmCount}, duplicateWithMcm=${r.duplicateWithMcmCount}, replacedByMcm=${r.replacedByMcmCount}`);
  console.log(`  totalDuplicateCount=${interaction.totalDuplicateCount}, totalStarvedTypeCount=${interaction.totalStarvedTypeCount}`);

  console.log("STEP5: Validation Framework (Category C Gate list: A/B/C/E)...");
  const framework = runValidationFramework(comparison, interaction.totalDuplicateCount, interaction.totalStarvedTypeCount);
  for (const g of framework.gateResults) console.log(`  Gate ${g.gate}(${g.name})=${g.status}`);
  console.log(`  pipelineDecision=${framework.pipelineResult.decision}`);

  console.log("STEP6: Product Qualification...");
  const newRegressionCount = integrated.filter((intRow) => {
    const baseRow = baseline.find((b) => b.hash === intRow.hash);
    const intRegressed = intRow.wrongWingAfter > intRow.wrongWingBefore;
    const baseRegressed = baseRow ? baseRow.wrongWingAfter > baseRow.wrongWingBefore : false;
    return intRegressed && !baseRegressed;
  }).length;
  const qualification = evaluateProductQualification(contractAudit, comparison, newRegressionCount, framework);
  console.log(`  Level1=${qualification.level1Pass}, Level2=${qualification.level2Pass}, Level3=${qualification.level3Pass}, Level4=${qualification.level4Pass}`);
  console.log(`  Decision=${qualification.decision}`);

  const baseImproved = baseline.filter((r) => r.improved).length;
  const intImproved = integrated.filter((r) => r.improved).length;
  const baseSolved = baseline.filter((r) => r.solved).length;
  const intSolved = integrated.filter((r) => r.solved).length;

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Validation Sprint v1 -- Report ===");
  push("(Final Capability Qualification -- Product Validation, no production code change)");
  push();
  push("STEP1. Operating Contract Audit");
  push(`  matchedLine: ${contractAudit.matchedLine}`);
  push(`  allShortCircuitTypesPresent=${contractAudit.allShortCircuitTypesPresent}, presentTypes=${contractAudit.presentTypes.join(", ")}`);
  push(`  noDriftSinceFix=${contractAudit.noDriftSinceFix} (diff vs e386da8 for all protected files: "${contractAudit.diffSinceFixCommit || "(empty)"}")`);
  push();
  push("STEP2. Large Population Replay (real end-to-end solve(), N=142, today's production defaults)");
  push(`  Baseline(pre-fix): improvedCount=${baseImproved}, solvedCount=${baseSolved}`);
  push(`  Integrated(current production): improvedCount=${intImproved}, solvedCount=${intSolved}`);
  push();
  push("STEP3. Statistical Validation");
  push(`  improvedCountDiff(primary) mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${comparison.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${comparison.improvedCountDiff.effectSize.magnitude})`);
  push(`  solvedCountDiff(secondary) mean=${comparison.solvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.solvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.solvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  push(`  runtimeDiffMs mean=${comparison.runtimeDiffMs.stats.mean.toFixed(1)}ms, 95% CI=[${comparison.runtimeDiffMs.stats.ciLower.toFixed(1)}, ${comparison.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`);
  push();
  push("STEP4. Primitive Interaction Matrix");
  for (const r of interaction.rows) push(`  ${r.type}: competition=${r.competitionCount}, starvedByMcm=${r.starvedByMcmCount}, duplicateWithMcm=${r.duplicateWithMcmCount}, replacedByMcm=${r.replacedByMcmCount}`);
  push(`  totalDuplicateCount=${interaction.totalDuplicateCount}, totalStarvedTypeCount=${interaction.totalStarvedTypeCount}`);
  push();
  push("STEP5. Validation Framework");
  for (const g of framework.gateResults) push(`  Gate ${g.gate}(${g.name})=${g.status} -- ${g.evidence}`);
  push(`  pipelineDecision=${framework.pipelineResult.decision}: ${framework.pipelineResult.decisionRationale}`);
  push();
  push("STEP6. Product Qualification");
  push(`  newRegressionCount=${newRegressionCount}`);
  push(`  Level1(Contract Audit)=${qualification.level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level2(Capability 95% CI 하한>0)=${qualification.level2Pass ? "PASS" : "FAIL"}`);
  push(`  Level3(Regression 0)=${qualification.level3Pass ? "PASS" : "FAIL"}`);
  push(`  Level4(Validation Framework Decision A)=${qualification.level4Pass ? "PASS" : "FAIL"}`);
  push(`  Decision = ${qualification.decision}`);
  push(`  rationale: ${qualification.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        contractAudit,
        baselineSummary: { improvedCount: baseImproved, solvedCount: baseSolved },
        integratedSummary: { improvedCount: intImproved, solvedCount: intSolved },
        comparison,
        interaction,
        framework,
        newRegressionCount,
        qualification,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

const mode = process.argv[2];
if (mode === "capture") {
  const label = process.argv[3];
  if (label !== "baseline" && label !== "integrated") throw new Error("usage: capture <baseline|integrated>");
  capture(label);
} else if (mode === "compare") {
  compare();
} else {
  throw new Error("usage: capture <baseline|integrated> | compare");
}
