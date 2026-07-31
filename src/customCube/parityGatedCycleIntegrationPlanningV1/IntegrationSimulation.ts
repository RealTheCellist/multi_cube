// --- IntegrationSimulation (Parity-Gated Cycle Production Integration
// Planning Sprint v1, STEP6, part 1) ------------------------------------------
// Simulates "Baseline" (today's real Recovery Scheduler, unmodified) vs
// "Integrated" (same real candidates + the Prototype merged in as a 6th
// competitor, scored with the identical formula chooseBestRecovery() would
// apply) across the full 142-case Hole Dataset, WITHOUT ever editing
// fiveByFiveEdgeRecovery.ts itself -- the merge/argmax happens entirely in
// this Sprint's own code. Prototype's own budget is a parameter so both a
// realistic production-slice size (500ms, matching SETUP's own reserved
// slice -- the largest already in production) and the idealized 2000ms
// research budget (Prototype Sprint v1's own) can be compared side by
// side, distinguishing "the mechanism doesn't help" from "the mechanism
// needs more Budget than Production currently gives ANY candidate".
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { tryCrossComponentBridgeCycleResolver } from "../parityGatedCyclePrototypeV1/CrossComponentBridgeCycleResolver";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const MOVE_COST_WEIGHT = 2;

export interface SimulationOutcome {
  label: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  solved: boolean;
  improved: boolean;
  trueRegression: boolean;
  wallMs: number;
  chosenType: string | null;
}

function baselineOutcome(cubies: Cubie[], label: string, libs: ExecutorLibraries): SimulationOutcome {
  const wrongWingBefore = wrongWingCount5(cubies);
  const start = Date.now();
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + 1000);
  const best = chooseBestRecovery(candidates);
  const wallMs = Date.now() - start;
  let wrongWingAfter = wrongWingBefore;
  if (best) {
    const clone = cloneCubies(cubies);
    applySeq(clone, best.moves);
    wrongWingAfter = wrongWingCount5(clone);
  }
  return { label, wrongWingBefore, wrongWingAfter, solved: wrongWingAfter === 0, improved: wrongWingAfter < wrongWingBefore, trueRegression: wrongWingAfter > wrongWingBefore, wallMs, chosenType: best?.type ?? null };
}

function integratedOutcome(cubies: Cubie[], label: string, libs: ExecutorLibraries, prototypeBudgetMs: number): SimulationOutcome {
  const wrongWingBefore = wrongWingCount5(cubies);
  const start = Date.now();
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + 1000);
  const baseScore = scoreWholeState(cubies, DEFAULT_EVALUATOR_WEIGHTS);
  const protoResult = tryCrossComponentBridgeCycleResolver(cubies, libs.lib, Date.now() + prototypeBudgetMs);

  let best: { type: string; moves: Move[]; score: number } | null = null;
  for (const c of candidates) {
    if (!best || c.score > best.score) best = { type: c.type, moves: c.moves, score: c.score };
  }
  if (protoResult.moves && protoResult.moves.length > 0) {
    const clone = cloneCubies(cubies);
    applySeq(clone, protoResult.moves);
    const afterScore = scoreWholeState(clone, DEFAULT_EVALUATOR_WEIGHTS);
    const score = afterScore - baseScore - protoResult.moves.length * MOVE_COST_WEIGHT;
    if (!best || score > best.score) best = { type: "PARITY_GATED_CYCLE", moves: protoResult.moves, score };
  }
  const wallMs = Date.now() - start;

  let wrongWingAfter = wrongWingBefore;
  if (best) {
    const clone = cloneCubies(cubies);
    applySeq(clone, best.moves);
    wrongWingAfter = wrongWingCount5(clone);
  }
  return { label, wrongWingBefore, wrongWingAfter, solved: wrongWingAfter === 0, improved: wrongWingAfter < wrongWingBefore, trueRegression: wrongWingAfter > wrongWingBefore, wallMs, chosenType: best?.type ?? null };
}

export interface SimulationPair {
  baseline: SimulationOutcome[];
  integrated: SimulationOutcome[];
}

export function runIntegrationSimulation(holes: readonly HoleCase[], libs: ExecutorLibraries, prototypeBudgetMs: number): SimulationPair {
  const baseline = holes.map((h) => baselineOutcome(h.cubies, h.label, libs));
  const integrated = holes.map((h) => integratedOutcome(h.cubies, h.label, libs, prototypeBudgetMs));
  return { baseline, integrated };
}
