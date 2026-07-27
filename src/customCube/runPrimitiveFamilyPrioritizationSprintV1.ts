// Primitive Family Prioritization Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitiveFamilyPrioritizationSprintV1.ts
//
// Research Sprint: decides which of the 3 independent residual Failure
// Classes found by Solver Primitive Set Completeness Validation Sprint v1
// (PURE_CYCLE_ISOLATION/CONFLICT_DEEP_DEPENDENCY/BRIDGE_MISSING) to research
// first, using a disclosed, uniform 5-criterion rubric. No new Primitive
// or Prototype is designed here -- existing, already-committed, never-
// integrated prototypes (BoundedResolver/BP-1, Conflict-Dominant Sacrifice,
// Multi-Hop Bridge) are called READ-ONLY against the real residual cases
// to ground "existing Prior Art" in measured data, not assumption.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import type { ResidualFailureClass } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";
import type { DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";
import { testPriorArtForFamily, type PriorArtTestResult } from "./primitiveFamilyPrioritization/PriorArtReuseTest";
import { buildOverlapMatrix } from "./primitiveFamilyPrioritization/OverlapMatrix";
import { buildFamilyROI, type FamilyROI } from "./primitiveFamilyPrioritization/ExpectedROI";
import { buildPriorityMatrix, buildResearchRoadmap, decideFinalRecommendation } from "./primitiveFamilyPrioritization/PriorityMatrix";

const DATA_DIR = "src/customCube/primitiveFamilyPrioritization/data";
const REPORT_PATH = `${DATA_DIR}/primitive-family-prioritization-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/primitive-family-prioritization-v1-result.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

interface ResidualClassifiedRow {
  label: string;
  failureClass: ResidualFailureClass;
  profile: DeepCycleStructuralProfile;
}
interface ResidualClassSummaryRow {
  failureClass: ResidualFailureClass;
  n: number;
  avgDependencyDepth: number;
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
  const residualClassSummaries: ResidualClassSummaryRow[] = priorResult.residualClassSummaries;
  log("init", `loaded ${residualClassified.length} residual cases across ${residualClassSummaries.length} classes`);

  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const avgDependencyDepthByClass: Record<string, number> = {};
  for (const s of residualClassSummaries) avgDependencyDepthByClass[s.failureClass] = s.avgDependencyDepth;

  const families: ResidualFailureClass[] = ["PURE_CYCLE_ISOLATION", "CONFLICT_DEEP_DEPENDENCY", "BRIDGE_MISSING"];

  log("prior-art", "testing existing prototypes directly against real residual cases...");
  const priorArtResults: PriorArtTestResult[] = families.map((family) => {
    const members = residualClassified.filter((r) => r.failureClass === family);
    const cases = members.map((m) => ({ label: m.label, cubies: holesByLabel.get(m.label)!.cubies }));
    return testPriorArtForFamily(family, cases, libs.lib);
  });
  log("prior-art", "done");

  log("overlap", "building overlap matrix across all 53 residual cases...");
  const allResidualProfiles = residualClassified.map((r) => r.profile);
  const overlap = buildOverlapMatrix(allResidualProfiles);
  log("overlap", "done");

  const totalResidual = residualClassified.length;
  const totalPopulation = 142;
  const rois: FamilyROI[] = families.map((family, i) => {
    const n = residualClassSummaries.find((s) => s.failureClass === family)?.n ?? 0;
    return buildFamilyROI(family, n, totalResidual, totalPopulation, overlap, priorArtResults[i]);
  });

  const priorityScores = buildPriorityMatrix(rois, avgDependencyDepthByClass);
  const roadmap = buildResearchRoadmap(priorityScores);
  const finalRecommendation = decideFinalRecommendation(roadmap, priorityScores);

  const lines: string[] = [];
  lines.push("Primitive Family Prioritization Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Primitive Family Comparison Report (Existing Prior Art, REAL measured test)");
  for (const p of priorArtResults) {
    lines.push(`  ${p.failureClass}: priorArt="${p.priorArtName}" (${p.priorArtFile})`);
    lines.push(`    n=${p.n}, succeeded=${p.succeededCount} (${(p.successRate * 100).toFixed(1)}%), succeededLabels=${p.succeededLabels.join(", ") || "(none)"}`);
  }
  lines.push("");

  lines.push("2. Overlap Matrix (RQ-2: independent capabilities, or overlapping?)");
  for (const cell of overlap.cells) {
    lines.push(`  ${cell.rowDimension} ∩ ${cell.colDimension}: ${cell.coOccurrenceCount}`);
  }
  lines.push(`  Exclusively-one-condition cases: ${overlap.exclusivelyOneConditionCount}/${totalResidual}`);
  lines.push(`  Multi-condition cases (2+): ${overlap.multiConditionCount}/${totalResidual}`);
  for (const [dim, rate] of Object.entries(overlap.structuralIndependenceRate)) {
    lines.push(`  ${dim} structuralIndependenceRate: ${(rate * 100).toFixed(1)}%`);
  }
  lines.push("");

  lines.push("3. Residual Coverage Analysis + Expected ROI");
  for (const r of rois) {
    lines.push(
      `  ${r.failureClass}: n=${r.populationSize}, shareOfResidual=${(r.shareOfResidual * 100).toFixed(1)}%, shareOfTotalPopulation=${(r.shareOfTotalPopulation * 100).toFixed(
        1
      )}%, structuralIndependenceRate=${(r.structuralIndependenceRate * 100).toFixed(1)}%, priorArtRealSuccessRate=${(r.priorArtRealSuccessRate * 100).toFixed(
        1
      )}%, estimatedCoverageGainIfFullySolved=${(r.estimatedCoverageGainIfFullySolved * 100).toFixed(1)}%`
    );
  }
  lines.push("");

  lines.push("4. Priority Matrix (5 criteria, equal 20% weight each, disclosed rubric)");
  for (const s of priorityScores) {
    lines.push(
      `  ${s.failureClass}: populationSize=${s.populationSizeScore.toFixed(3)}, structuralIndependence=${s.structuralIndependenceScore.toFixed(
        3
      )}, priorArt=${s.priorArtScore.toFixed(3)}, expectedImpact=${s.expectedImpactScore.toFixed(3)}, researchComplexity=${s.researchComplexityScore.toFixed(
        3
      )} -> TOTAL=${s.totalScore.toFixed(3)}`
    );
  }
  lines.push("");

  lines.push("5. Research Roadmap");
  for (const entry of roadmap) {
    lines.push(`  Priority ${entry.priority}: ${entry.failureClass} (score=${entry.totalScore.toFixed(3)})`);
  }
  lines.push("");

  lines.push("6. Final Recommendation");
  lines.push(`  recommendation: ${finalRecommendation.recommendation}`);
  lines.push(`  recommendationLabel: ${finalRecommendation.recommendationLabel}`);
  lines.push(`  rationale: ${finalRecommendation.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ priorArtResults, overlap, rois, priorityScores, roadmap, finalRecommendation }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
