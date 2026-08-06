// Cube Model Experiment Sprint v1 -- driver.
//   npx tsx src/customCube/runCubeModelExperimentSprintV1.ts
//
// Builds 3 newly-invented, structurally distinct cube state models
// (Delta-Log, Discrete-Twist, Slot-Cycle -- see customCubeExperiments/) in
// complete isolation from the live app (no production file is imported for
// anything other than read-only reference: buildSolvedCube/
// applyRawQuarterTurn/cloneCubies/roundedComponent from cubeState.ts,
// rotateGridVector90/quarterTurnQuaternion from cubeMath.ts -- none
// modified), verifies each is correctness-equivalent to the real
// production model across many random move sequences at every playable
// gridSize, then benchmarks turn-application performance against the
// production model and against each other.
import { writeFileSync } from "node:fs";
import { deltaLogModel } from "./customCubeExperiments/DeltaLogModel";
import { discreteTwistModel } from "./customCubeExperiments/DiscreteTwistModel";
import { slotCycleModel } from "./customCubeExperiments/SlotCycleModel";
import { groundTruthModel, makeRng, randomTurn, runCorrectnessCheck, runPerformanceBenchmark, type CorrectnessResult, type PerfResult } from "./customCubeExperiments/ExperimentHarness";
import type { CubeModel, Turn } from "./customCubeExperiments/ExperimentTypes";

const CANDIDATES: CubeModel<unknown>[] = [deltaLogModel, discreteTwistModel, slotCycleModel] as CubeModel<unknown>[];

const CORRECTNESS_GRID_SIZES = [2, 3, 4, 5];
const SEQUENCES_PER_GRID_SIZE = 40;
const TURNS_PER_SEQUENCE = 80;

const PERF_GRID_SIZES = [3, 5];
const PERF_TURN_COUNT = 4000;

function main() {
  const rng = makeRng(20260806);

  console.log("=== STEP1: Correctness (facelet-map equivalence vs production model) ===");
  const correctnessResults: CorrectnessResult[] = [];
  for (const gridSize of CORRECTNESS_GRID_SIZES) {
    const sequences: Turn[][] = Array.from({ length: SEQUENCES_PER_GRID_SIZE }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(gridSize, rng)));
    for (const model of CANDIDATES) {
      const result = runCorrectnessCheck(model, gridSize, sequences);
      correctnessResults.push(result);
      const status = result.failedSequences === 0 ? "PASS" : "FAIL";
      console.log(`[${status}] ${model.name} @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences correct${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
    }
  }

  console.log("\n=== STEP2: Performance (turn-apply speed vs production model) ===");
  const perfResults: PerfResult[] = [];
  for (const gridSize of PERF_GRID_SIZES) {
    const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));
    const modelsForPerf: CubeModel<unknown>[] = [groundTruthModel as CubeModel<unknown>, ...CANDIDATES];
    for (const model of modelsForPerf) {
      const result = runPerformanceBenchmark(model, gridSize, turns);
      perfResults.push(result);
      console.log(
        `${model.name} @ ${gridSize}x${gridSize} (${PERF_TURN_COUNT} turns): ` +
          `apply-only=${result.applyOnlyMs.toFixed(1)}ms, final-resolve=${result.finalResolveMs.toFixed(1)}ms, ` +
          `apply+resolve-every-turn=${result.applyAndResolveEveryTurnMs.toFixed(1)}ms ` +
          `(${(PERF_TURN_COUNT / (result.applyAndResolveEveryTurnMs / 1000)).toFixed(0)} turns/sec realistic)`,
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    correctnessConfig: { gridSizes: CORRECTNESS_GRID_SIZES, sequencesPerGridSize: SEQUENCES_PER_GRID_SIZE, turnsPerSequence: TURNS_PER_SEQUENCE },
    perfConfig: { gridSizes: PERF_GRID_SIZES, turnCount: PERF_TURN_COUNT },
    correctnessResults,
    perfResults,
  };
  writeFileSync("cube-model-experiment-v1-report.json", JSON.stringify(report, null, 2));
  console.log("\nWrote cube-model-experiment-v1-report.json");
}

main();
