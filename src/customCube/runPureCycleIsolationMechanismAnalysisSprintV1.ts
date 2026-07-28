// PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runPureCycleIsolationMechanismAnalysisSprintV1.ts
//
// Research Sprint: regardless of Primitive Family Prioritization Sprint
// v1's #1 ranking for PURE_CYCLE_ISOLATION, that same Sprint found BP-1
// (0/28) and CCR (SEARCH_EXHAUSTED on most) BOTH fail on this population.
// This Sprint's job is to structurally explain WHY both existing
// mechanisms fail, using one parameterized, fidelity-verified shadow
// search shared by both (they run the identical underlying algorithm
// shape, differing only in branching width: BP-1=2, CCR=3) -- not to
// design a new Primitive.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { analyzeMultiCycle } from "./solverV2Prototype/MultiCycleAnalyzer";
import { MAX_CANDIDATES_PER_HOP as BP1_MAX_CANDIDATES_PER_HOP } from "./solverV2Prototype/BoundedResolver";
import { checkBp1Fidelity, type Bp1FidelityRow } from "./pureCycleIsolationMechanism/FidelityCheck";
import { runCycleSearchShadow, type CycleSearchDiagnostics } from "./pureCycleIsolationMechanism/CycleSearchShadow";
import { buildFailureMechanismRow, summarizeSharedFailure, type CaseFailureMechanismRow } from "./pureCycleIsolationMechanism/FailureMechanismMatrix";
import { classifyAllSubtypes, summarizeSubtypes } from "./pureCycleIsolationMechanism/SubtypeDiscovery";
import { buildMechanismGapSpec } from "./pureCycleIsolationMechanism/MechanismGapAnalysis";
import { assessBlueprintReadiness } from "./pureCycleIsolationMechanism/BlueprintReadinessAssessment";
import type { DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";
import type { ResidualFailureClass } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";

const CCR_MAX_CANDIDATES_PER_HOP = 3; // CCRPrototype.ts's own internal, non-exported constant -- cited by value
const FIDELITY_BUDGET_MS = 5000;
const MAIN_ANALYSIS_BUDGET_MS = 15000; // matches CCR Completeness Validation Sprint v1's own convention

const DATA_DIR = "src/customCube/pureCycleIsolationMechanism/data";
const REPORT_PATH = `${DATA_DIR}/pure-cycle-isolation-mechanism-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/pure-cycle-isolation-mechanism-analysis-v1-result.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

interface ResidualClassifiedRow {
  label: string;
  failureClass: ResidualFailureClass;
  profile: DeepCycleStructuralProfile;
}

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  log("init", `loaded ${holes.length} holes`);

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: ResidualClassifiedRow[] = priorResult.residualClassified;
  const pureCycleRows = residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION");
  log("init", `${pureCycleRows.length} PURE_CYCLE_ISOLATION cases loaded`);

  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const cases = pureCycleRows.map((r) => ({ label: r.label, cubies: holesByLabel.get(r.label)!.cubies, profile: r.profile }));

  log("fidelity", `checking BP-1 shadow fidelity on all ${cases.length} cases @ ${FIDELITY_BUDGET_MS}ms...`);
  const fidelityRows: Bp1FidelityRow[] = cases.map((c) => checkBp1Fidelity(c.cubies, c.label, libs.lib, FIDELITY_BUDGET_MS));
  const fidelityMismatches = fidelityRows.filter((r) => !r.matches);
  log("fidelity", `done -- ${fidelityMismatches.length}/${fidelityRows.length} mismatches (CCR side already verified in CCR Completeness Validation Sprint v1)`);

  log("mechanism", `running BP-1 (width=2) and CCR (width=3) shadow search @ ${MAIN_ANALYSIS_BUDGET_MS}ms on all ${cases.length} cases...`);
  const mechanismRows: CaseFailureMechanismRow[] = cases.map((c) => {
    const analysis = analyzeMultiCycle(c.cubies);
    const cycleNodes = analysis?.cycleNodes ?? [];

    const bp1Clone = cloneCubies(c.cubies);
    const bp1Deadline = Date.now() + MAIN_ANALYSIS_BUDGET_MS;
    const bp1: CycleSearchDiagnostics = runCycleSearchShadow(bp1Clone, cycleNodes, libs.lib, bp1Deadline, BP1_MAX_CANDIDATES_PER_HOP);

    const ccrClone = cloneCubies(c.cubies);
    const ccrDeadline = Date.now() + MAIN_ANALYSIS_BUDGET_MS;
    const ccr: CycleSearchDiagnostics = runCycleSearchShadow(ccrClone, cycleNodes, libs.lib, ccrDeadline, CCR_MAX_CANDIDATES_PER_HOP);

    return buildFailureMechanismRow(c.label, c.profile.cycleLength, c.profile.wrongWingCount, bp1, ccr);
  });
  log("mechanism", "done");

  const sharedFailureSummary = summarizeSharedFailure(mechanismRows);

  const cycleCountByLabel = new Map(cases.map((c) => [c.label, c.profile.cycleCount]));
  const subtypeClassified = classifyAllSubtypes(mechanismRows, cycleCountByLabel);
  const subtypeSummaries = summarizeSubtypes(subtypeClassified);

  const mechanismGapSpec = buildMechanismGapSpec(sharedFailureSummary, subtypeSummaries);
  const readiness = assessBlueprintReadiness(subtypeSummaries, cases.length);

  const lines: string[] = [];
  lines.push("PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("0. Fidelity Check (BP-1 shadow vs real resolveBoundedMultiCycle)");
  lines.push(`  Cases checked: ${fidelityRows.length}, mismatches: ${fidelityMismatches.length}`);
  if (fidelityMismatches.length > 0) lines.push(`  MISMATCHED LABELS: ${fidelityMismatches.map((m) => m.label).join(", ")}`);
  lines.push("");

  lines.push("1. PURE_CYCLE_ISOLATION Structural Report + BP-1 vs CCR Failure Matrix");
  for (const r of mechanismRows) {
    lines.push(
      `  ${r.label}: cycleLength=${r.cycleLength}, wrongWing=${r.wrongWingCount} | BP-1: ${r.bp1.terminationReason} (leaves=${r.bp1.leavesExplored}, depth=${
        r.bp1.maxDepthReached
      }, bestLeafWrongWing=${r.bp1.bestLeafWrongWingCount}) | CCR: ${r.ccr.terminationReason} (leaves=${r.ccr.leavesExplored}, depth=${r.ccr.maxDepthReached}, bestLeafWrongWing=${
        r.ccr.bestLeafWrongWingCount
      }) | sameReason=${r.sameTerminationReason}`
    );
  }
  lines.push("");
  lines.push(`  Shared Failure Summary:`);
  lines.push(`    Same termination reason: ${sharedFailureSummary.sameTerminationReasonCount}/${sharedFailureSummary.totalCases}`);
  lines.push(`    Both SEARCH_EXHAUSTED: ${sharedFailureSummary.bothSearchExhaustedCount}/${sharedFailureSummary.totalCases}`);
  lines.push(`    Either LEAF_CAP_REACHED: ${sharedFailureSummary.eitherLeafCapReachedCount}/${sharedFailureSummary.totalCases}`);
  lines.push(`    BP-1 termination tally: ${JSON.stringify(sharedFailureSummary.bp1TerminationTally)}`);
  lines.push(`    CCR termination tally: ${JSON.stringify(sharedFailureSummary.ccrTerminationTally)}`);
  lines.push(`    avg leaves explored: BP-1=${sharedFailureSummary.avgBp1LeavesExplored.toFixed(1)}, CCR=${sharedFailureSummary.avgCcrLeavesExplored.toFixed(1)}`);
  lines.push(`    avg max depth reached: BP-1=${sharedFailureSummary.avgBp1MaxDepth.toFixed(1)}, CCR=${sharedFailureSummary.avgCcrMaxDepth.toFixed(1)}`);
  lines.push("");

  lines.push("2. Subtype Taxonomy (RQ-4)");
  for (const s of subtypeSummaries) {
    lines.push(`  ${s.subtype}: n=${s.n} (${((s.n / cases.length) * 100).toFixed(1)}%)`);
    lines.push(`    labels: ${s.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("3. Mechanism Gap Specification");
  lines.push(`  currentlyPossible: ${mechanismGapSpec.currentlyPossible}`);
  lines.push(`  currentlyImpossible: ${mechanismGapSpec.currentlyImpossible}`);
  lines.push(`  commonFailureCondition: ${mechanismGapSpec.commonFailureCondition}`);
  lines.push(`  representativeCases: ${mechanismGapSpec.representativeCases.join(", ")}`);
  lines.push("");

  lines.push("4. Blueprint Readiness Assessment");
  lines.push(`  conclusion: ${readiness.conclusion}`);
  lines.push(`  conclusionLabel: ${readiness.conclusionLabel}`);
  lines.push(`  rationale: ${readiness.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ fidelityRows, mechanismRows, sharedFailureSummary, subtypeClassified, subtypeSummaries, mechanismGapSpec, readiness }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
