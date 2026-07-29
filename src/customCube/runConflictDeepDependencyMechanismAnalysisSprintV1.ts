// CONFLICT_DEEP_DEPENDENCY Structural Mechanism Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runConflictDeepDependencyMechanismAnalysisSprintV1.ts
//
// Read-only Research Sprint: no Primitive/Planner/Executor/Recovery/Gate/
// Evaluator modification. Determines whether the 16 CONFLICT_DEEP_DEPENDENCY
// residuals found by Solver Primitive Set Completeness Validation Sprint v2
// share a single dominant failure mechanism, or split into structurally
// distinct Subtypes -- to decide whether/how a future Conflict-targeting
// Primitive Blueprint should be designed.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { computeConflictGraphFeatures, type ConflictGraphFeatures } from "./conflictDeepDependencyMechanismAnalysis/ConflictGraphFeatures";
import { probeAllPrimitives, type PrimitiveFailurePointResult } from "./conflictDeepDependencyMechanismAnalysis/FailurePointProbe";
import { buildFailureMatrix, summarizeDominantReasonPerPrimitive, PRIMITIVE_ORDER, FAILURE_REASON_ORDER } from "./conflictDeepDependencyMechanismAnalysis/FailureMatrix";
import { summarizeMechanism } from "./conflictDeepDependencyMechanismAnalysis/MechanismSummary";
import { classifyAllSubtypes, summarizeSubtypes } from "./conflictDeepDependencyMechanismAnalysis/SubtypeClassification";
import { recommendMechanism } from "./conflictDeepDependencyMechanismAnalysis/Recommendation";

const DATA_DIR = "src/customCube/conflictDeepDependencyMechanismAnalysis/data";
const REPORT_PATH = `${DATA_DIR}/conflict-deep-dependency-mechanism-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/conflict-deep-dependency-mechanism-analysis-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-probe.json`;
const V2_RESULT_PATH = "src/customCube/primitiveSetCompletenessV2/data/primitive-set-completeness-validation-v2-result.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface CheckpointEntry {
  label: string;
  features: ConflictGraphFeatures;
  probeResults: PrimitiveFailurePointResult[];
}

function loadCheckpoint(): { completedLabels: string[]; entries: CheckpointEntry[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], entries: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], entries: CheckpointEntry[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, entries }), "utf-8");
}

