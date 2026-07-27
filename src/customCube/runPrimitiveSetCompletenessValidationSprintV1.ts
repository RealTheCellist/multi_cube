// Solver Primitive Set Completeness Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitiveSetCompletenessValidationSprintV1.ts
//
// Research Sprint: validates whether the current production Primitive Set
// (BASE/FLIP/CASE/PARITY/CCR) structurally explains the Failure Population,
// following a chain of prior Sprints that each ruled out a different
// candidate root cause (Representation, Dataset, Planner, Recovery
// Necessity, Deep Cycle Resolver, CCR Completeness). No new Primitive or
// Prototype is implemented here.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { buildCoverageRow, summarizeCoverage, COVERAGE_TEST_BUDGET_MS, type PrimitiveCoverageRow } from "./primitiveSetCompleteness/PrimitiveCoverageMatrix";
import { buildUnionCapabilitySteps } from "./primitiveSetCompleteness/UnionCapabilityAnalysis";
import { classifyAllResiduals, summarizeResidualClasses } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";
import { buildBoundarySpec } from "./primitiveSetCompleteness/CapabilityBoundarySpecification";
import { recommendResearch } from "./primitiveSetCompleteness/ResearchRecommendation";
import { computeDeepCycleStructuralProfile, type DeepCycleStructuralProfile } from "./deepCycleResolverValidation/StructuralProfile";

const DATA_DIR = "src/customCube/primitiveSetCompleteness/data";
const REPORT_PATH = `${DATA_DIR}/primitive-set-completeness-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/primitive-set-completeness-validation-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-coverage.json`;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint(): { completedLabels: string[]; rows: PrimitiveCoverageRow[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: PrimitiveCoverageRow[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  log("init", `loaded ${holes.length} holes`);

  log("coverage", `testing BASE/FLIP/CASE/PARITY/CCR @ ${COVERAGE_TEST_BUDGET_MS}ms on all ${holes.length} cases...`);
  let { completedLabels, rows: coverageRows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("coverage", `resuming: ${completedLabels.length}/${holes.length} done`);
  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const row = buildCoverageRow(h.cubies, h.label, libs);
    coverageRows.push(row);
    completedLabels.push(h.label);
    completedSet.add(h.label);
    saveCheckpoint(completedLabels, coverageRows);
  }
  log("coverage", "done");

  const coverageSummary = summarizeCoverage(coverageRows);
  const coverageByLabel = new Map(coverageRows.map((r) => [r.label, r]));

  log("union", "computing stepwise Union Capability...");
  const unionSteps = buildUnionCapabilitySteps(coverageRows);
  log("union", "done");

  log("residual", "computing structural profiles for residual (unsolved) cases...");
  const residualHoles = holes.filter((h) => !coverageByLabel.get(h.label)!.unionCovered);
  const residualProfiles: DeepCycleStructuralProfile[] = residualHoles.map((h) => computeDeepCycleStructuralProfile(h.cubies, h.label, libs.lib));
  const residualClassified = classifyAllResiduals(residualProfiles);
  const residualClassSummaries = summarizeResidualClasses(residualClassified);
  log("residual", `done -- ${residualHoles.length} residual cases across ${residualClassSummaries.length} classes`);

  const boundarySpec = buildBoundarySpec(coverageSummary, residualClassSummaries);
  const recommendation = recommendResearch(coverageSummary, residualClassSummaries);

  const lines: string[] = [];
  lines.push("Solver Primitive Set Completeness Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Primitive Coverage Report");
  lines.push(`  Total cases: ${coverageSummary.totalCases}`);
  for (const [primitive, count] of Object.entries(coverageSummary.perPrimitiveSuccessCount)) {
    lines.push(`  ${primitive}: ${count}/${coverageSummary.totalCases} (${((count / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  }
  lines.push(`  Union Covered (any of the 5): ${coverageSummary.unionCoveredCount}/${coverageSummary.totalCases} (${((coverageSummary.unionCoveredCount / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  lines.push(`  Residual (none succeed): ${coverageSummary.residualCount}/${coverageSummary.totalCases} (${((coverageSummary.residualCount / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  lines.push("");

  lines.push("2. Union Capability Analysis (stepwise coverage gain)");
  for (const step of unionSteps) {
    lines.push(`  ${step.step}: cumulative=${step.cumulativeCoveredCount}/${coverageSummary.totalCases} (${(step.cumulativeCoverageRate * 100).toFixed(1)}%), incrementalGain=+${step.incrementalGain}`);
  }
  lines.push("");

  lines.push("3. Residual Failure Taxonomy");
  for (const s of residualClassSummaries) {
    lines.push(
      `  ${s.failureClass}: n=${s.n}, avgCycleLength=${s.avgCycleLength.toFixed(2)}, avgComponentCount=${s.avgComponentCount.toFixed(2)}, avgConflictEdgeCount=${s.avgConflictEdgeCount.toFixed(
        2
      )}, avgDependencyDepth=${s.avgDependencyDepth.toFixed(2)}, avgBranchingFactor=${s.avgBranchingFactor.toFixed(2)}, parityRate=${(s.parityRate * 100).toFixed(1)}%`
    );
    lines.push(`    labels: ${s.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("4. Primitive Set Boundary Specification");
  lines.push(`  representable: ${boundarySpec.representableDescription}`);
  lines.push(`  nonRepresentable: ${boundarySpec.nonRepresentableDescription}`);
  lines.push(`  boundaryCondition: ${boundarySpec.boundaryCondition}`);
  lines.push(`  representativeUnsolvedLabels: ${boundarySpec.representativeUnsolvedLabels.join(", ")}`);
  lines.push("");

  lines.push("5. Research Recommendation");
  lines.push(`  conclusion: ${recommendation.conclusion}`);
  lines.push(`  conclusionLabel: ${recommendation.conclusionLabel}`);
  lines.push(`  rationale: ${recommendation.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        coverageRows,
        coverageSummary,
        unionSteps,
        residualClassified,
        residualClassSummaries,
        boundarySpec,
        recommendation,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
