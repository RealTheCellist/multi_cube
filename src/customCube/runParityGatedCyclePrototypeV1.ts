// Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Prototype
// Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCyclePrototypeV1.ts
//
// Implements Candidate A (Cross-Component Bridge Cycle Resolver, selected
// by Parity-Gated Cycle Blueprint Sprint v1's own Decision A) as a real,
// independent Prototype and empirically verifies whether it produces
// statistically significant Capability improvement over existing
// Primitives on the SAME 53-case TRULY_UNKNOWN population. Production
// Solver untouched -- see docs/PARITY_GATED_CYCLE_PROTOTYPE_V1.md for the
// full protected-file verification and the STEP1 bridge-mechanism
// debugging journey (two dead ends, one measurement-bug fix) disclosed in
// full.
import * as fs from "fs";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { loadUnknownPopulation } from "./parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { detectComponents } from "./parityGatedCyclePrototypeV1/ComponentDetection";
import { evaluatePopulation, summarizeOutcomes, NO_OP_BASELINE } from "./parityGatedCyclePrototypeV1/CapabilityMeasurement";
import { tryCrossComponentBridgeCycleResolverConfigured, FULL_CONFIG } from "./parityGatedCyclePrototypeV1/CrossComponentBridgeCycleResolver";
import { runAblation } from "./parityGatedCyclePrototypeV1/AblationAnalysis";
import { runExistingPrimitiveComparison } from "./parityGatedCyclePrototypeV1/ExistingPrimitiveComparison";
import { buildPairedComparison, runValidationFramework } from "./parityGatedCyclePrototypeV1/StatisticalValidation";
import { decideFinal } from "./parityGatedCyclePrototypeV1/FinalDecision";

