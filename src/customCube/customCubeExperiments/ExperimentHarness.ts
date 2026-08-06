// Cube Model Experiment Sprint v1 -- shared correctness + performance runner
// that drives every candidate model identically against the real
// production model (cubeState.ts, read-only import -- never modified).
import type { Axis } from "../cubeMath";
import { applyRawQuarterTurn, buildSolvedCube, cloneCubies, type Cubie } from "../cubeState";
import { compareFaceletMaps, computeFaceletMap } from "./FaceletSnapshot";
import type { CubeModel, Turn } from "./ExperimentTypes";

export const groundTruthModel: CubeModel<Cubie[]> = {
  name: "Ground Truth",
  summary: "현재 프로덕션이 실제로 쓰는 피스(Cubie) 모델 그대로 -- 비교 기준선",
  buildSolved: (gridSize) => buildSolvedCube(gridSize),
  applyTurn: (state, turn) => applyRawQuarterTurn(state, turn.axis, turn.layer, turn.sign),
  toCubies: (state) => cloneCubies(state),
};

// Deterministic PRNG (mulberry32) so a run's correctness/performance results
// are reproducible across re-runs and across models within the same run,
// rather than depending on Math.random's global, unseeded stream.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomTurn(gridSize: number, rng: () => number): Turn {
  const axes: Axis[] = ["x", "y", "z"];
  const axis = axes[Math.floor(rng() * 3)];
  const offset = (gridSize - 1) / 2;
  const layerIndex = Math.floor(rng() * gridSize);
  const layer = layerIndex - offset;
  const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;
  return { axis, layer, sign };
}

export interface CorrectnessResult {
  modelName: string;
  gridSize: number;
  sequences: number;
  turnsPerSequence: number;
  failedSequences: number;
  firstFailureDetail: string | null;
}

export function runCorrectnessCheck<S>(model: CubeModel<S>, gridSize: number, sequences: Turn[][]): CorrectnessResult {
  let failed = 0;
  let firstFailureDetail: string | null = null;
  for (let s = 0; s < sequences.length; s++) {
    const turns = sequences[s];
    const groundTruth = buildSolvedCube(gridSize);
    const candidateState = model.buildSolved(gridSize);
    for (const turn of turns) {
      applyRawQuarterTurn(groundTruth, turn.axis, turn.layer, turn.sign);
      model.applyTurn(candidateState, turn);
    }
    const expected = computeFaceletMap(groundTruth);
    const actual = computeFaceletMap(model.toCubies(candidateState));
    const diff = compareFaceletMaps(expected, actual);
    if (!diff.matches) {
      failed++;
      if (!firstFailureDetail) {
        firstFailureDetail = `sequence ${s}: ${diff.mismatchedSlots}/${diff.totalSlots} facelet slots mismatched (first at ${diff.firstMismatchKey})`;
      }
    }
  }
  return {
    modelName: model.name,
    gridSize,
    sequences: sequences.length,
    turnsPerSequence: sequences[0]?.length ?? 0,
    failedSequences: failed,
    firstFailureDetail,
  };
}

export interface PerfResult {
  modelName: string;
  gridSize: number;
  turnCount: number;
  applyOnlyMs: number;
  finalResolveMs: number;
  applyAndResolveEveryTurnMs: number;
}

export function runPerformanceBenchmark<S>(model: CubeModel<S>, gridSize: number, turns: Turn[]): PerfResult {
  // Scenario A: apply every turn back-to-back, resolve to real positions
  // only once at the very end -- best case for a model that defers work.
  let state = model.buildSolved(gridSize);
  const t0 = performance.now();
  for (const turn of turns) model.applyTurn(state, turn);
  const applyOnlyMs = performance.now() - t0;
  const t1 = performance.now();
  model.toCubies(state);
  const finalResolveMs = performance.now() - t1;

  // Scenario B: apply one turn, then immediately resolve, repeated --
  // this is what the live renderer actually needs (a swipe commit has to
  // show the result right away, not at some later batch point), so it's
  // the fair real-world-equivalent number even though it's unkind to any
  // model whose whole idea is deferred resolution.
  state = model.buildSolved(gridSize);
  const t2 = performance.now();
  for (const turn of turns) {
    model.applyTurn(state, turn);
    model.toCubies(state);
  }
  const applyAndResolveEveryTurnMs = performance.now() - t2;

  return { modelName: model.name, gridSize, turnCount: turns.length, applyOnlyMs, finalResolveMs, applyAndResolveEveryTurnMs };
}
