// Recovery Necessity Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runRecoveryNecessityValidationSprintV1.ts
//
// Answers: is Recovery Capability actually needed for the current Failure
// Population, or is the statistically-validated capability gain entirely
// explained by the main pipeline (PAIR/PARITY/ENDGAME)? Builds on three
// prior independent findings (State Taxonomy v2: 0 RECOVERY_RECOVERABLE;
// Planner Investigation: 0/28 Recovery-resolved; Production Validation:
// 43/43 triggered-recovery attempts produce zero candidates) without
// assuming the answer -- ground truth here is freshly, uniformly measured.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { computeStructuralFeatures, type RecoveryNecessityFeatures } from "./recoveryNecessity/StructuralFeatures";
import { computeGroundTruthForHole, summarizeGroundTruth, type NecessityGroundTruthRow } from "./recoveryNecessity/NecessityGroundTruth";
import { measureFunnelForCase, summarizeFunnel, type FunnelRow } from "./recoveryNecessity/RecoveryFunnel";
import { analyzePrecisionRecall } from "./recoveryNecessity/PrecisionRecallAnalysis";
import { classifyPopulation, summarizePopulationClassification } from "./recoveryNecessity/PopulationClassification";

const DATA_DIR = "src/customCube/recoveryNecessity/data";
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-groundtruth.json`;
const REPORT_PATH = `${DATA_DIR}/recovery-necessity-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/recovery-necessity-validation-v1-result.json`;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint(): { completedLabels: string[]; rows: NecessityGroundTruthRow[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: NecessityGroundTruthRow[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes: HoleCase[] = loadRawHoleDataset();
  log("init", `loaded ${holes.length} holes`);
  const libs = buildLibs();

  log("step2", "Structural features...");
  const features: RecoveryNecessityFeatures[] = holes.map((h) => computeStructuralFeatures(h.cubies, h.label));
  const featuresByLabel = new Map(features.map((f) => [f.label, f]));
  log("step2", "done");

  log("step1", "Ground truth (baseline + extended-budget where needed)...");
  let { completedLabels, rows: groundTruthRows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("step1", `resuming: ${completedLabels.length}/${holes.length} done`);
  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const row = await computeGroundTruthForHole(h, libs);
    groundTruthRows.push(row);
    completedLabels.push(h.label);
    completedSet.add(h.label);
    saveCheckpoint(completedLabels, groundTruthRows);
  }
  log("step1", "done");
  const groundTruthSummary = summarizeGroundTruth(groundTruthRows);
  const groundTruthByLabel = new Map(groundTruthRows.map((r) => [r.label, r]));

  log("step3", "Recovery Necessity Funnel (fresh single solve() call per case)...");
  const funnelRows: FunnelRow[] = holes.map((h) => measureFunnelForCase(h.cubies, h.label, groundTruthByLabel.get(h.label)!));
  const funnelSummary = summarizeFunnel(funnelRows);
  log("step3", "done");

  log("step4", "Precision/Recall/F1 + Population Classification...");
  const precisionRecall = analyzePrecisionRecall(funnelRows);
  const classified = classifyPopulation(groundTruthRows, featuresByLabel);
  const populationSummary = summarizePopulationClassification(classified);
  log("step4", "done");

  const lines: string[] = [];
  lines.push("Recovery Necessity Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("1. Ground Truth Summary (RQ-1, RQ-2)");
  lines.push(`  Total cases: ${groundTruthSummary.totalCases}`);
  lines.push(
    `  Reachable WITHOUT Recovery (main pipeline BASE/FLIP/CASE/PARITY, baseline+extended budget): ${groundTruthSummary.reachableWithoutRecoveryCount}/${groundTruthSummary.totalCases} (${(
      (groundTruthSummary.reachableWithoutRecoveryCount / groundTruthSummary.totalCases) *
      100
    ).toFixed(1)}%)`
  );
  lines.push(`  Requires Recovery (Recovery is the ONLY path found): ${groundTruthSummary.requiresRecoveryCount}/${groundTruthSummary.totalCases} (${(
    (groundTruthSummary.requiresRecoveryCount / groundTruthSummary.totalCases) *
    100
  ).toFixed(1)}%)`);
  lines.push(`  Recovery Optional (Recovery succeeds but so does something else): ${groundTruthSummary.recoveryOptionalCount}/${groundTruthSummary.totalCases}`);
  lines.push(`  Recovery Unnecessary (neither Recovery nor main pipeline can be credited): ${groundTruthSummary.recoveryUnnecessaryCount}/${groundTruthSummary.totalCases}`);
  lines.push("");

  lines.push("2. Recovery Necessity Funnel (Need -> Triggered -> Candidate Generated -> Solved)");
  lines.push(`  Need Recovery: ${funnelSummary.need}`);
  lines.push(`  ...of which Triggered: ${funnelSummary.triggeredGivenNeed}/${funnelSummary.need}`);
  lines.push(`  ...of which Candidate Generated: ${funnelSummary.candidateGeneratedGivenNeed}/${funnelSummary.need}`);
  lines.push(`  ...of which Solved (this single fresh call): ${funnelSummary.solvedGivenNeed}/${funnelSummary.need}`);
  lines.push(`  (Population-wide, regardless of need) Total Triggered: ${funnelSummary.totalTriggered}/${holes.length}, Candidate Generated: ${funnelSummary.totalCandidateGenerated}/${holes.length}, Solved: ${funnelSummary.totalSolved}/${holes.length}`);
  lines.push("");

  lines.push("3. Recovery Precision / Recall / F1 (RQ-4)");
  lines.push(`  TP=${precisionRecall.truePositive}, FP=${precisionRecall.falsePositive}, FN=${precisionRecall.falseNegative}, TN=${precisionRecall.trueNegative}`);
  lines.push(`  Precision (of triggers, how many were truly necessary): ${(precisionRecall.precision * 100).toFixed(2)}%`);
  lines.push(`  Recall (of truly-necessary cases, how many were triggered): ${(precisionRecall.recall * 100).toFixed(2)}%`);
  lines.push(`  F1: ${(precisionRecall.f1 * 100).toFixed(2)}%`);
  lines.push(`  Recovery Opportunity Loss (needed but NOT even triggered): ${precisionRecall.opportunityLossCases.length} case(s): ${precisionRecall.opportunityLossCases.join(", ") || "(none)"}`);
  lines.push("");

  lines.push("4. Population Classification + Structural Profile (RQ-3)");
  lines.push(`  RECOVERY_REQUIRED: ${populationSummary.requiredCount} cases -- labels: ${populationSummary.requiredCaseLabels.join(", ") || "(none)"}`);
  lines.push(
    `    profile: avgCycleLength=${populationSummary.requiredProfile.avgCycleLength.toFixed(2)}, avgWrongWingCount=${populationSummary.requiredProfile.avgWrongWingCount.toFixed(
      2
    )}, avgConflictEdgeCount=${populationSummary.requiredProfile.avgConflictEdgeCount.toFixed(2)}, avgComponentCount=${populationSummary.requiredProfile.avgComponentCount.toFixed(
      2
    )}, parityRate=${(populationSummary.requiredProfile.parityRate * 100).toFixed(1)}%`
  );
  lines.push(`  RECOVERY_OPTIONAL: ${populationSummary.optionalCount} cases`);
  lines.push(
    `    profile: avgCycleLength=${populationSummary.optionalProfile.avgCycleLength.toFixed(2)}, avgWrongWingCount=${populationSummary.optionalProfile.avgWrongWingCount.toFixed(
      2
    )}, avgConflictEdgeCount=${populationSummary.optionalProfile.avgConflictEdgeCount.toFixed(2)}, avgComponentCount=${populationSummary.optionalProfile.avgComponentCount.toFixed(
      2
    )}, parityRate=${(populationSummary.optionalProfile.parityRate * 100).toFixed(1)}%`
  );
  lines.push(`  RECOVERY_UNNECESSARY: ${populationSummary.unnecessaryCount} cases`);
  lines.push(
    `    profile: avgCycleLength=${populationSummary.unnecessaryProfile.avgCycleLength.toFixed(2)}, avgWrongWingCount=${populationSummary.unnecessaryProfile.avgWrongWingCount.toFixed(
      2
    )}, avgConflictEdgeCount=${populationSummary.unnecessaryProfile.avgConflictEdgeCount.toFixed(2)}, avgComponentCount=${populationSummary.unnecessaryProfile.avgComponentCount.toFixed(
      2
    )}, parityRate=${(populationSummary.unnecessaryProfile.parityRate * 100).toFixed(1)}%`
  );
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ groundTruthSummary, groundTruthRows, funnelSummary, funnelRows, precisionRecall, populationSummary }, null, 2),
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
