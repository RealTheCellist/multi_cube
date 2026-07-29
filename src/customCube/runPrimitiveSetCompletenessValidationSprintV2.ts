// Solver Primitive Set Completeness Validation Sprint v2 -- driver.
//   npx tsx src/customCube/runPrimitiveSetCompletenessValidationSprintV2.ts
//
// Read-only Research/Validation Sprint: no Primitive implementation, no
// Planner/Executor/Recovery/Gate/Evaluator modification. Determines whether
// the CURRENT production Primitive Set (BASE/FLIP/CASE/PARITY/CCR/
// MIXED_COMMUTATOR, Gate C wired in) is structurally closed -- i.e. whether
// every Residual is explainable by the existing Set, or whether a genuinely
// new independent Failure Family exists.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { buildCoverageRowV2, summarizeCoverageV2, COVERAGE_TEST_BUDGET_MS, type PrimitiveCoverageRowV2 } from "./primitiveSetCompletenessV2/CoverageMatrixV2";
import { computeResidualFeatureSetV2, type ResidualFeatureSetV2 } from "./primitiveSetCompletenessV2/ResidualFeatureSetV2";
import { classifyAllResiduals, summarizeResidualClasses, type ResidualClassification } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";
import { probeRecoveryAttempts, summarizeRecoveryCoverage, RECOVERY_ATTEMPT_REPEATS, type RecoveryAttemptResult } from "./primitiveSetCompletenessV2/RecoveryAttemptProbe";
import { buildFamilyTransitionMatrix } from "./primitiveSetCompletenessV2/FamilyTransitionMatrix";
import { assessClosure, summarizeClosure, findSharedUnknownSignature } from "./primitiveSetCompletenessV2/StructuralClosureAssessment";
import { recommendFinal } from "./primitiveSetCompletenessV2/FinalRecommendation";
import type { ResidualFailureClass } from "./primitiveSetCompleteness/ResidualFailureTaxonomy";

