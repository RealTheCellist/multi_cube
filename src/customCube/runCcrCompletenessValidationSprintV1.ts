// CCR Completeness Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runCcrCompletenessValidationSprintV1.ts
//
// Research Sprint: measures whether the EXISTING, unmodified CCR (Clean-
// Cycle Resolution) implementation is search-complete, or whether its
// fixed MAX_LEAVES_EXPLORED=64 leaf cap is the real bottleneck -- per the
// Directive, CCR itself, the leaf cap, and every protected production
// file are left untouched. All instrumentation is a disclosed, fidelity-
// verified shadow reimplementation (CCRShadowInstrumentation.ts).
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { analyzeCcrGate } from "./solverPrimitiveCCRPrototype/CCRGate";
import { traversalNodesFor } from "./solverPrimitiveCCRPrototype/CCRPrototype";
import { checkFidelity, type FidelityCheckRow } from "./ccrCompletenessValidation/FidelityCheck";
import { runShadowDfs, type ShadowDfsInstrumentation } from "./ccrCompletenessValidation/CCRShadowInstrumentation";
import { estimateSearchSpace, type SearchSpaceEstimateRow } from "./ccrCompletenessValidation/SearchSpaceEstimation";
import {
  summarizeSearchFunnel,
  tallyTerminationReasons,
  summarizeCompletenessMatrix,
  classifyCompleteness,
  type PerCaseCompletenessRow,
} from "./ccrCompletenessValidation/CompletenessMatrix";
import { analyzeLeafCapImpact } from "./ccrCompletenessValidation/LeafCapImpactAnalysis";
import { assessCompleteness } from "./ccrCompletenessValidation/CompletenessAssessment";
import { computeDeepCycleStructuralProfile, type DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";

const DATA_DIR = "src/customCube/ccrCompletenessValidation/data";
const REPORT_PATH = `${DATA_DIR}/ccr-completeness-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/ccr-completeness-validation-v1-result.json`;

const FIDELITY_CHECK_BUDGET_MS = 5000;
const MAIN_ANALYSIS_BUDGET_MS = 15000;
const EXTENDED_RETEST_BUDGET_MS = 60000;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  const gateEligible = holes.filter((h) => analyzeCcrGate(h.cubies).eligible);
  log("init", `loaded ${holes.length} holes, ${gateEligible.length} CCR-Gate-eligible`);

  log("fidelity", `checking shadow-vs-real fidelity on all ${gateEligible.length} gate-eligible cases @ ${FIDELITY_CHECK_BUDGET_MS}ms...`);
  const fidelityRows: FidelityCheckRow[] = gateEligible.map((h) => checkFidelity(h.cubies, h.label, libs.lib, FIDELITY_CHECK_BUDGET_MS));
  const fidelityMismatches = fidelityRows.filter((r) => !r.matches);
  log("fidelity", `done -- ${fidelityMismatches.length}/${fidelityRows.length} mismatches`);

  log("main-analysis", `running shadow DFS instrumentation @ ${MAIN_ANALYSIS_BUDGET_MS}ms on all ${gateEligible.length} cases...`);
  const instrumentationByLabel = new Map<string, ShadowDfsInstrumentation>();
  const cycleLengthByLabel = new Map<string, number>();
  for (const h of gateEligible) {
    const gate = analyzeCcrGate(h.cubies);
    const nodes = traversalNodesFor(gate, "singleCycle"); // production's own genCCR always calls "singleCycle" -- matches real behavior
    const clone = cloneCubies(h.cubies);
    const deadline = Date.now() + MAIN_ANALYSIS_BUDGET_MS;
    const instrumentation = runShadowDfs(clone, nodes, libs.lib, deadline);
    instrumentationByLabel.set(h.label, instrumentation);
    cycleLengthByLabel.set(h.label, gate.primaryCycleLength);
  }
  log("main-analysis", "done");

  // Secondary re-test: any case whose PRIMARY run terminated on
  // BUDGET_EXPIRED (not LEAF_CAP_REACHED, not solved) gets one more try at
  // a much larger deadline (60000ms, 4x) -- distinguishes "just needed a
  // little more wall-clock time" from a genuine structural stall.
  const budgetExpiredLabels = gateEligible.filter((h) => instrumentationByLabel.get(h.label)!.terminationReason === "BUDGET_EXPIRED").map((h) => h.label);
  log("extended-retest", `${budgetExpiredLabels.length} case(s) hit BUDGET_EXPIRED @ ${MAIN_ANALYSIS_BUDGET_MS}ms -- retesting @ ${EXTENDED_RETEST_BUDGET_MS}ms...`);
  const extendedRetestByLabel = new Map<string, ShadowDfsInstrumentation>();
  for (const label of budgetExpiredLabels) {
    const h = gateEligible.find((c) => c.label === label)!;
    const gate = analyzeCcrGate(h.cubies);
    const nodes = traversalNodesFor(gate, "singleCycle");
    const clone = cloneCubies(h.cubies);
    const deadline = Date.now() + EXTENDED_RETEST_BUDGET_MS;
    extendedRetestByLabel.set(label, runShadowDfs(clone, nodes, libs.lib, deadline));
  }
  log("extended-retest", "done");

  // Use the extended-retest result (where one was run) as the case's final
  // recorded outcome -- gives BUDGET_EXPIRED cases every fair chance before
  // being counted against Completeness.
  const finalInstrumentationByLabel = new Map<string, ShadowDfsInstrumentation>();
  for (const h of gateEligible) {
    finalInstrumentationByLabel.set(h.label, extendedRetestByLabel.get(h.label) ?? instrumentationByLabel.get(h.label)!);
  }

  log("structural-profile", "computing structural profiles for gate-eligible cases...");
  const profileByLabel = new Map<string, DeepCycleStructuralProfile>();
  for (const h of gateEligible) profileByLabel.set(h.label, computeDeepCycleStructuralProfile(h.cubies, h.label, libs.lib));
  log("structural-profile", "done");

  const completenessRows: PerCaseCompletenessRow[] = gateEligible.map((h) => {
    const inst = finalInstrumentationByLabel.get(h.label)!;
    return { label: h.label, leavesExplored: inst.leavesExplored, maxDepthReached: inst.maxDepthReached, terminationReason: inst.terminationReason, solved: inst.solutionFound };
  });
  const searchSpaceRows: SearchSpaceEstimateRow[] = gateEligible.map((h) => estimateSearchSpace(h.label, cycleLengthByLabel.get(h.label)!, finalInstrumentationByLabel.get(h.label)!));

  const funnel = summarizeSearchFunnel(completenessRows);
  const terminationTally = tallyTerminationReasons(completenessRows);
  const completenessMatrix = summarizeCompletenessMatrix(completenessRows);
  const leafCapImpact = analyzeLeafCapImpact(completenessRows, searchSpaceRows, profileByLabel);
  const assessment = assessCompleteness(completenessMatrix, terminationTally, leafCapImpact);

  const lines: string[] = [];
  lines.push("CCR Completeness Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("0. Fidelity Check (shadow reimplementation vs real runCCRPrototype)");
  lines.push(`  Gate-eligible cases checked: ${fidelityRows.length}, mismatches: ${fidelityMismatches.length}`);
  if (fidelityMismatches.length > 0) lines.push(`  MISMATCHED LABELS: ${fidelityMismatches.map((m) => m.label).join(", ")}`);
  lines.push("");

  lines.push("1. CCR Search Funnel (Gate -> DFS Start -> Leaf Expansion -> Termination -> Solved)");
  lines.push(`  Gate Passed: ${funnel.gatePassed}`);
  lines.push(`  DFS Started: ${funnel.dfsStarted}`);
  lines.push(`  Leaf Expansion Occurred: ${funnel.leafExpansionOccurred}`);
  lines.push(`  Termination Recorded: ${funnel.terminationRecorded}`);
  lines.push(`  Solved: ${funnel.solved}`);
  lines.push("");

  lines.push("2. Termination Classification");
  for (const [reason, count] of Object.entries(terminationTally)) {
    lines.push(`  ${reason}: ${count}/${completenessRows.length} (${((count / completenessRows.length) * 100).toFixed(1)}%)`);
  }
  lines.push(`  (${budgetExpiredLabels.length} case(s) got an extended ${EXTENDED_RETEST_BUDGET_MS}ms retest before this final tally)`);
  lines.push("");

  lines.push("3. Completeness Matrix");
  lines.push(`  Gate Passed: ${completenessMatrix.gatePassed}`);
  lines.push(`  Search Complete (SOLUTION_FOUND or SEARCH_EXHAUSTED): ${completenessMatrix.searchComplete} (${(completenessMatrix.searchCompleteRate * 100).toFixed(1)}%)`);
  lines.push(`  Search Incomplete (LEAF_CAP_REACHED or BUDGET_EXPIRED): ${completenessMatrix.searchIncomplete}`);
  lines.push("");

  lines.push("4. Search Space Estimation (avgBranchingFactor ^ cycleLength vs MAX_LEAVES_EXPLORED)");
  for (const row of searchSpaceRows) {
    lines.push(
      `  ${row.label}: cycleLength=${row.cycleLength}, avgBranchingFactor=${row.avgBranchingFactor.toFixed(2)}, estimatedSearchTree=${row.estimatedSearchTree.toFixed(
        1
      )}, maxLeavesExplored=${row.maxLeavesExplored}, ratioToLeafCap=${row.ratioToLeafCap.toFixed(2)}`
    );
  }
  lines.push("");

  lines.push("5. Leaf Cap Impact Analysis");
  lines.push(`  Affected (LEAF_CAP_REACHED): ${leafCapImpact.affectedCount}/${leafCapImpact.totalGatePassed} (${(leafCapImpact.affectedShare * 100).toFixed(1)}%)`);
  lines.push(`  Affected avg ratioToLeafCap: ${leafCapImpact.affectedAvgRatioToLeafCap.toFixed(2)} (unaffected: ${leafCapImpact.unaffectedAvgRatioToLeafCap.toFixed(2)})`);
  lines.push(`  Affected avg cycleLength: ${leafCapImpact.affectedAvgCycleLength.toFixed(2)}, avg branchingFactor: ${leafCapImpact.affectedAvgBranchingFactor.toFixed(2)}`);
  lines.push(`  Affected labels: ${leafCapImpact.affectedLabels.join(", ") || "(none)"}`);
  lines.push("");

  lines.push("6. Completeness Assessment + Recommendation");
  lines.push(`  conclusion: ${assessment.conclusion}`);
  lines.push(`  conclusionLabel: ${assessment.conclusionLabel}`);
  lines.push(`  recommendation: ${assessment.recommendation}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        fidelityRows,
        completenessRows,
        searchSpaceRows,
        funnel,
        terminationTally,
        completenessMatrix,
        leafCapImpact,
        assessment,
        budgetExpiredRetestLabels: budgetExpiredLabels,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
