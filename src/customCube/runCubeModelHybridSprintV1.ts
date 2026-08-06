// Cube Model Experiment Sprint v1 -- Hybrid driver.
//   npx tsx src/customCube/runCubeModelHybridSprintV1.ts
//
// Validates Slot-Cycle+Log (see customCubeExperiments/SlotCycleLoggedModel.ts):
// the same correctness/performance harness as the original 3-model Sprint,
// plus a dedicated check that the "free" move log is actually a faithful
// move history (not just present) -- replaying it from a fresh production
// solved cube must reproduce the same end state the model itself reports.
// No production file is imported for anything other than read-only
// reference (buildSolvedCube/applyRawQuarterTurn from cubeState.ts), and
// none is modified.
import { writeFileSync } from "node:fs";
import { applyRawQuarterTurn, buildSolvedCube } from "./cubeState";
import { slotCycleModel } from "./customCubeExperiments/SlotCycleModel";
import { slotCycleLoggedModel } from "./customCubeExperiments/SlotCycleLoggedModel";
import { compareFaceletMaps, computeFaceletMap } from "./customCubeExperiments/FaceletSnapshot";
import { groundTruthModel, makeRng, randomTurn, runCorrectnessCheck, runPerformanceBenchmark, type CorrectnessResult, type PerfResult } from "./customCubeExperiments/ExperimentHarness";
import type { CubeModel, Turn } from "./customCubeExperiments/ExperimentTypes";

const CORRECTNESS_GRID_SIZES = [2, 3, 4, 5];
const SEQUENCES_PER_GRID_SIZE = 40;
const TURNS_PER_SEQUENCE = 80;

const PERF_GRID_SIZES = [3, 5];
const PERF_TURN_COUNT = 4000;

const LOG_FIDELITY_GRID_SIZES = [2, 3, 4, 5];
const LOG_FIDELITY_SEQUENCES = 20;
const LOG_FIDELITY_TURNS = 80;

interface LogFidelityResult {
  gridSize: number;
  sequences: number;
  failedSequences: number;
  firstFailureDetail: string | null;
}

// Checks the log itself, not just the model's own toCubies() output: build
// a state, apply a random sequence, then take ONLY state.log and replay it
// from a completely fresh production solved cube via the real
// applyRawQuarterTurn (not the model's own logic at all) -- the log is only
// a faithful move history if that independent replay lands on the exact
// same facelet map the model reports for the same sequence.
function runLogFidelityCheck(gridSize: number, sequences: Turn[][]): LogFidelityResult {
  let failed = 0;
  let firstFailureDetail: string | null = null;
  for (let s = 0; s < sequences.length; s++) {
    const turns = sequences[s];
    const state = slotCycleLoggedModel.buildSolved(gridSize);
    for (const turn of turns) slotCycleLoggedModel.applyTurn(state, turn);
    const modelReported = computeFaceletMap(slotCycleLoggedModel.toCubies(state));

    const replayed = buildSolvedCube(gridSize);
    for (const turn of state.log) applyRawQuarterTurn(replayed, turn.axis, turn.layer, turn.sign);
    const replayedMap = computeFaceletMap(replayed);

    const diff = compareFaceletMaps(modelReported, replayedMap);
    if (!diff.matches || state.log.length !== turns.length) {
      failed++;
      if (!firstFailureDetail) {
        firstFailureDetail = `sequence ${s}: log.length=${state.log.length} (expected ${turns.length}), ${diff.mismatchedSlots}/${diff.totalSlots} facelet slots mismatched on replay`;
      }
    }
  }
  return { gridSize, sequences: sequences.length, failedSequences: failed, firstFailureDetail };
}

function main() {
  const rng = makeRng(20260806);

  console.log("=== STEP1: Correctness (facelet-map equivalence vs production model) ===");
  const correctnessResults: CorrectnessResult[] = [];
  for (const gridSize of CORRECTNESS_GRID_SIZES) {
    const sequences: Turn[][] = Array.from({ length: SEQUENCES_PER_GRID_SIZE }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(gridSize, rng)));
    const result = runCorrectnessCheck(slotCycleLoggedModel, gridSize, sequences);
    correctnessResults.push(result);
    const status = result.failedSequences === 0 ? "PASS" : "FAIL";
    console.log(`[${status}] ${slotCycleLoggedModel.name} @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences correct${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
  }

  console.log("\n=== STEP2: Log fidelity (independent replay of state.log matches model output) ===");
  const logFidelityResults: LogFidelityResult[] = [];
  for (const gridSize of LOG_FIDELITY_GRID_SIZES) {
    const sequences: Turn[][] = Array.from({ length: LOG_FIDELITY_SEQUENCES }, () => Array.from({ length: LOG_FIDELITY_TURNS }, () => randomTurn(gridSize, rng)));
    const result = runLogFidelityCheck(gridSize, sequences);
    logFidelityResults.push(result);
    const status = result.failedSequences === 0 ? "PASS" : "FAIL";
    console.log(`[${status}] log fidelity @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
  }

  console.log("\n=== STEP3: Performance (Slot-Cycle+Log vs Slot-Cycle vs production -- confirms log overhead is negligible) ===");
  const perfResults: PerfResult[] = [];
  for (const gridSize of PERF_GRID_SIZES) {
    const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));
    const models: CubeModel<unknown>[] = [groundTruthModel, slotCycleModel, slotCycleLoggedModel] as CubeModel<unknown>[];
    for (const model of models) {
      const result = runPerformanceBenchmark(model, gridSize, turns);
      perfResults.push(result);
      console.log(
        `${model.name} @ ${gridSize}x${gridSize} (${PERF_TURN_COUNT} turns): ` +
          `apply+resolve-every-turn=${result.applyAndResolveEveryTurnMs.toFixed(1)}ms ` +
          `(${(PERF_TURN_COUNT / (result.applyAndResolveEveryTurnMs / 1000)).toFixed(0)} turns/sec realistic)`,
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    correctnessConfig: { gridSizes: CORRECTNESS_GRID_SIZES, sequencesPerGridSize: SEQUENCES_PER_GRID_SIZE, turnsPerSequence: TURNS_PER_SEQUENCE },
    logFidelityConfig: { gridSizes: LOG_FIDELITY_GRID_SIZES, sequences: LOG_FIDELITY_SEQUENCES, turnsPerSequence: LOG_FIDELITY_TURNS },
    perfConfig: { gridSizes: PERF_GRID_SIZES, turnCount: PERF_TURN_COUNT },
    correctnessResults,
    logFidelityResults,
    perfResults,
  };
  writeFileSync("cube-model-hybrid-v1-report.json", JSON.stringify(report, null, 2));
  console.log("\nWrote cube-model-hybrid-v1-report.json");
}

main();
