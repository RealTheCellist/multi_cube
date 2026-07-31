// Solver Primitive Discovery Sprint #5 -- Unresolved Mechanism Validation
// Sprint v1 -- driver.
//   npx tsx src/customCube/runUnresolvedMechanismValidationV1.ts
//
// No new Primitive designed. Determines whether the residual left behind
// by Bridge Injection Refinement Sprint v1 + Deep Cycle Refinement Sprint
// v1 (both Decision B, both confirmed at their own Gate/Search parameter
// optimization limit) genuinely requires a new mechanism, or is solvable
// via combination/ordering/budget of the 6 real, already-implemented
// Primitives this arc has built. Read-only; every Primitive prototype
// file is called via PrimitiveRegistry.ts, none modified.
import * as fs from "fs";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { collectUnresolvedHoles } from "./unresolvedMechanismValidationV1/UnresolvedHoleCollection";
import { attributeAllCases } from "./unresolvedMechanismValidationV1/ExistingPrimitiveAttribution";
import { tryCombinationsForAllCases } from "./unresolvedMechanismValidationV1/CounterfactualCombination";
import { checkBudgetSensitivity, EXTENDED_DEADLINE_MS } from "./unresolvedMechanismValidationV1/BudgetSensitivityCheck";
import { classifyAllResiduals, type ResidualCategory } from "./unresolvedMechanismValidationV1/ResidualClassification";
import { summarizeUnknownMechanism } from "./unresolvedMechanismValidationV1/CommonMechanismAnalysis";
import { decideUnresolvedMechanism } from "./unresolvedMechanismValidationV1/UnresolvedMechanismDecision";

