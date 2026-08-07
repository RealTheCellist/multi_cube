// Cube Model Experiment Sprint v3 -- driver for 5 new candidates.
//   npx tsx src/customCube/runCubeModelExperimentSprintV3.ts
//
// Puts Compose-Batched, Object-Pool, TypedArray-Cycle, Persistent, and
// Zobrist-Hash through the standard correctness+performance harness, plus
// one dedicated benchmark per model that targets its OWN specific
// hypothesis (the standard "apply+resolve every turn" loop can't fairly
// show any of these -- see each STEP's comment). No production file is
// imported for anything other than read-only reference, and none is
// modified.
import { writeFileSync } from "node:fs";
import { composeBatchedModel } from "./customCubeExperiments/ComposeBatchedModel";
import { objectPoolModel } from "./customCubeExperiments/ObjectPoolModel";
import { typedArrayCycleModel } from "./customCubeExperiments/TypedArrayCycleModel";
import { persistentModel, type PersistentState } from "./customCubeExperiments/PersistentModel";
import { zobristHashModel, computeZobristHashFromScratch, type ZobristState } from "./customCubeExperiments/ZobristHashModel";
import { slotCycleModel } from "./customCubeExperiments/SlotCycleModel";
import { deltaLogModel } from "./customCubeExperiments/DeltaLogModel";
import { groundTruthModel, makeRng, randomTurn, runCorrectnessCheck, runPerformanceBenchmark, type CorrectnessResult, type PerfResult } from "./customCubeExperiments/ExperimentHarness";
import type { CubeModel, Turn } from "./customCubeExperiments/ExperimentTypes";

const CORRECTNESS_GRID_SIZES = [2, 3, 4, 5];
const SEQUENCES_PER_GRID_SIZE = 40;
const TURNS_PER_SEQUENCE = 80;

const PERF_GRID_SIZES = [3, 5];
const PERF_TURN_COUNT = 4000;

const NEW_MODELS: CubeModel<unknown>[] = [composeBatchedModel, objectPoolModel, typedArrayCycleModel, persistentModel, zobristHashModel] as CubeModel<unknown>[];

