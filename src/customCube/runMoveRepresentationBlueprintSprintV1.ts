// Move Representation Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runMoveRepresentationBlueprintSprintV1.ts
//
// Blueprint Sprint (design only, no implementation): designs a new Move
// Representation to close the gap Move Representation Gap Analysis
// Sprint v1 measured (0/418 CYCLE_ROTATION_IMPROVING candidates -- the
// current Single-Wing move unit cannot express a net-improving move for
// a pure isolated cycle). Every quantitative input is loaded from prior
// Sprints' own already-measured result JSON files, never re-derived or
// guessed here.
import * as fs from "fs";
import { REPRESENTATION_CANDIDATES } from "./moveRepresentationBlueprint/RepresentationDesignSpace";
import { compareExpressiveness, type CycleLengthDistribution } from "./moveRepresentationBlueprint/ExpressivenessComparison";
import { buildComplexityAnalysis } from "./moveRepresentationBlueprint/ComplexityAnalysis";
import { buildIntegrationArchitecture } from "./moveRepresentationBlueprint/IntegrationArchitecture";
import { buildPrototypeSpecification } from "./moveRepresentationBlueprint/PrototypeSpecification";
import { decideFinal } from "./moveRepresentationBlueprint/FinalDecision";

const DATA_DIR = "src/customCube/moveRepresentationBlueprint/data";
const REPORT_PATH = `${DATA_DIR}/move-representation-blueprint-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/move-representation-blueprint-v1-result.json`;
const MECHANISM_RESULT_PATH = "src/customCube/pureCycleIsolationMechanism/data/pure-cycle-isolation-mechanism-analysis-v1-result.json";
const GAP_RESULT_PATH = "src/customCube/moveRepresentationGap/data/move-representation-gap-analysis-v1-result.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  const mechanismResult = JSON.parse(fs.readFileSync(MECHANISM_RESULT_PATH, "utf-8"));
  const gapResult = JSON.parse(fs.readFileSync(GAP_RESULT_PATH, "utf-8"));
  log("init", "loaded prior Sprints' measured data (no fresh solver calls -- design-only Sprint)");

  const cycleLengthDist: CycleLengthDistribution = {};
  for (const row of mechanismResult.mechanismRows as { cycleLength: number }[]) {
    cycleLengthDist[row.cycleLength] = (cycleLengthDist[row.cycleLength] ?? 0) + 1;
  }
  log("distribution", `real cycleLength distribution: ${JSON.stringify(cycleLengthDist)}`);

  const expressiveness = compareExpressiveness(REPRESENTATION_CANDIDATES, cycleLengthDist);
  const complexity = buildComplexityAnalysis();
  const integration = buildIntegrationArchitecture();
  const prototypeSpec = buildPrototypeSpecification();
  const finalDecision = decideFinal(expressiveness, complexity);

  const lines: string[] = [];
  lines.push("Move Representation Blueprint Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("0. Real Data Inputs Cited");
  lines.push(`  cycleLength distribution (28 PURE_CYCLE_ISOLATION cases, PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1): ${JSON.stringify(cycleLengthDist)}`);
  lines.push(`  Move Coverage Matrix (Move Representation Gap Analysis Sprint v1): ${JSON.stringify(gapResult.moveCoverageMatrix.map((m: any) => `${m.moveClass}=${m.count}`))}`);
  lines.push("");

  lines.push("1. Representation Design Space");
  for (const c of REPRESENTATION_CANDIDATES) {
    lines.push(`  ${c.id} (${c.name}): unitSize=${c.unitSize}, minWingUnit=${c.minWingUnit}`);
    lines.push(`    ${c.description}`);
  }
  lines.push("");

  lines.push("2. Expressiveness Comparison (Representation Comparison Matrix, part 1)");
  for (const e of expressiveness) {
    lines.push(`  ${e.representationId}: oneShotCoverage=${e.oneShotCoverageCount}/28 (${(e.oneShotCoverageRate * 100).toFixed(1)}%), decomposableCoverage=${e.decomposableCoverageCount}/28 (${(e.decomposableCoverageRate * 100).toFixed(1)}%)`);
    lines.push(`    ${e.note}`);
  }
  lines.push("");

  lines.push("3. Complexity Analysis (Representation Comparison Matrix, part 2)");
  for (const c of complexity) {
    lines.push(`  ${c.representationId}: branching=${c.expectedBranchingIncrease}`);
    lines.push(`    searchCost=${c.searchCostEstimate}`);
    lines.push(`    implementationDifficulty=${c.implementationDifficulty}, productionImpact=${c.productionImpact}`);
    lines.push(`    rationale: ${c.rationale}`);
  }
  lines.push("");

  lines.push("4. Integration Architecture");
  lines.push(`  input: ${integration.input}`);
  lines.push(`  output: ${integration.output}`);
  lines.push(`  plannerInterface: ${integration.plannerInterface}`);
  lines.push(`  recoveryRelationship: ${integration.recoveryRelationship}`);
  lines.push(`  primitiveLayerRelationship: ${integration.primitiveLayerRelationship}`);
  lines.push("");

  lines.push("5. Prototype Specification (spec only, no implementation)");
  lines.push(`  input: ${prototypeSpec.input}`);
  lines.push(`  output: ${prototypeSpec.output}`);
  lines.push(`  precondition: ${prototypeSpec.precondition}`);
  lines.push(`  postcondition: ${prototypeSpec.postcondition}`);
  lines.push(`  plannerInterface: ${prototypeSpec.plannerInterface}`);
  lines.push(`  evaluationMethod: ${prototypeSpec.evaluationMethod}`);
  lines.push("");

  lines.push("6. Final Decision");
  lines.push(`  decision: ${finalDecision.decision}`);
  lines.push(`  decisionLabel: ${finalDecision.decisionLabel}`);
  lines.push(`  chosenRepresentationId: ${finalDecision.chosenRepresentationId}`);
  lines.push(`  rationale: ${finalDecision.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ cycleLengthDist, representationCandidates: REPRESENTATION_CANDIDATES, expressiveness, complexity, integration, prototypeSpec, finalDecision }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