const DATA_DIR = "src/customCube/parityGatedCyclePrototypeV1/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-prototype-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-prototype-v1-result.json`;
const PER_CASE_DEADLINE_MS = 2000;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lib = buildWingLibrary();

  console.log("STEP2: Unknown Population Replay (loadUnknownPopulation(), unmodified -- no new dataset)...");
  const cases = loadUnknownPopulation();
  const multiComponentCases = cases.filter((c) => detectComponents(c.hole.cubies).components.length > 1);
  console.log(`  Unknown Population n=${cases.length}, componentCount>1 subset=${multiComponentCases.length}`);

  console.log("STEP3: Capability measurement -- Baseline(no-op) vs Prototype(FULL_CONFIG) on the full 53-case population...");
  const baselineOutcomes = evaluatePopulation(cases, lib, PER_CASE_DEADLINE_MS, NO_OP_BASELINE);
  const baselineSummary = summarizeOutcomes("baseline(no-op)", baselineOutcomes);
  const prototypeOutcomes = evaluatePopulation(cases, lib, PER_CASE_DEADLINE_MS, (cubies, l, deadline) => tryCrossComponentBridgeCycleResolverConfigured(cubies, l, deadline, FULL_CONFIG));
  const prototypeSummary = summarizeOutcomes("prototype(full)", prototypeOutcomes);
  console.log(`  baseline: solved=${baselineSummary.solvedCount}, improved=${baselineSummary.improvedCount}, rescueRate=${(baselineSummary.rescueRate * 100).toFixed(1)}%`);
  console.log(`  prototype: solved=${prototypeSummary.solvedCount}, improved=${prototypeSummary.improvedCount}, rescueRate=${(prototypeSummary.rescueRate * 100).toFixed(1)}%, gateMatched=${prototypeSummary.gateMatchedCount}, trueRegression=${prototypeSummary.trueRegressionCount}, avgRuntimeMs=${prototypeSummary.avgRuntimeMs.toFixed(1)}`);

  console.log("STEP4: Ablation (sequential removal of Bridge/Traversal/Cleanup/ComponentSelection)...");
  const ablation = runAblation(cases, lib, PER_CASE_DEADLINE_MS);
  for (const a of ablation) {
    console.log(`  [${a.config.label}] improved=${a.summary.improvedCount}, rescueRate=${(a.summary.rescueRate * 100).toFixed(1)}%, trueRegression=${a.summary.trueRegressionCount}`);
  }

  console.log("STEP5: Comparison vs existing real Primitives (BP-1, CCR, MixedCommutator, MultiHopBridge)...");
  const comparison = runExistingPrimitiveComparison(cases, lib, PER_CASE_DEADLINE_MS);
  for (const c of comparison) {
    console.log(`  [${c.name}] improved=${c.summary.improvedCount}, rescueRate=${(c.summary.rescueRate * 100).toFixed(1)}%`);
  }

  console.log("STEP6: Statistical Validation (Validation Framework, Category C, prototype stage)...");
  const pairedComparison = buildPairedComparison(baselineOutcomes, prototypeOutcomes);
  const framework = runValidationFramework(pairedComparison);
  console.log(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  console.log(`  pipeline decision=${framework.pipelineResult.decision}, meetsMinN=${framework.pipelineResult.meetsMinN} (n=${framework.pipelineResult.nUsed})`);

  const finalDecision = decideFinal(prototypeSummary, ablation, pairedComparison);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Prototype Sprint v1 -- Report ===");
  push();
  push("STEP2. Unknown Population Replay");
  push(`  n=${cases.length}, componentCount>1 subset=${multiComponentCases.length}`);
  push();
  push("STEP3. Capability Measurement (Baseline vs Prototype)");
  push(`  baseline: n=${baselineSummary.n}, solved=${baselineSummary.solvedCount}, improved=${baselineSummary.improvedCount}, rescueRate=${(baselineSummary.rescueRate * 100).toFixed(1)}%, trueRegression=${baselineSummary.trueRegressionCount}, avgRuntimeMs=${baselineSummary.avgRuntimeMs.toFixed(1)}`);
  push(`  prototype: n=${prototypeSummary.n}, gateMatched=${prototypeSummary.gateMatchedCount}, solved=${prototypeSummary.solvedCount}, improved=${prototypeSummary.improvedCount}, rescueRate=${(prototypeSummary.rescueRate * 100).toFixed(1)}%, trueRegression=${prototypeSummary.trueRegressionCount}, avgRuntimeMs=${prototypeSummary.avgRuntimeMs.toFixed(1)}`);
  push(`  rescued labels: ${prototypeOutcomes.filter((o) => o.improved).map((o) => o.label).join(", ") || "(none)"}`);
  push();
  push("STEP4. Ablation");
  for (const a of ablation) {
    push(`  [${a.config.label}] gateMatched=${a.summary.gateMatchedCount}, improved=${a.summary.improvedCount}, rescueRate=${(a.summary.rescueRate * 100).toFixed(1)}%, trueRegression=${a.summary.trueRegressionCount}, avgRuntimeMs=${a.summary.avgRuntimeMs.toFixed(1)}`);
  }
  push();
  push("STEP5. Existing Primitive Comparison (same population)");
  for (const c of comparison) {
    push(`  [${c.name}] gateMatched=${c.summary.gateMatchedCount}, improved=${c.summary.improvedCount}, rescueRate=${(c.summary.rescueRate * 100).toFixed(1)}%, trueRegression=${c.summary.trueRegressionCount}`);
  }
  push();
  push("STEP6. Statistical Validation");
  push(`  n=${pairedComparison.n}`);
  push(`  improvedCount paired-diff: mean=${pairedComparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${pairedComparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${pairedComparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's dz=${pairedComparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)} (${pairedComparison.improvedCountDiffEvaluation.effectSize.magnitude})`);
  push(`  trueRegression paired-diff: mean=${pairedComparison.trueRegressionDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${pairedComparison.trueRegressionDiffEvaluation.stats.ciLower.toFixed(4)}, ${pairedComparison.trueRegressionDiffEvaluation.stats.ciUpper.toFixed(4)}]`);
  push(`  runtime paired-diff(ms): mean=${pairedComparison.runtimeDiffMsEvaluation.stats.mean.toFixed(2)}, baselineP95RuntimeMs=${pairedComparison.baselineP95RuntimeMs.toFixed(2)}`);
  push(`  gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}`);
  push(`  pipeline decision=${framework.pipelineResult.decision}, rationale=${framework.pipelineResult.decisionRationale}`);
  push();
  push("Level1-4 + Final Decision");
  for (const l of finalDecision.levels) {
    push(`  Level${l.level}(${l.label}): ${l.pass ? "PASS" : "FAIL"} -- ${l.detail}`);
  }
  push(`  Decision: ${finalDecision.decision}`);
  push(`  Rationale: ${finalDecision.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: cases.length,
        multiComponentN: multiComponentCases.length,
        baselineSummary,
        prototypeSummary,
        prototypeOutcomes,
        ablation: ablation.map((a) => ({ config: a.config, summary: a.summary })),
        comparison: comparison.map((c) => ({ name: c.name, summary: c.summary })),
        pairedComparison,
        gateResults: framework.gateResults,
        pipelineResult: framework.pipelineResult,
        finalDecision,
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