async function main() {
  const v2Result = JSON.parse(fs.readFileSync(V2_RESULT_PATH, "utf-8"));
  const conflictLabels: string[] = v2Result.residualClassified.filter((r: { failureClass: string }) => r.failureClass === "CONFLICT_DEEP_DEPENDENCY").map((r: { label: string }) => r.label);
  log("init", `${conflictLabels.length} CONFLICT_DEEP_DEPENDENCY labels loaded from v2 result`);

  const holes: HoleCase[] = loadRawHoleDataset();
  const holeByLabel = new Map(holes.map((h) => [h.label, h]));
  const targetHoles = conflictLabels.map((label) => {
    const h = holeByLabel.get(label);
    if (!h) throw new Error(`label not found in Hole Dataset: ${label}`);
    return h;
  });
  const libs = buildLibs();

  let { completedLabels, entries } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("probe", `resuming: ${completedLabels.length}/${targetHoles.length} done`);

  for (const h of targetHoles) {
    if (completedSet.has(h.label)) continue;
    log("probe", `case ${h.label}...`);
    const features = computeConflictGraphFeatures(h.cubies, h.label, libs.lib);
    const probeResults = probeAllPrimitives(h.cubies, h.label, libs);
    entries.push({ label: h.label, features, probeResults });
    completedLabels.push(h.label);
    completedSet.add(h.label);
    saveCheckpoint(completedLabels, entries);
  }
  log("probe", "done");

  const orderedEntries = conflictLabels.map((label) => entries.find((e) => e.label === label)!);
  const featuresList = orderedEntries.map((e) => e.features);
  const allProbeResults = orderedEntries.map((e) => e.probeResults);

  const failureMatrix = buildFailureMatrix(allProbeResults);
  const perPrimitiveDominant = summarizeDominantReasonPerPrimitive(failureMatrix, conflictLabels.length);
  const mechanismSummary = summarizeMechanism(conflictLabels, allProbeResults);
  const subtypeRows = classifyAllSubtypes(featuresList);
  const subtypeSummaries = summarizeSubtypes(subtypeRows);
  const recommendation = recommendMechanism(mechanismSummary, subtypeSummaries, perPrimitiveDominant);

  const lines: string[] = [];
  lines.push("CONFLICT_DEEP_DEPENDENCY Structural Mechanism Analysis Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Population: n=${conflictLabels.length} (CONFLICT_DEEP_DEPENDENCY residuals from Primitive Set Completeness Validation Sprint v2)`);
  lines.push("");

  lines.push("1. Failure Matrix (Primitive x Failure Reason, Deliverable #1)");
  for (const p of PRIMITIVE_ORDER) {
    const row = failureMatrix[p];
    lines.push(`  ${p}: ${FAILURE_REASON_ORDER.map((r) => `${r}=${row[r]}`).join(", ")}`);
  }
  lines.push("  Dominant reason per Primitive:");
  for (const d of perPrimitiveDominant) {
    lines.push(`    ${d.primitive}: ${d.dominantReason} (${(d.dominantShare * 100).toFixed(1)}%)`);
  }
  lines.push("");

  lines.push("2. Conflict Structure Report (RQ-4)");
  for (const f of featuresList) {
    lines.push(
      `  ${f.label}: conflictEdgeCount=${f.conflictEdgeCount}, dependencyDepth=${f.dependencyDepth}, dependencyBranching=${f.dependencyBranching}, dependencyComponentCount=${f.dependencyComponentCount}, bridgeCount=${f.bridgeCount}, sharedConflictCount=${f.sharedConflictCount}, protectedEdgeCount=${f.protectedEdgeCount}, wrongWingCount=${f.wrongWingCount}`
    );
  }
  lines.push("");

  lines.push("3. Subtype Classification Report (RQ-1/RQ-5, Deliverable #3)");
  for (const s of subtypeSummaries) {
    lines.push(
      `  ${s.subtype}: n=${s.n}, avgDependencyDepth=${s.avgDependencyDepth.toFixed(2)}, avgConflictEdgeCount=${s.avgConflictEdgeCount.toFixed(2)}, avgDependencyBranching=${s.avgDependencyBranching.toFixed(
        2
      )}, avgDependencyComponentCount=${s.avgDependencyComponentCount.toFixed(2)}, avgBridgeCount=${s.avgBridgeCount.toFixed(2)}, avgSharedConflictCount=${s.avgSharedConflictCount.toFixed(
        2
      )}, avgProtectedEdgeCount=${s.avgProtectedEdgeCount.toFixed(2)}, avgWrongWingCount=${s.avgWrongWingCount.toFixed(2)}`
    );
    lines.push(`    labels: ${s.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("4. Mechanism Summary (RQ-1, Deliverable #4)");
  lines.push(`  totalCases=${mechanismSummary.totalCases}, isSingleDominantMechanism=${mechanismSummary.isSingleDominantMechanism}`);
  for (const g of mechanismSummary.groups) {
    lines.push(`  signature=[${g.signature}] n=${g.count} (${(g.share * 100).toFixed(1)}%)`);
    lines.push(`    labels: ${g.labels.join(", ")}`);
  }
  lines.push("");

  lines.push("5. Recommendation (Deliverable #5)");
  lines.push(`  conclusion=${recommendation.conclusion}`);
  lines.push(`  conclusionLabel=${recommendation.conclusionLabel}`);
  lines.push(`  rationale: ${recommendation.rationale}`);
  lines.push(`  nextStepDirection: ${recommendation.nextStepDirection}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        conflictLabels,
        featuresList,
        allProbeResults,
        failureMatrix,
        perPrimitiveDominant,
        mechanismSummary,
        subtypeRows,
        subtypeSummaries,
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
