// --- runCoverageHoleDiscoverySprintV1 (Solver Completeness Achievement
// Program, Phase 1: Coverage Hole Discovery) ------------------------------
// Node-only CLI driver. Ties together HoleDatasetBuilder (STEP1),
// DeadStateClusterAnalysis (STEP2), CycleAnalysis (STEP3), ConflictAnalysis
// (STEP4), StateGraphAtlas (STEP5), and CoverageAtlasReport (STEP6).
// Checkpointed at STEP1 (the expensive part, ~60s/case measured by the
// prior Sprint) and STEP3 (10 solve() calls/case) so a container restart --
// repeatedly observed across this whole research arc's long-running Sprints
// -- resumes instead of restarting.
//
// Usage: npx tsx src/customCube/runCoverageHoleDiscoverySprintV1.ts <failures.json path>
import * as fs from "fs";
import * as path from "path";
import { serializeCube, deserializeCube } from "./failureAnalysis/cubeSerialization";

import { buildHoleCase, buildLibs, selectHoleDiscoveryInputCases, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { clusterDeadStates, profileHoleCase } from "./coverageAtlas/DeadStateClusterAnalysis";
import { analyzeZeroMoveLoop, summarizeZeroMoveLoop, type ZeroMoveLoopResult } from "./coverageAtlas/CycleAnalysis";
import { analyzeConflicts, summarizeConflicts } from "./coverageAtlas/ConflictAnalysis";
import { buildStateGraphAtlas } from "./coverageAtlas/StateGraphAtlas";
import { buildCoverageAtlasResult, renderCoverageAtlasReport } from "./coverageAtlas/CoverageAtlasReport";

const DATA_DIR = "src/customCube/coverageAtlas/data";
const STEP1_CHECKPOINT = path.join(DATA_DIR, "checkpoint-step1-holes.json");
const STEP3_CHECKPOINT = path.join(DATA_DIR, "checkpoint-step3-zeromoveloop.json");
const REPORT_PATH = path.join(DATA_DIR, "coverage-hole-discovery-v1-report.txt");
const RESULT_JSON_PATH = path.join(DATA_DIR, "coverage-hole-discovery-v1-result.json");
const RAW_DATASET_PATH = path.join(DATA_DIR, "raw-dataset-v1-holes.json");

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface SerializedHoleCase extends Omit<HoleCase, "cubies" | "originalCubies"> {
  cubiesJson: string;
  originalCubiesJson: string;
}

function toSerializedHoleCase(hole: HoleCase): SerializedHoleCase {
  const { cubies, originalCubies, ...rest } = hole;
  return { ...rest, cubiesJson: serializeCube(cubies), originalCubiesJson: serializeCube(originalCubies) };
}

function fromSerializedHoleCase(serialized: SerializedHoleCase): HoleCase {
  const { cubiesJson, originalCubiesJson, ...rest } = serialized;
  return { ...rest, cubies: deserializeCube(cubiesJson), originalCubies: deserializeCube(originalCubiesJson) };
}

function saveStep1Checkpoint(completedLabels: string[], holes: SerializedHoleCase[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STEP1_CHECKPOINT, JSON.stringify({ completedLabels, holes }), "utf-8");
}

function loadStep1Checkpoint(): { completedLabels: string[]; holes: SerializedHoleCase[] } {
  if (!fs.existsSync(STEP1_CHECKPOINT)) return { completedLabels: [], holes: [] };
  return JSON.parse(fs.readFileSync(STEP1_CHECKPOINT, "utf-8"));
}

function saveStep3Checkpoint(completedLabels: string[], results: ZeroMoveLoopResult[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STEP3_CHECKPOINT, JSON.stringify({ completedLabels, results }), "utf-8");
}

function loadStep3Checkpoint(): { completedLabels: string[]; results: ZeroMoveLoopResult[] } {
  if (!fs.existsSync(STEP3_CHECKPOINT)) return { completedLabels: [], results: [] };
  return JSON.parse(fs.readFileSync(STEP3_CHECKPOINT, "utf-8"));
}

async function runStep1(dbPath: string): Promise<HoleCase[]> {
  const inputCases = selectHoleDiscoveryInputCases(dbPath);
  log("step1", `input cases selected: ${inputCases.length}`);
  const libs = buildLibs();

  let { completedLabels, holes } = loadStep1Checkpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("step1", `resuming from checkpoint: ${completedLabels.length}/${inputCases.length} done`);

  for (const c of inputCases) {
    if (completedSet.has(c.label)) continue;
    const hole = await buildHoleCase(c, libs);
    completedLabels.push(c.label);
    completedSet.add(c.label);
    if (hole) {
      holes.push(toSerializedHoleCase(hole));
    }
    saveStep1Checkpoint(completedLabels, holes);
    log("step1", `${completedLabels.length}/${inputCases.length} done (${holes.length} confirmed holes so far) -- ${c.label}: ${hole ? "HOLE" : "not a hole (converged or crashed)"}`);
  }

  return holes.map(fromSerializedHoleCase);
}

async function runStep3(holes: HoleCase[]): Promise<ZeroMoveLoopResult[]> {
  let { completedLabels, results } = loadStep3Checkpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("step3", `resuming from checkpoint: ${completedLabels.length}/${holes.length} done`);

  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const result = analyzeZeroMoveLoop(h);
    results.push(result);
    completedLabels.push(h.label);
    completedSet.add(h.label);
    saveStep3Checkpoint(completedLabels, results);
  }
  log("step3", `zero-move-loop confirmation complete: ${results.length}/${holes.length}`);
  return results;
}