const DATA_DIR = "src/customCube/primitiveSetCompletenessV2/data";
const REPORT_PATH = `${DATA_DIR}/primitive-set-completeness-validation-v2-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/primitive-set-completeness-validation-v2-result.json`;
const CHECKPOINT_COVERAGE_PATH = `${DATA_DIR}/checkpoint-coverage-v2.json`;
const CHECKPOINT_RECOVERY_PATH = `${DATA_DIR}/checkpoint-recovery-v2.json`;
const V1_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCoverageCheckpoint(): { completedLabels: string[]; rows: PrimitiveCoverageRowV2[] } {
  if (!fs.existsSync(CHECKPOINT_COVERAGE_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_COVERAGE_PATH, "utf-8"));
}
function saveCoverageCheckpoint(completedLabels: string[], rows: PrimitiveCoverageRowV2[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_COVERAGE_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

function loadRecoveryCheckpoint(): { completedLabels: string[]; rows: RecoveryAttemptResult[] } {
  if (!fs.existsSync(CHECKPOINT_RECOVERY_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_RECOVERY_PATH, "utf-8"));
}
function saveRecoveryCheckpoint(completedLabels: string[], rows: RecoveryAttemptResult[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_RECOVERY_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  const libs = buildLibs();
  log("init", `loaded ${holes.length} holes`);

  // --- RQ-1: Residual Population (6-primitive union coverage, Gate/budget-
  // decoupled, directly comparable to v1's own 53/142) -----------------------
  log("coverage", `testing BASE/FLIP/CASE/PARITY/CCR/MIXED_COMMUTATOR @ ${COVERAGE_TEST_BUDGET_MS}ms on all ${holes.length} cases...`);
  let { completedLabels: covDone, rows: coverageRows } = loadCoverageCheckpoint();
  const covDoneSet = new Set(covDone);
  if (covDone.length > 0) log("coverage", `resuming: ${covDone.length}/${holes.length} done`);
  for (const h of holes) {
    if (covDoneSet.has(h.label)) continue;
    const row = buildCoverageRowV2(h.cubies, h.label, libs);
    coverageRows.push(row);
    covDone.push(h.label);
    covDoneSet.add(h.label);
    saveCoverageCheckpoint(covDone, coverageRows);
  }
  log("coverage", "done");

  const coverageSummary = summarizeCoverageV2(coverageRows);
  const coverageByLabel = new Map(coverageRows.map((r) => [r.label, r]));
  const residualHoles = holes.filter((h) => !coverageByLabel.get(h.label)!.unionCovered);
  log("coverage", `residual=${residualHoles.length}/${holes.length}`);

  // --- RQ-2: Structural feature extraction per residual ----------------------
  log("features", "computing ResidualFeatureSetV2 for residual cases...");
  const residualFeatures: ResidualFeatureSetV2[] = residualHoles.map((h) => computeResidualFeatureSetV2(h.cubies, h.label, libs.lib));
  log("features", "done");

  // --- RQ-3/Taxonomy v2: reuse v1's classifyResidual verbatim ----------------
  const residualClassified: ResidualClassification[] = classifyAllResiduals(residualFeatures);
  const residualClassSummaries = summarizeResidualClasses(residualClassified);
  log("taxonomy", `classified into ${residualClassSummaries.length} classes`);

  // --- RQ-4/Primitive Coverage: real production Recovery-layer attempt probe,
  // Gate C, N=10 repeats, on residual cases only -------------------------------
  log("recovery-probe", `probing real production Recovery layer (N=${RECOVERY_ATTEMPT_REPEATS}) on ${residualHoles.length} residual cases...`);
  let { completedLabels: recDone, rows: recoveryResults } = loadRecoveryCheckpoint();
  const recDoneSet = new Set(recDone);
  if (recDone.length > 0) log("recovery-probe", `resuming: ${recDone.length}/${residualHoles.length} done`);
  for (const h of residualHoles) {
    if (recDoneSet.has(h.label)) continue;
    const result = probeRecoveryAttempts(h.cubies, h.label, libs);
    recoveryResults.push(result);
    recDone.push(h.label);
    recDoneSet.add(h.label);
    saveRecoveryCheckpoint(recDone, recoveryResults);
  }
  log("recovery-probe", "done");
  const recoveryCoverageSummary = summarizeRecoveryCoverage(recoveryResults);

  // --- Family Transition Matrix (vs v1 baseline) -----------------------------
  const v1Result = JSON.parse(fs.readFileSync(V1_RESULT_PATH, "utf-8"));
  const v1CountsByClass: Partial<Record<ResidualFailureClass, number>> = {};
  for (const s of v1Result.residualClassSummaries as { failureClass: ResidualFailureClass; n: number }[]) {
    v1CountsByClass[s.failureClass] = s.n;
  }
  const v2CountsByClass: Partial<Record<ResidualFailureClass, number>> = {};
  for (const s of residualClassSummaries) v2CountsByClass[s.failureClass] = s.n;

  const unknownClassified = residualClassified.filter((c) => c.failureClass === "UNKNOWN");
  const unknownSignature = findSharedUnknownSignature(unknownClassified.map((c) => c.profile as unknown as { swapEdgeCount: number; pairCount: number; wrongWingCount: number }));
  const newFamilyCount = unknownSignature.isCoherentCluster ? unknownSignature.n : 0;
  const familyTransition = buildFamilyTransitionMatrix(v1CountsByClass, v2CountsByClass, newFamilyCount);

  // --- Structural Closure Assessment + Final Recommendation ------------------
  const closureRows = assessClosure(residualClassified);
  const closureSummary = summarizeClosure(closureRows);
  const finalRecommendation = recommendFinal(closureSummary, unknownSignature);

  // --- Report -----------------------------------------------------------------
  const lines: string[] = [];
  lines.push("Solver Primitive Set Completeness Validation Sprint v2 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Residual Population Analysis (RQ-1)");
  lines.push(`  Total cases: ${coverageSummary.totalCases}`);
  for (const [primitive, count] of Object.entries(coverageSummary.perPrimitiveSuccessCount)) {
    lines.push(`  ${primitive}: ${count}/${coverageSummary.totalCases} (${((count / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  }
  lines.push(`  Union Covered (any of 6): ${coverageSummary.unionCoveredCount}/${coverageSummary.totalCases} (${((coverageSummary.unionCoveredCount / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  lines.push(`  Residual (v2): ${coverageSummary.residualCount}/${coverageSummary.totalCases} (${((coverageSummary.residualCount / coverageSummary.totalCases) * 100).toFixed(1)}%)`);
  lines.push(`  Residual (v1 baseline, 5-primitive union): ${v1Result.coverageSummary.residualCount}/${v1Result.coverageSummary.totalCases}`);
  lines.push(
    `  Delta: ${coverageSummary.residualCount - v1Result.coverageSummary.residualCount} (${(
      ((coverageSummary.residualCount - v1Result.coverageSummary.residualCount) / v1Result.coverageSummary.residualCount) *
      100
    ).toFixed(1)}% change), reductionRate=${(
      ((v1Result.coverageSummary.residualCount - coverageSummary.residualCount) / v1Result.coverageSummary.residualCount) *
      100
    ).toFixed(1)}%`
  );
  lines.push("");

  lines.push("2. Failure Taxonomy v2 (RQ-2, reused classifyResidual unmodified)");
  for (const s of residualClassSummaries) {
    lines.push(
      `  ${s.failureClass}: n=${s.n}, avgCycleLength=${s.avgCycleLength.toFixed(2)}, avgComponentCount=${s.avgComponentCount.toFixed(2)}, avgConflictEdgeCount=${s.avgConflictEdgeCount.toFixed(
        2
      )}, avgDependencyDepth=${s.avgDependencyDepth.toFixed(2)}, avgBranchingFactor=${s.avgBranchingFactor.toFixed(2)}, parityRate=${(s.parityRate * 100).toFixed(1)}%`
    );
    lines.push(`    labels: ${s.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("3. Family Transition Matrix (Previous v1 vs Current v2)");
  for (const row of familyTransition) {
    lines.push(`  ${row.failureClass}: previous=${row.previousCount}, current=${row.currentCount}, delta=${row.delta >= 0 ? "+" : ""}${row.delta}`);
  }
  lines.push(`  UNKNOWN cluster signature check: n=${unknownSignature.n}, isCoherentCluster=${unknownSignature.isCoherentCluster}`);
  lines.push(`  ${unknownSignature.sharedDescription}`);
  lines.push("");

  lines.push("4. Primitive Coverage Analysis (RQ-4, real production Recovery layer, Gate C, N=10)");
  lines.push(`  n=${recoveryCoverageSummary.n}, solvedByRecoveryCount=${recoveryCoverageSummary.solvedByRecoveryCount} (${(recoveryCoverageSummary.solvedByRecoveryRate * 100).toFixed(1)}%)`);
  for (const t of Object.keys(recoveryCoverageSummary.attemptedRateByType) as (keyof typeof recoveryCoverageSummary.attemptedRateByType)[]) {
    lines.push(`  ${t}: attemptedRate=${(recoveryCoverageSummary.attemptedRateByType[t] * 100).toFixed(1)}%, producedRate=${(recoveryCoverageSummary.producedRateByType[t] * 100).toFixed(1)}%`);
  }
  lines.push("");

  lines.push("5. Structural Closure Assessment (RQ-5)");
  lines.push(`  totalResiduals=${closureSummary.totalResiduals}, explainableCount=${closureSummary.explainableCount}, explainableRate=${(closureSummary.explainableRate * 100).toFixed(1)}%`);
  lines.push(`  newFamilyCandidateCount=${closureSummary.newFamilyCandidateCount}`);
  lines.push("");

  lines.push("6. Final Recommendation (Deliverable)");
  lines.push(`  conclusion=${finalRecommendation.conclusion}`);
  lines.push(`  conclusionLabel=${finalRecommendation.conclusionLabel}`);
  lines.push(`  rationale: ${finalRecommendation.rationale}`);
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
        residualFeatures,
        residualClassified,
        residualClassSummaries,
        recoveryResults,
        recoveryCoverageSummary,
        familyTransition,
        unknownSignature,
        closureRows,
        closureSummary,
        finalRecommendation,
        v1Baseline: { residualCount: v1Result.coverageSummary.residualCount, totalCases: v1Result.coverageSummary.totalCases, residualClassSummaries: v1Result.residualClassSummaries },
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_COVERAGE_PATH)) fs.unlinkSync(CHECKPOINT_COVERAGE_PATH);
  if (fs.existsSync(CHECKPOINT_RECOVERY_PATH)) fs.unlinkSync(CHECKPOINT_RECOVERY_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
