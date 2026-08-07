// Cube Model Experiment Sprint v2 -- Extended driver for the 3 new candidates.
//   npx tsx src/customCube/runCubeModelExtendedSprintV1.ts
//
// Puts Facelet-Cycle, Sparse-Touched, and Bitboard through the same
// correctness + performance harness as the original 3-model Sprint
// (runCubeModelExperimentSprintV1.ts), plus one additional benchmark
// (shallow-scramble resolve cost) specifically to test Sparse-Touched's own
// hypothesis, which the standard saturating 4,000-turn benchmark can't
// fairly show (see SparseTouchedModel.ts's header). Bitboard is run at
// gridSize 3 only -- it is structurally 3x3x3-specific (see
// BitboardModel.ts's header for exactly why). No production file is
// imported for anything other than read-only reference, and none is
// modified.
import { writeFileSync } from "node:fs";
import { faceletCycleModel } from "./customCubeExperiments/FaceletCycleModel";
import { sparseTouchedModel } from "./customCubeExperiments/SparseTouchedModel";
import { bitboardModel } from "./customCubeExperiments/BitboardModel";
import { slotCycleModel } from "./customCubeExperiments/SlotCycleModel";
import { groundTruthModel, makeRng, randomTurn, runCorrectnessCheck, runPerformanceBenchmark, type CorrectnessResult, type PerfResult } from "./customCubeExperiments/ExperimentHarness";
import type { CubeModel, Turn } from "./customCubeExperiments/ExperimentTypes";

const CORRECTNESS_GRID_SIZES = [2, 3, 4, 5];
const SEQUENCES_PER_GRID_SIZE = 40;
const TURNS_PER_SEQUENCE = 80;

const PERF_GRID_SIZES = [3, 5];
const PERF_TURN_COUNT = 4000;

const SHALLOW_GRID_SIZE = 5;
// Swept rather than a single fixed depth: an initial probe at a single
// depth (15 turns) showed Sparse-Touched exactly tied with Slot-Cycle, which
// turned out to be a bad benchmark choice, not a bad model -- a follow-up
// sweep (not committed, ad hoc) found the real advantage lives at very
// shallow depths and fades out by ~8-15 turns as touched-piece count grows
// toward the 5x5's 98 total. Sweeping the actual depths here makes that
// crossover part of the recorded, reproducible result instead of something
// that had to be found by hand once and then asserted in prose.
const SHALLOW_SCRAMBLE_DEPTHS = [1, 2, 3, 5, 8, 15];
const SHALLOW_RESOLVE_CALLS = 8000;

interface ShallowResolveResult {
  modelName: string;
  gridSize: number;
  scrambleTurns: number;
  resolveCalls: number;
  totalMs: number;
}

// Applies a small, fixed scramble ONCE, then calls toCubies() repeatedly
// with no further turns in between -- this is the "camera orbiting / redraw
// with no new move" pattern the live renderer actually hits far more often
// than "apply one turn then resolve once", and it's the one shape where a
// model whose resolve cost scales with touched-piece-count (not total piece
// count) can actually show it: after only SHALLOW_SCRAMBLE_TURNS turns on a
// 5x5 (98 pieces), most pieces are still untouched.
function runShallowResolveBenchmark<S>(model: CubeModel<S>, gridSize: number, scrambleTurns: Turn[], resolveCalls: number): ShallowResolveResult {
  const state = model.buildSolved(gridSize);
  for (const turn of scrambleTurns) model.applyTurn(state, turn);
  const t0 = performance.now();
  for (let i = 0; i < resolveCalls; i++) model.toCubies(state);
  const totalMs = performance.now() - t0;
  return { modelName: model.name, gridSize, scrambleTurns: scrambleTurns.length, resolveCalls, totalMs };
}