const DATA_DIR = "src/customCube/unresolvedMechanismValidationV1/data";
const REPORT_PATH = `${DATA_DIR}/unresolved-mechanism-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/unresolved-mechanism-validation-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lib = buildWingLibrary();

  console.log("STEP1: Re-collecting unresolved holes (never rescued by anything tried in Bridge Injection Refinement v1 or Deep Cycle Refinement v1)...");
  const unresolvedCases = collectUnresolvedHoles(lib);
  const biCount = unresolvedCases.filter((c) => c.sourceBlueprint === "Bridge Injection").length;
  const dcCount = unresolvedCases.filter((c) => c.sourceBlueprint === "Deep Cycle").length;
  console.log(`  Bridge Injection unresolved: ${biCount}, Deep Cycle unresolved: ${dcCount}, total: ${unresolvedCases.length}`);

  console.log("STEP2: Existing Primitive Attribution (6 real Primitives, multiple attributions allowed)...");
  const attributions = attributeAllCases(unresolvedCases, lib);
  for (const name of ["DeepCycle(BP-1)", "CCR", "MultiHopBridge", "ConflictBreakingSacrifice", "ParityCycleSpecialist(BP-2)", "MixedCommutator"] as const) {
    const matchedCount = attributions.filter((a) => a.attempts[name].matched).length;
    const improvedCount = attributions.filter((a) => a.attempts[name].improvedAlone).length;
    console.log(`  [${name}] matched=${matchedCount}/${attributions.length}, improvedAlone=${improvedCount}/${attributions.length}`);
  }

  console.log("STEP3: Counterfactual Combination (2-step sequences using Primitives that produced any moves)...");
  const combos = tryCombinationsForAllCases(unresolvedCases, attributions, lib);
  const anySolvedByCombo = combos.filter((c) => c.anySolved).length;
  const anyImprovedByCombo = combos.filter((c) => c.anyImproved).length;
  console.log(`  anySolvedByCombo=${anySolvedByCombo}, anyImprovedByCombo(incl solved)=${anyImprovedByCombo}, avg combosTried=${(combos.reduce((s, c) => s + c.combosTried, 0) / combos.length).toFixed(1)}`);

  console.log(`STEP3.5: Budget Sensitivity Check (only for cases unresolved after STEP2+STEP3, extended deadline=${EXTENDED_DEADLINE_MS}ms)...`);
  const stillUnresolvedAfterCombo = unresolvedCases.filter((uc) => {
    const a = attributions.find((x) => x.label === uc.label)!;
    const c = combos.find((x) => x.label === uc.label)!;
    return !a.anyImprovedAlone && !c.anyImproved;
  });
  console.log(`  ${stillUnresolvedAfterCombo.length}/${unresolvedCases.length} cases need a budget check`);
  const budgetChecks = stillUnresolvedAfterCombo.map((uc) => checkBudgetSensitivity(uc.label, uc.hole.cubies, lib));
  const budgetHelped = budgetChecks.filter((b) => b.improvedAtExtendedBudget).length;
  console.log(`  budgetHelped=${budgetHelped}/${budgetChecks.length}`);

  console.log("STEP4: Residual Classification...");
  const classifications = classifyAllResiduals(attributions, combos, budgetChecks);
  const breakdown: Record<ResidualCategory, number> = { EXISTING_SINGLE_PRIMITIVE: 0, EXISTING_COMBINATION: 0, EXISTING_ORDERING: 0, EXISTING_BUDGET: 0, TRULY_UNKNOWN: 0 };
  for (const c of classifications) breakdown[c.category]++;
  for (const [cat, count] of Object.entries(breakdown)) console.log(`  ${cat}: ${count}/${classifications.length}`);

  console.log("STEP5: Common Mechanism Analysis (TRULY_UNKNOWN only, feature summary, no new Primitive design)...");
  const unknownSummary = summarizeUnknownMechanism(unresolvedCases, classifications);
  console.log(`  unknownCount=${unknownSummary.unknownCount}, dominantTaxonomyClass=${unknownSummary.dominantTaxonomyClass}(${(unknownSummary.dominantTaxonomyClassShare * 100).toFixed(1)}%)`);

  console.log("STEP6: Decision...");
  const decisionResult = decideUnresolvedMechanism(classifications, unknownSummary);
  console.log(`  classifiedFraction=${(decisionResult.classifiedFraction * 100).toFixed(1)}%, Level1=${decisionResult.level1Pass}, Level2=${decisionResult.level2Pass}, Level3=${decisionResult.level3Pass}`);
  console.log(`  Decision: ${decisionResult.decision} -- ${decisionResult.rationale}`);

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Discovery Sprint #5 -- Unresolved Mechanism Validation Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Residual population: Bridge Injection unresolved=${biCount}, Deep Cycle unresolved=${dcCount}, total=${unresolvedCases.length}`);
  push();

  push("STEP1. Unresolved Hole Collection");
  push(`  Bridge Injection unresolved(never rescued by any of its own 7 Gate + 10 Search Contract + combined-best configs): ${biCount}`);
  push(`  Deep Cycle unresolved(never rescued by any of its own 10 Gate + 10 Search Contract + combined-best configs): ${dcCount}`);
  push();

  push("STEP2. Existing Primitive Attribution (6 real Primitives, multiple attributions allowed)");
  for (const name of ["DeepCycle(BP-1)", "CCR", "MultiHopBridge", "ConflictBreakingSacrifice", "ParityCycleSpecialist(BP-2)", "MixedCommutator"] as const) {
    const matchedCount = attributions.filter((a) => a.attempts[name].matched).length;
    const improvedCount = attributions.filter((a) => a.attempts[name].improvedAlone).length;
    push(`  [${name}] matched=${matchedCount}/${attributions.length}, improvedAlone=${improvedCount}/${attributions.length}`);
  }
  push();

  push("STEP3. Counterfactual Combination (2-step sequences)");
  push(`  anySolvedByCombo=${anySolvedByCombo}/${combos.length}, anyImprovedByCombo(incl solved)=${anyImprovedByCombo}/${combos.length}`);
  push(`  avg combosTried per case=${(combos.reduce((s, c) => s + c.combosTried, 0) / combos.length).toFixed(1)}`);
  push();

  push(`STEP3.5. Budget Sensitivity Check (extended deadline=${EXTENDED_DEADLINE_MS}ms, only cases unresolved after STEP2+STEP3)`);
  push(`  checked=${budgetChecks.length}, budgetHelped=${budgetHelped}`);
  push();

  push("STEP4. Residual Classification");
  for (const [cat, count] of Object.entries(breakdown)) push(`  ${cat}: ${count}/${classifications.length} (${((count / classifications.length) * 100).toFixed(1)}%)`);
  push();
  push("  Per-case detail:");
  for (const c of classifications) push(`    [${c.sourceBlueprint}] ${c.label}: ${c.category} -- ${c.evidence}`);
  push();

  push("STEP5. Common Mechanism Analysis (TRULY_UNKNOWN only)");
  push(`  unknownCount=${unknownSummary.unknownCount}`);
  push(`  taxonomyClassBreakdown: ${JSON.stringify(unknownSummary.taxonomyClassBreakdown)}`);
  push(`  dominantTaxonomyClass=${unknownSummary.dominantTaxonomyClass} (${(unknownSummary.dominantTaxonomyClassShare * 100).toFixed(1)}% of Unknown)`);
  push(`  sourceBlueprintBreakdown: ${JSON.stringify(unknownSummary.sourceBlueprintBreakdown)}`);
  push(`  meanCycleCount=${unknownSummary.meanCycleCount.toFixed(2)}, meanCycleLength=${unknownSummary.meanCycleLength.toFixed(2)}, meanConflictEdgeCount=${unknownSummary.meanConflictEdgeCount.toFixed(2)}, parityShare=${(unknownSummary.parityShare * 100).toFixed(1)}%`);
  push();

  push("STEP6. Decision");
  push(`  Level1(Residual >=80% classified): ${decisionResult.level1Pass} (${(decisionResult.classifiedFraction * 100).toFixed(1)}%)`);
  push(`  Level2(Unknown 집합 추출): ${decisionResult.level2Pass}`);
  push(`  Level3(Unknown 공통 메커니즘, dominant class >=60%): ${decisionResult.level3Pass}`);
  push(`  Decision: ${decisionResult.decision}`);
  push(`  Rationale: ${decisionResult.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        unresolvedLabels: unresolvedCases.map((c) => ({ label: c.label, sourceBlueprint: c.sourceBlueprint })),
        attributions,
        combos,
        budgetChecks,
        classifications,
        unknownSummary,
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