function step1Correctness(rng: () => number) {
  console.log("=== STEP1: Correctness (facelet-map equivalence vs production model) ===");
  const results: CorrectnessResult[] = [];
  for (const model of NEW_MODELS) {
    for (const gridSize of CORRECTNESS_GRID_SIZES) {
      const sequences: Turn[][] = Array.from({ length: SEQUENCES_PER_GRID_SIZE }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(gridSize, rng)));
      const result = runCorrectnessCheck(model, gridSize, sequences);
      results.push(result);
      const status = result.failedSequences === 0 ? "PASS" : "FAIL";
      console.log(`[${status}] ${model.name} @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences correct${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
    }
  }
  return results;
}

function step2Performance(rng: () => number) {
  console.log("\n=== STEP2: Performance (standard: apply+resolve every turn, 4,000 turns) ===");
  // All models benchmarked together in one pass per gridSize -- see
  // runCubeModelExtendedSprintV1.ts's STEP2 comment for why a second,
  // separate pass later in the process produces unreliable numbers (GC
  // pressure artifact, reproduced and fixed there).
  const results: PerfResult[] = [];
  for (const gridSize of PERF_GRID_SIZES) {
    const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));
    const models: CubeModel<unknown>[] = [groundTruthModel, slotCycleModel, ...NEW_MODELS] as CubeModel<unknown>[];
    for (const model of models) {
      const result = runPerformanceBenchmark(model, gridSize, turns);
      results.push(result);
      console.log(
        `${model.name} @ ${gridSize}x${gridSize} (${PERF_TURN_COUNT} turns): ` +
          `apply+resolve-every-turn=${result.applyAndResolveEveryTurnMs.toFixed(1)}ms ` +
          `(${(PERF_TURN_COUNT / (result.applyAndResolveEveryTurnMs / 1000)).toFixed(0)} turns/sec realistic)`,
      );
    }
  }
  return results;
}

// Compose-Batched's actual hypothesis: apply a big batch of turns with NO
// resolve in between, then resolve exactly once (matches
// randomLayerScramble's real shape -- many turns applied before the scene
// ever renders). runPerformanceBenchmark already measures this as
// applyOnlyMs/finalResolveMs, just not usually printed -- surfaced here
// against Delta-Log (same "log now" shape, but replays via production
// geometry) and Slot-Cycle (immediate-apply baseline).
function step3ComposeBatched(rng: () => number) {
  console.log("\n=== STEP3: Compose-Batched hypothesis (apply-only then resolve once, 4,000 turns) ===");
  const results: PerfResult[] = [];
  for (const gridSize of PERF_GRID_SIZES) {
    const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));
    for (const model of [groundTruthModel, slotCycleModel, deltaLogModel, composeBatchedModel] as CubeModel<unknown>[]) {
      const result = runPerformanceBenchmark(model, gridSize, turns);
      results.push(result);
      console.log(`${model.name} @ ${gridSize}x${gridSize}: apply-only=${result.applyOnlyMs.toFixed(1)}ms, resolve-once-after=${result.finalResolveMs.toFixed(1)}ms, total=${(result.applyOnlyMs + result.finalResolveMs).toFixed(1)}ms`);
    }
  }
  return results;
}

interface ResolveOnlyResult {
  modelName: string;
  gridSize: number;
  resolveCalls: number;
  totalMs: number;
}

// Object-Pool's hypothesis isolated from apply cost: scramble once, then
// call toCubies() repeatedly with no new turns -- pure allocation-vs-mutate
// comparison, same shape as the extended sprint's shallow-resolve
// benchmark but at a single fixed scramble depth since Object-Pool's win
// doesn't depend on touched-piece fraction the way Sparse-Touched's did.
function step4ObjectPoolResolveOnly(rng: () => number): ResolveOnlyResult[] {
  console.log("\n=== STEP4: Object-Pool hypothesis (scramble once, then 20,000 resolves with no new turns) ===");
  const results: ResolveOnlyResult[] = [];
  const RESOLVE_CALLS = 20000;
  for (const gridSize of PERF_GRID_SIZES) {
    const scrambleTurns: Turn[] = Array.from({ length: 25 }, () => randomTurn(gridSize, rng));
    for (const model of [groundTruthModel, slotCycleModel, objectPoolModel] as CubeModel<unknown>[]) {
      const state = model.buildSolved(gridSize);
      for (const turn of scrambleTurns) model.applyTurn(state, turn);
      const t0 = performance.now();
      for (let i = 0; i < RESOLVE_CALLS; i++) model.toCubies(state);
      const totalMs = performance.now() - t0;
      results.push({ modelName: model.name, gridSize, resolveCalls: RESOLVE_CALLS, totalMs });
      console.log(`${model.name} @ ${gridSize}x${gridSize}: ${totalMs.toFixed(1)}ms total (${(totalMs / RESOLVE_CALLS).toFixed(5)}ms/resolve)`);
    }
  }
  return results;
}

interface UndoCostResult {
  approach: string;
  gridSize: number;
  applyTurns: number;
  undoSteps: number;
  applyMs: number;
  undoMs: number;
}

// Persistent's hypothesis: apply N turns (each keeping a free snapshot),
// then undo all the way back to solved, walking state.history by index --
// versus the "naive" cost of bolting the same undo capability onto
// Slot-Cycle, which has no history of its own: the caller must externally
// clone-and-store a full snapshot after every turn (via toCubies(), the
// only supported way to get an independent snapshot out of Slot-Cycle) to
// get back to any earlier point.
function step5PersistentUndoCost(rng: () => number): UndoCostResult[] {
  console.log("\n=== STEP5: Persistent hypothesis (30 turns, then undo all the way back to solved) ===");
  const results: UndoCostResult[] = [];
  const gridSize = 5;
  const APPLY_TURNS = 30;
  const turns: Turn[] = Array.from({ length: APPLY_TURNS }, () => randomTurn(gridSize, rng));

  {
    const state: PersistentState = persistentModel.buildSolved(gridSize);
    const t0 = performance.now();
    for (const turn of turns) persistentModel.applyTurn(state, turn);
    const applyMs = performance.now() - t0;

    const t1 = performance.now();
    let restored = state.current;
    for (let i = state.history.length - 1; i >= 0; i--) restored = state.history[i];
    const undoMs = performance.now() - t1;
    void restored;

    results.push({ approach: "Persistent (built-in history)", gridSize, applyTurns: APPLY_TURNS, undoSteps: APPLY_TURNS, applyMs, undoMs });
    console.log(`Persistent @ ${gridSize}x${gridSize}: apply=${applyMs.toFixed(3)}ms, undo-${APPLY_TURNS}-steps=${undoMs.toFixed(3)}ms`);
  }

  {
    const state = slotCycleModel.buildSolved(gridSize);
    const externalHistory = [slotCycleModel.toCubies(state)];
    const t0 = performance.now();
    for (const turn of turns) {
      slotCycleModel.applyTurn(state, turn);
      externalHistory.push(slotCycleModel.toCubies(state)); // the bolt-on cost: a full clone after every turn, since Slot-Cycle keeps none of its own
    }
    const applyMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = externalHistory.length - 1; i >= 0; i--) void externalHistory[i];
    const undoMs = performance.now() - t1;

    results.push({ approach: "Slot-Cycle + external clone-per-turn (naive bolt-on)", gridSize, applyTurns: APPLY_TURNS, undoSteps: APPLY_TURNS, applyMs, undoMs });
    console.log(`Slot-Cycle+external @ ${gridSize}x${gridSize}: apply(incl. clone-per-turn)=${applyMs.toFixed(3)}ms, undo-${APPLY_TURNS}-steps=${undoMs.toFixed(3)}ms`);
  }

  return results;
}

interface HashFidelityResult {
  gridSize: number;
  sequences: number;
  failedSequences: number;
  firstFailureDetail: string | null;
}

function runHashFidelityCheck(gridSize: number, sequences: Turn[][]): HashFidelityResult {
  let failed = 0;
  let firstFailureDetail: string | null = null;
  for (let s = 0; s < sequences.length; s++) {
    const state: ZobristState = zobristHashModel.buildSolved(gridSize);
    for (const turn of sequences[s]) zobristHashModel.applyTurn(state, turn);
    const fromScratch = computeZobristHashFromScratch(gridSize, state.inner);
    if (fromScratch !== state.hash) {
      failed++;
      if (!firstFailureDetail) firstFailureDetail = `sequence ${s}: incremental hash=${state.hash}, from-scratch=${fromScratch}`;
    }
  }
  return { gridSize, sequences: sequences.length, failedSequences: failed, firstFailureDetail };
}

interface HashAccessCostResult {
  approach: string;
  gridSize: number;
  turnCount: number;
  totalMs: number;
}

// Zobrist-Hash's hypothesis: simulate the exact access pattern a
// BFS/IDA*-style solver dedup check would have -- after every single turn,
// ask "what's the current hash". Incremental maintenance means that's an
// O(1) field read; without it (plain Slot-Cycle), the only way to get a
// hash is to compute one from scratch every time, O(pieceCount) each call.
function step6ZobristHashAccessCost(rng: () => number): HashAccessCostResult[] {
  console.log("\n=== STEP6: Zobrist-Hash hypothesis (hash-check after every turn, 4,000 turns, simulating BFS dedup) ===");
  const results: HashAccessCostResult[] = [];
  const gridSize = 5;
  const turns: Turn[] = Array.from({ length: PERF_TURN_COUNT }, () => randomTurn(gridSize, rng));

  {
    const state: ZobristState = zobristHashModel.buildSolved(gridSize);
    const t0 = performance.now();
    let sink = 0;
    for (const turn of turns) {
      zobristHashModel.applyTurn(state, turn);
      sink ^= state.hash; // O(1) read
    }
    const totalMs = performance.now() - t0;
    void sink;
    results.push({ approach: "Zobrist-Hash (incremental)", gridSize, turnCount: PERF_TURN_COUNT, totalMs });
    console.log(`Zobrist-Hash (incremental) @ ${gridSize}x${gridSize}: ${totalMs.toFixed(1)}ms for ${PERF_TURN_COUNT} turn+hash-check pairs`);
  }

  {
    const state = slotCycleModel.buildSolved(gridSize);
    const t0 = performance.now();
    let sink = 0;
    for (const turn of turns) {
      slotCycleModel.applyTurn(state, turn);
      sink ^= computeZobristHashFromScratch(gridSize, state); // O(pieceCount) every check
    }
    const totalMs = performance.now() - t0;
    void sink;
    results.push({ approach: "Slot-Cycle + recompute-from-scratch", gridSize, turnCount: PERF_TURN_COUNT, totalMs });
    console.log(`Slot-Cycle+recompute-from-scratch @ ${gridSize}x${gridSize}: ${totalMs.toFixed(1)}ms for ${PERF_TURN_COUNT} turn+hash-check pairs`);
  }

  return results;
}

function main() {
  const rng = makeRng(20260807);
  const correctnessResults = step1Correctness(rng);
  const perfResults = step2Performance(rng);
  const composeBatchedResults = step3ComposeBatched(rng);
  const objectPoolResults = step4ObjectPoolResolveOnly(rng);
  const undoCostResults = step5PersistentUndoCost(rng);

  console.log("\n=== STEP6a: Zobrist-Hash fidelity (incremental hash matches independent from-scratch recompute) ===");
  const hashFidelityResults: HashFidelityResult[] = [];
  for (const gridSize of CORRECTNESS_GRID_SIZES) {
    const sequences: Turn[][] = Array.from({ length: 20 }, () => Array.from({ length: TURNS_PER_SEQUENCE }, () => randomTurn(gridSize, rng)));
    const result = runHashFidelityCheck(gridSize, sequences);
    hashFidelityResults.push(result);
    const status = result.failedSequences === 0 ? "PASS" : "FAIL";
    console.log(`[${status}] hash fidelity @ ${gridSize}x${gridSize}: ${result.sequences - result.failedSequences}/${result.sequences} sequences${result.firstFailureDetail ? ` -- ${result.firstFailureDetail}` : ""}`);
  }

  const hashAccessCostResults = step6ZobristHashAccessCost(rng);

  const report = {
    generatedAt: new Date().toISOString(),
    correctnessConfig: { gridSizes: CORRECTNESS_GRID_SIZES, sequencesPerGridSize: SEQUENCES_PER_GRID_SIZE, turnsPerSequence: TURNS_PER_SEQUENCE },
    perfConfig: { gridSizes: PERF_GRID_SIZES, turnCount: PERF_TURN_COUNT },
    correctnessResults,
    perfResults,
    composeBatchedResults,
    objectPoolResults,
    undoCostResults,
    hashFidelityResults,
    hashAccessCostResults,
  };
  writeFileSync("cube-model-experiment-v3-report.json", JSON.stringify(report, null, 2));
  console.log("\nWrote cube-model-experiment-v3-report.json");
}

main();