function main() {
  const rng = makeRng(20260807);

  console.log("=== STEP1: Correctness (facelet-map equivalence vs production model) ===");
  const correctnessResults: CorrectnessResult[] = [];

  for (const model of [faceletCycleModel, sparseTouchedModel] as CubeModel<unknown>[]) {
    for (const gridSize of CORRECTNESS_GRID_SIZES) {
      const sequences: Turn[][] = Array.from({ length: SEQUENCES_PER_GRID_SIZE }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(gridSize, rng)));
      const result = runCorrectnessCheck(model, gridSize, sequences);
      correctnessResults.push(result);
      const status = result.failedSequences === 0 ? "PASS" : "FAIL";
      console.log(`[${status}] ${model.name} @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences correct${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
    }
  }
  // Bitboard: 3x3x3 only (see BitboardModel.ts header).
  {
    const sequences: Turn[][] = Array.from({ length: SEQUENCES_PER_GRID_SIZE }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(3, rng)));
    const result = runCorrectnessCheck(bitboardModel, 3, sequences);
    correctnessResults.push(result);
    const status = result.failedSequences === 0 ? "PASS" : "FAIL";
    console.log(`[${status}] ${bitboardModel.name} @ 3x3: ${result.sequences - result.failedSequences}/${result.sequences} sequences correct${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
  }

  console.log("\n=== STEP2: Performance (standard: apply+resolve every turn, 4,000 turns) ===");
  // All models that apply at a given gridSize are benchmarked together in
  // one pass over that gridSize (rather than groundTruth/slotCycle each
  // getting a second, separate re-run later just for Bitboard's sake) --
  // an earlier version of this driver ran a second isolated gridSize=3
  // block afterwards, and groundTruth/slotCycle's numbers there were
  // wildly different from their first-block numbers on repeated runs (e.g.
  // Ground Truth 17ms in the first block vs 110-130ms in the second, on
  // two separate full runs of this script) -- a reproducible artifact of
  // running the same benchmark a second time later in the process after
  // the large correctness-check allocations upstream, not a real
  // performance difference. Running every model for a gridSize in the same
  // pass avoids that pitfall entirely.
  const perfResults: PerfResult[] = [];
  for (const gridSize of PERF_GRID_SIZES) {
    const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));
    const models: CubeModel<unknown>[] = (
      gridSize === 3 ? [groundTruthModel, slotCycleModel, faceletCycleModel, sparseTouchedModel, bitboardModel] : [groundTruthModel, slotCycleModel, faceletCycleModel, sparseTouchedModel]
    ) as CubeModel<unknown>[];
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

  console.log(`\n=== STEP3: Shallow-scramble resolve cost (Sparse-Touched's own hypothesis, swept across scramble depth on ${SHALLOW_GRID_SIZE}x${SHALLOW_GRID_SIZE}, ${SHALLOW_RESOLVE_CALLS} resolves each) ===`);
  const shallowResults: ShallowResolveResult[] = [];
  for (const depth of SHALLOW_SCRAMBLE_DEPTHS) {
    const shallowTurns: Turn[] = Array.from({ length: depth }, () => randomTurn(SHALLOW_GRID_SIZE, rng));
    for (const model of [groundTruthModel, slotCycleModel, sparseTouchedModel] as CubeModel<unknown>[]) {
      const result = runShallowResolveBenchmark(model, SHALLOW_GRID_SIZE, shallowTurns, SHALLOW_RESOLVE_CALLS);
      shallowResults.push(result);
      console.log(`${model.name} @ ${SHALLOW_GRID_SIZE}x${SHALLOW_GRID_SIZE} (${depth}-turn scramble, ${SHALLOW_RESOLVE_CALLS} resolves): ${result.totalMs.toFixed(1)}ms total (${(result.totalMs / SHALLOW_RESOLVE_CALLS).toFixed(4)}ms/resolve)`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    correctnessConfig: { gridSizes: CORRECTNESS_GRID_SIZES, sequencesPerGridSize: SEQUENCES_PER_GRID_SIZE, turnsPerSequence: TURNS_PER_SEQUENCE, bitboardGridSizes: [3] },
    perfConfig: { gridSizes: PERF_GRID_SIZES, turnCount: PERF_TURN_COUNT, bitboardGridSizes: [3] },
    shallowConfig: { gridSize: SHALLOW_GRID_SIZE, scrambleDepths: SHALLOW_SCRAMBLE_DEPTHS, resolveCalls: SHALLOW_RESOLVE_CALLS },
    correctnessResults,
    perfResults,
    shallowResults,
  };
  writeFileSync("cube-model-extended-v1-report.json", JSON.stringify(report, null, 2));
  console.log("\nWrote cube-model-extended-v1-report.json");
}

main();
