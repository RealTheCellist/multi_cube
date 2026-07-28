// Move Representation Gap Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runMoveRepresentationGapAnalysisSprintV1.ts
//
// Research Sprint: PURE_CYCLE_ISOLATION Structural Mechanism Analysis
// Sprint v1 found search parameters (width/depth/leaf cap) are NOT the
// bottleneck for 85.7% of that population -- both BP-1 and CCR fully
// exhaust their search space and still find nothing. This Sprint tests
// the resulting hypothesis directly: is the MOVE GENERATOR itself
// (enumerateWingCandidates) structurally incapable of offering a net-
// improving move for these specific permutations? No new Primitive or
// Move Generator change is implemented -- this measures and specifies
// only.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { analyzeMultiCycle } from "./solverV2Prototype/MultiCycleAnalyzer";
import { captureCandidatesForCase, type CandidateMeasurement } from "./moveRepresentationGap/MoveCandidateCapture";
import { buildMoveCoverageMatrix, summarizeCaseCandidates, type CaseCandidateSummary } from "./moveRepresentationGap/MoveCoverageMatrix";
import { buildRepresentationGapMatrix } from "./moveRepresentationGap/RepresentationGapMatrix";
import { buildResidualMoveRequirement } from "./moveRepresentationGap/ResidualMoveRequirement";
import { assessGapReadiness } from "./moveRepresentationGap/BlueprintReadinessAssessment";
import type { DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";
import type { ResidualFailureClass } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";

const DATA_DIR = "src/customCube/moveRepresentationGap/data";
const REPORT_PATH = `${DATA_DIR}/move-representation-gap-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/move-representation-gap-analysis-v1-result.json`;
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

  log("capture", "capturing real move candidates + structural effect at every cycle hop...");
  const allMeasurements: CandidateMeasurement[] = [];
  const caseSummaries: CaseCandidateSummary[] = [];
  for (const row of pureCycleRows) {
    const hole = holesByLabel.get(row.label)!;
    const analysis = analyzeMultiCycle(hole.cubies);
    const cycleNodes = analysis?.cycleNodes ?? [];
    const measurements = captureCandidatesForCase(hole.cubies, row.label, cycleNodes, libs.lib);
    allMeasurements.push(...measurements);
    caseSummaries.push(summarizeCaseCandidates(row.label, measurements));
  }
  log("capture", `done -- ${allMeasurements.length} candidate measurements across ${caseSummaries.length} cases`);

  const moveCoverageMatrix = buildMoveCoverageMatrix(allMeasurements);
  const representationGap = buildRepresentationGapMatrix(moveCoverageMatrix, caseSummaries);
  const residualMoveRequirement = buildResidualMoveRequirement(representationGap, moveCoverageMatrix);
  const readiness = assessGapReadiness(representationGap);

  const lines: string[] = [];
  lines.push("Move Representation Gap Analysis Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Move Representation Report (per-case candidate summary)");
  for (const s of caseSummaries) {
    lines.push(`  ${s.label}: totalCandidates=${s.totalCandidates}, anyImprovingCandidate=${s.anyImprovingCandidate}, bestWrongWingDelta=${s.bestWrongWingDelta ?? "N/A"}, avgAffectedWingCount=${s.avgAffectedWingCount.toFixed(2)}`);
  }
  lines.push("");

  lines.push("2. Generated Move Taxonomy (Move Coverage Matrix)");
  for (const t of moveCoverageMatrix) {
    lines.push(`  ${t.moveClass}: count=${t.count} (${(t.share * 100).toFixed(1)}%), avgAffectedWingCount=${t.avgAffectedWingCount.toFixed(2)}, avgMoveLength=${t.avgMoveLength.toFixed(1)}`);
  }
  lines.push("");

  lines.push("3. Representation Gap Report");
  lines.push(`  representableMoveClasses: ${representationGap.representableMoveClasses.join(", ") || "(none)"}`);
  lines.push(`  neverGeneratedMoveClasses: ${representationGap.neverGeneratedMoveClasses.join(", ") || "(none)"}`);
  lines.push(`  casesWithNoImprovingCandidateAtAll: ${representationGap.casesWithNoImprovingCandidateAtAll}/${representationGap.totalCases} (${(representationGap.casesWithNoImprovingCandidateShare * 100).toFixed(1)}%)`);
  lines.push(`  representativeGapLabels: ${representationGap.representativeGapLabels.join(", ")}`);
  lines.push("");

  lines.push("4. Residual Move Requirement (specification only, no implementation)");
  lines.push(`  observedLimitation: ${residualMoveRequirement.observedLimitation}`);
  lines.push(`  requiredStructuralCondition: ${residualMoveRequirement.requiredStructuralCondition}`);
  lines.push(`  expectedMechanismShape: ${residualMoveRequirement.expectedMechanismShape}`);
  lines.push(`  evidenceNote: ${residualMoveRequirement.evidenceNote}`);
  lines.push("");

  lines.push("5. Blueprint Readiness Assessment");
  lines.push(`  conclusion: ${readiness.conclusion}`);
  lines.push(`  conclusionLabel: ${readiness.conclusionLabel}`);
  lines.push(`  rationale: ${readiness.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ caseSummaries, moveCoverageMatrix, representationGap, residualMoveRequirement, readiness, sampleMeasurements: allMeasurements.slice(0, 50) }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
