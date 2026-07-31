// Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Blueprint
// Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleBlueprintV1.ts
//
// Analysis/design only. No new Primitive implemented, no solve() calls
// anywhere in this pipeline (STEP1/STEP2/STEP3/STEP4/STEP5/STEP6 are all
// pure structural-feature computation and Gate-predicate comparison).
// Production Solver, Validation Framework, and every existing Primitive
// prototype (BoundedResolver/CCR/MultiHopBridge/MixedCommutator) are
// read-only citations, never modified.
import * as fs from "fs";
import { loadUnknownPopulation } from "./parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { analyzeCausalFeatures } from "./parityGatedCycleBlueprintV1/StructuralCausalityAnalysis";
import { projectExistingPrimitives } from "./parityGatedCycleBlueprintV1/ExistingPrimitiveProjection";
import { BLUEPRINT_CANDIDATES } from "./parityGatedCycleBlueprintV1/BlueprintCandidates";
import { evaluateBlueprintCandidates } from "./parityGatedCycleBlueprintV1/BlueprintEvaluation";
import { selectFinalBlueprint } from "./parityGatedCycleBlueprintV1/FinalBlueprintSelection";

const DATA_DIR = "src/customCube/parityGatedCycleBlueprintV1/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-blueprint-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-blueprint-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log("STEP1: Unknown Population Profiling (53 TRULY_UNKNOWN cases, reused from Unresolved Mechanism Validation Sprint v1)...");
  const unknownCases = loadUnknownPopulation();
  console.log(`  loaded ${unknownCases.length} cases`);

  console.log("STEP2: Structural Causality Analysis (Ablation)...");
  const causal = analyzeCausalFeatures(unknownCases);
  for (const c of causal) {
    console.log(`  [${c.name}] coverage=${(c.coverageInUnknown * 100).toFixed(1)}%, baseline=${(c.baselineInFullPopulation * 100).toFixed(1)}%, lift=${c.lift.toFixed(2)}, ablationGap=${(c.ablationGap * 100).toFixed(1)}%`);
  }

  console.log("STEP3: Existing Primitive Projection (structure-only, no solve() calls)...");
  const projection = projectExistingPrimitives(unknownCases);
  for (const p of projection) {
    console.log(`  [${p.primitiveName}] structurallyEligible=${p.structurallyEligibleCount}/${unknownCases.length} (${(p.structurallyEligibleFraction * 100).toFixed(1)}%)`);
  }

  console.log("STEP4: Blueprint Candidate Generation (3 candidates, not implemented)...");
  for (const c of BLUEPRINT_CANDIDATES) console.log(`  [Candidate ${c.id}] ${c.name}`);

  console.log("STEP5: Blueprint Evaluation...");
  const evaluations = evaluateBlueprintCandidates(BLUEPRINT_CANDIDATES, unknownCases);
  for (const e of evaluations) {
    console.log(
      `  [Candidate ${e.candidateId}] explained=${e.explainedCount}/${unknownCases.length}(${(e.explainedFraction * 100).toFixed(1)}%), duplication=${(e.duplicationOverlapFraction * 100).toFixed(1)}%(excl.MixedCommutator=${(e.duplicationOverlapFractionExcludingMixedCommutator * 100).toFixed(1)}%), complexity=${e.qualitative.complexity}, productionRisk=${e.qualitative.productionRisk}`
    );
  }

  console.log("STEP6: Final Blueprint Selection...");
  const selection = selectFinalBlueprint(evaluations);
  for (const l of selection.candidateLevels) {
    console.log(`  [Candidate ${l.candidateId}] Level1=${l.level1Pass}, Level2=${l.level2Pass}, Level3=${l.level3Pass}, Level4=${l.level4Pass}, allPass=${l.allPass}`);
  }
  console.log(`  Decision: ${selection.decision} -- ${selection.rationale}`);

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Blueprint Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Unknown population: ${unknownCases.length} cases (TRULY_UNKNOWN from Unresolved Mechanism Validation Sprint v1, reused unmodified)`);
  push();

  push("STEP2. Structural Causality Analysis (Ablation)");
  for (const c of causal) {
    push(`  [${c.name}] coverage=${(c.coverageInUnknown * 100).toFixed(1)}%, baseline(full 142)=${(c.baselineInFullPopulation * 100).toFixed(1)}%, lift=${c.lift.toFixed(2)}, ablationGap=${(c.ablationGap * 100).toFixed(1)}%`);
  }
  push();

  push("STEP3. Existing Primitive Projection (structure-only, no solve() calls)");
  for (const p of projection) {
    push(`  [${p.primitiveName}] structurallyEligible=${p.structurallyEligibleCount}/${unknownCases.length} (${(p.structurallyEligibleFraction * 100).toFixed(1)}%)`);
    for (const [cond, failCount] of Object.entries(p.failingConditions)) push(`      fails "${cond}": ${failCount}/${unknownCases.length}`);
  }
  push();

  push("STEP4. Blueprint Candidates");
  for (const c of BLUEPRINT_CANDIDATES) {
    push(`  Candidate ${c.id}: ${c.name}`);
    push(`    목표 상태: ${c.targetState}`);
    push(`    Gate: ${c.gate.conditions.map((cond) => cond.name).join(" AND ")}`);
    push(`    예상 동작: ${c.expectedPrimitiveBehavior}`);
    push(`    기존과 차이: ${c.differenceFromExisting}`);
  }
  push();

  push("STEP5. Blueprint Evaluation");
  push("  | Candidate | Explained | Duplication(all) | Duplication(excl.MixedCommutator) | Complexity | Production Risk |");
  push("  |---|---:|---:|---:|---|---|");
  for (const e of evaluations) {
    push(
      `  | ${e.candidateId} | ${e.explainedCount}/${unknownCases.length}(${(e.explainedFraction * 100).toFixed(1)}%) | ${(e.duplicationOverlapFraction * 100).toFixed(1)}% | ${(e.duplicationOverlapFractionExcludingMixedCommutator * 100).toFixed(1)}% | ${e.qualitative.complexity} | ${e.qualitative.productionRisk} |`
    );
  }
  for (const e of evaluations) {
    push(`  [Candidate ${e.candidateId}] complexityRationale: ${e.qualitative.complexityRationale}`);
    push(`  [Candidate ${e.candidateId}] productionRiskRationale: ${e.qualitative.productionRiskRationale}`);
  }
  push();

  push("STEP6. Final Blueprint Selection");
  push(`  Level1 threshold=60%, Level2 duplication threshold=<50%`);
  for (const l of selection.candidateLevels) {
    push(`  [Candidate ${l.candidateId}] Level1=${l.level1Pass ? "PASS" : "FAIL"}, Level2=${l.level2Pass ? "PASS" : "FAIL"}, Level3=${l.level3Pass ? "PASS" : "FAIL"}, Level4=${l.level4Pass ? "PASS" : "FAIL"} => ${l.allPass ? "ALL PASS" : "not all pass"}`);
  }
  push(`  Decision: ${selection.decision}`);
  push(`  Rationale: ${selection.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        unknownLabels: unknownCases.map((c) => ({ label: c.label, sourceBlueprint: c.sourceBlueprint })),
        causal,
        projection,
        candidates: BLUEPRINT_CANDIDATES,
        evaluations,
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
