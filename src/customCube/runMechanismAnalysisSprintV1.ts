// --- runMechanismAnalysisSprintV1 (State Taxonomy Sprint v2: Structural
// Mechanism Analysis) ------------------------------------------------------
// Node-only CLI driver. Consumes the regenerated raw-dataset-v1-holes.json
// (with originalCubies now persisted) and runs STEP1-5. Checkpointed at the
// two extended-budget-retest steps (Cycle Isolation, Parity-Gated Cycle)
// since those involve real re-execution (up to ~25s/case worst case), even
// though total runtime is well under an hour -- matches this whole research
// arc's own "checkpoint anything that does real work" convention.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { classifyAllHoles, filterByClass } from "./mechanismAnalysis/CaseTaxonomyClassifier";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { analyzeCycleIsolationCase, summarizeCycleIsolation, type CycleIsolationCaseAnalysis } from "./mechanismAnalysis/CycleIsolationSubtypes";
import { analyzeConflictCauseEffect, summarizeConflictCauseEffect } from "./mechanismAnalysis/ConflictCauseEffect";
import { analyzeParityGatedCase, summarizeParityGated, type ParityGatedCaseAnalysis } from "./mechanismAnalysis/ParityGatedSplit";
import { CYCLE_ISOLATION_MECHANISMS, CONFLICT_DOMINANT_MECHANISMS, PARITY_GATED_MECHANISMS } from "./mechanismAnalysis/MechanismSentences";
import { buildPrimitiveOpportunityMap, buildNonPrimitiveRecommendations } from "./mechanismAnalysis/PrimitiveOpportunityMap";