async function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: runCoverageHoleDiscoverySprintV1.ts <failures.json path>");
    process.exit(1);
  }

  log("init", "STEP1: Hole Dataset generation starting...");
  const holes = await runStep1(dbPath);
  log("step1", `done: ${holes.length} confirmed Hole cases`);

  log("step2", "Dead State Cluster analysis...");
  const profiles = holes.map(profileHoleCase);
  const clusters = clusterDeadStates(profiles);
  log("step2", `done: ${clusters.length} clusters`);

  log("step3", "Zero-Move Loop confirmation (N=10 repeat-solve per case)...");
  const zeroMoveLoopResults = await runStep3(holes);
  const zeroMoveLoopSummary = summarizeZeroMoveLoop(zeroMoveLoopResults);
  log("step3", `done: ${zeroMoveLoopSummary.confirmedZeroMoveLoopCount}/${zeroMoveLoopSummary.totalCases} confirmed genuine zero-move loops`);

  log("step4", "Conflict analysis...");
  const conflictProfiles = holes.map(analyzeConflicts);
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const conflictSummary = summarizeConflicts(conflictProfiles, holesByLabel);
  log("step4", `done: ${conflictSummary.casesWithAnyConflict}/${conflictSummary.totalCases} cases have >=1 conflict edge`);

  log("step5", "State Graph Atlas...");
  const stateGraphAtlas = buildStateGraphAtlas(holes, clusters);
  log("step5", `done: ${clusters.length} representative graphs captured`);

  log("step6", "Coverage Atlas report...");
  const inputCaseCount = selectHoleDiscoveryInputCases(dbPath).length;
  const result = buildCoverageAtlasResult(
    holes,
    inputCaseCount,
    profiles,
    clusters,
    zeroMoveLoopResults,
    zeroMoveLoopSummary,
    conflictProfiles,
    conflictSummary,
    stateGraphAtlas
  );
  const report = renderCoverageAtlasReport(result);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(RESULT_JSON_PATH, JSON.stringify(result, null, 2), "utf-8");

  // Persist the full Hole Dataset (actual final stuck Cubie[] states, not
  // just the aggregate stats above) as a real artifact for follow-up
  // phases -- this is NOT a checkpoint (checkpoints exist only to survive
  // interruption and are deleted below). Gitignored via raw-dataset-*.json
  // since it's large (~5MB) and reproducible on demand, but deliberately
  // NOT auto-deleted the way checkpoints are.
  fs.writeFileSync(RAW_DATASET_PATH, JSON.stringify(holes.map(toSerializedHoleCase)), "utf-8");
  log("done", `Report written to ${REPORT_PATH}; raw Hole Dataset written to ${RAW_DATASET_PATH}`);
  console.log(report);

  // Clean up checkpoints on clean completion, matching this research arc's
  // own established convention (checkpoints exist to survive interruption,
  // not as permanent artifacts).
  if (fs.existsSync(STEP1_CHECKPOINT)) fs.unlinkSync(STEP1_CHECKPOINT);
  if (fs.existsSync(STEP3_CHECKPOINT)) fs.unlinkSync(STEP3_CHECKPOINT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