const DATA_DIR = "src/customCube/mechanismAnalysis/data";
const STEP1_CHECKPOINT = `${DATA_DIR}/checkpoint-cycleisolation.json`;
const STEP3_CHECKPOINT = `${DATA_DIR}/checkpoint-paritygated.json`;
const REPORT_PATH = `${DATA_DIR}/mechanism-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mechanism-analysis-v1-result.json`;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  log("init", "Loading raw Hole Dataset...");
  const holes = loadRawHoleDataset();
  log("init", `loaded ${holes.length} holes`);

  const features = classifyAllHoles(holes);
  const libs = buildLibs();

  // --- STEP1: Cycle Isolation subtype analysis ---
  const cycleIsolationHoles = filterByClass(holes, features, "CYCLE_ISOLATION");
  const featureByLabel = new Map(features.map((f) => [f.label, f]));
  log("step1", `Cycle Isolation cases: ${cycleIsolationHoles.length}`);

  let ciCheckpoint: { completedLabels: string[]; results: CycleIsolationCaseAnalysis[] } = { completedLabels: [], results: [] };
  if (fs.existsSync(STEP1_CHECKPOINT)) ciCheckpoint = JSON.parse(fs.readFileSync(STEP1_CHECKPOINT, "utf-8"));
  const ciDone = new Set(ciCheckpoint.completedLabels);
  for (const hole of cycleIsolationHoles) {
    if (ciDone.has(hole.label)) continue;
    const f = featureByLabel.get(hole.label)!;
    const analysis = analyzeCycleIsolationCase(hole, f, libs);
    ciCheckpoint.results.push(analysis);
    ciCheckpoint.completedLabels.push(hole.label);
    fs.writeFileSync(STEP1_CHECKPOINT, JSON.stringify(ciCheckpoint), "utf-8");
    log("step1", `${ciCheckpoint.completedLabels.length}/${cycleIsolationHoles.length} -- ${hole.label}: ${analysis.subtype}`);
  }
  const cycleIsolationSummary = summarizeCycleIsolation(ciCheckpoint.results);

  // --- STEP2: Conflict Dominant cause-vs-effect (fast, no checkpoint needed) ---
  const conflictHoles = filterByClass(holes, features, "CONFLICT_DOMINANT");
  log("step2", `Conflict Dominant cases: ${conflictHoles.length}`);
  const conflictAnalyses = conflictHoles.map(analyzeConflictCauseEffect);
  const conflictSummary = summarizeConflictCauseEffect(conflictAnalyses);

  // --- STEP3: Parity-Gated Cycle Planner-fixable vs Primitive-needed split ---
  const parityHoles = filterByClass(holes, features, "PARITY_GATED_CYCLE");
  log("step3", `Parity-Gated Cycle cases: ${parityHoles.length}`);

  let pgCheckpoint: { completedLabels: string[]; results: ParityGatedCaseAnalysis[] } = { completedLabels: [], results: [] };
  if (fs.existsSync(STEP3_CHECKPOINT)) pgCheckpoint = JSON.parse(fs.readFileSync(STEP3_CHECKPOINT, "utf-8"));
  const pgDone = new Set(pgCheckpoint.completedLabels);
  for (const hole of parityHoles) {
    if (pgDone.has(hole.label)) continue;
    const analysis = await analyzeParityGatedCase(hole, libs);
    pgCheckpoint.results.push(analysis);
    pgCheckpoint.completedLabels.push(hole.label);
    fs.writeFileSync(STEP3_CHECKPOINT, JSON.stringify(pgCheckpoint), "utf-8");
    log("step3", `${pgCheckpoint.completedLabels.length}/${parityHoles.length} -- ${hole.label}: ${analysis.verdict}`);
  }
  const paritySummary = summarizeParityGated(pgCheckpoint.results);

  // --- STEP4/5: Mechanism sentences + Opportunity Map ---
  log("step5", "Building Primitive Opportunity Map...");
  const opportunities = buildPrimitiveOpportunityMap(cycleIsolationSummary, conflictSummary, paritySummary);
  const nonPrimitiveRecs = buildNonPrimitiveRecommendations(cycleIsolationSummary, conflictSummary, paritySummary);

  const lines: string[] = [];
  lines.push("State Taxonomy Sprint v2 -- Structural Mechanism Analysis Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Cycle Isolation Subtypes (STEP1)");
  lines.push(`  Total: ${cycleIsolationSummary.totalCases}`);
  for (const [subtype, count] of Object.entries(cycleIsolationSummary.subtypeCounts)) {
    if (count === 0) continue;
    lines.push(`  ${subtype}: ${count} -- ${CYCLE_ISOLATION_MECHANISMS[subtype as keyof typeof CYCLE_ISOLATION_MECHANISMS]}`);
  }
  lines.push(`  Cycle length distribution: ${JSON.stringify(cycleIsolationSummary.cycleLengthDistribution)}`);
  lines.push("");

  lines.push("2. Conflict Dominant Cause-vs-Effect (STEP2)");
  lines.push(`  Total: ${conflictSummary.totalCases}`);
  for (const [verdict, count] of Object.entries(conflictSummary.verdictCounts)) {
    if (count === 0) continue;
    lines.push(`  ${verdict}: ${count} -- ${CONFLICT_DOMINANT_MECHANISMS[verdict as keyof typeof CONFLICT_DOMINANT_MECHANISMS]}`);
  }
  lines.push("");

  lines.push("3. Parity-Gated Cycle Planner-fixable vs Primitive-needed Split (STEP3)");
  lines.push(`  Total: ${paritySummary.totalCases}`);
  for (const [verdict, count] of Object.entries(paritySummary.verdictCounts)) {
    if (count === 0) continue;
    lines.push(`  ${verdict}: ${count} -- ${PARITY_GATED_MECHANISMS[verdict as keyof typeof PARITY_GATED_MECHANISMS]}`);
  }
  lines.push("");

  lines.push("4. Primitive Opportunity Map (STEP5, true-gap subtypes only)");
  for (const o of opportunities) {
    lines.push(`  [${o.id}] Target: ${o.target} (${o.caseCount} cases)`);
    lines.push(`    Expected Mechanism: ${o.expectedMechanism}`);
    if (o.priorArtNote) lines.push(`    Prior Art: ${o.priorArtNote}`);
  }
  lines.push("");

  lines.push("5. Non-Primitive Recommendations (route to Planner Scheduling Investigation instead)");
  for (const r of nonPrimitiveRecs) {
    lines.push(`  ${r.target} (${r.caseCount} cases): ${r.recommendation}`);
  }

  const report = lines.join("\n");
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cycleIsolationSummary,
        cycleIsolationResults: ciCheckpoint.results,
        conflictSummary,
        conflictResults: conflictAnalyses,
        paritySummary,
        parityResults: pgCheckpoint.results,
        opportunities,
        nonPrimitiveRecs,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(report);
  log("done", `Report written to ${REPORT_PATH}`);

  if (fs.existsSync(STEP1_CHECKPOINT)) fs.unlinkSync(STEP1_CHECKPOINT);
  if (fs.existsSync(STEP3_CHECKPOINT)) fs.unlinkSync(STEP3_CHECKPOINT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
