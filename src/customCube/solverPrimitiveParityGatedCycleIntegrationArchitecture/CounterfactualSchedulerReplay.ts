// --- CounterfactualSchedulerReplay (Parity-Gated Cycle Integration
// Architecture Analysis Sprint v1, STEP3) ------------------------------------
// Production Solver is never modified -- fiveByFiveEdgeRecovery.ts hardcodes
// PARITY_GATED_CYCLE's relative position (always right after CCR, in all 3
// schedulingStrategy variants), so testing Options B/C (a DIFFERENT
// relative order) requires a shadow reimplementation of the 3 candidates
// under test, reusing their REAL underlying search functions UNMODIFIED
// (runSuccessV2/W2_WIDER_HOP for REPAIR, runCCRPrototype for CCR, the same
// detectComponents/generateBridgeCandidates/traverseAllCycles/
// bestEffortCleanup/validateDeferred composition genParityGatedCycle()
// itself uses for PARITY_GATED_CYCLE) -- this is genuine re-execution with
// real wall-clock budgets, not an estimate. Each candidate's own Budget
// Contract (REPAIR_RESERVED_SLICE_MS=75ms, CCR="remainingTime", PARITY's
// own 2000ms reserved slice) is applied exactly as production does,
// Math.min(outerDeadline, Date.now()+ownSlice) -- only the ORDER changes.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const MOVE_COST_WEIGHT = 2; // fiveByFiveEdgeRecovery.ts's own constant
const OUTER_DEADLINE_MS = 1000; // PLAN_TIME_BUDGET_MS
const REPAIR_RESERVED_SLICE_MS = 75; // fiveByFiveEdgeRecovery.ts's own constant
const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000; // fiveByFiveEdgeRecovery.ts's own constant

export type SchedulerOption = "A_current" | "B_repair_parity_ccr" | "C_parity_repair_ccr";

export const OPTION_ORDERS: Record<SchedulerOption, ("REPAIR" | "CCR" | "PARITY_GATED_CYCLE")[]> = {
  A_current: ["REPAIR", "CCR", "PARITY_GATED_CYCLE"],
  B_repair_parity_ccr: ["REPAIR", "PARITY_GATED_CYCLE", "CCR"],
  C_parity_repair_ccr: ["PARITY_GATED_CYCLE", "REPAIR", "CCR"],
};

interface CandidateResult {
  type: "REPAIR" | "CCR" | "PARITY_GATED_CYCLE";
  moves: Move[] | null;
  score: number | null;
  runtimeMs: number;
}

function runRepair(cubies: Cubie[], lib: WingLibrary, deadline: number): CandidateResult {
  const start = Date.now();
  const d = Math.min(deadline, Date.now() + REPAIR_RESERVED_SLICE_MS);
  const result = runSuccessV2(cubies, lib, d, W2_WIDER_HOP);
  const runtimeMs = Date.now() - start;
  if (!result.matched || !result.moves) return { type: "REPAIR", moves: null, score: null, runtimeMs };
  return { type: "REPAIR", moves: result.moves, score: scoreFor(cubies, result.moves), runtimeMs };
}

function runCcr(cubies: Cubie[], lib: WingLibrary, deadline: number): CandidateResult {
  const start = Date.now();
  const result = runCCRPrototype(cubies, lib, deadline, "singleCycle"); // CCR's own Budget Contract: remainingTime = outer deadline as-is
  const runtimeMs = Date.now() - start;
  if (!result.matched || !result.moves) return { type: "CCR", moves: null, score: null, runtimeMs };
  return { type: "CCR", moves: result.moves, score: scoreFor(cubies, result.moves), runtimeMs };
}

function runParityGatedCycle(cubies: Cubie[], lib: WingLibrary, deadline: number): CandidateResult {
  const start = Date.now();
  const stats = analyzeConstraints(buildStateGraph(cubies));
  if (stats.componentCount <= 1) return { type: "PARITY_GATED_CYCLE", moves: null, score: null, runtimeMs: Date.now() - start };

  const d = Math.min(deadline, Date.now() + PARITY_GATED_CYCLE_RESERVED_SLICE_MS);
  const components = detectComponents(cubies);
  const bridgeDeadline = Math.min(d, Date.now() + 300);
  let bridgeCandidates: { moves: Move[] }[] = [{ moves: [] }];
  const generated = generateBridgeCandidates(cubies, components, bridgeDeadline, "largestTwo");
  if (generated.length > 0) bridgeCandidates = generated;

  let best: { moves: Move[]; wrong: number } | null = null;
  for (const bridge of bridgeCandidates) {
    if (Date.now() > d) break;
    const afterBridge = cloneCubies(cubies);
    if (bridge.moves.length) applySeq(afterBridge, bridge.moves);
    const traversal = traverseAllCycles(afterBridge, lib, d);
    const traversalMoves = traversal.moves ?? [];
    const afterTraversal = cloneCubies(afterBridge);
    if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
    const cleanupMoves = bestEffortCleanup(afterTraversal, lib, d);
    const finalState = cloneCubies(afterTraversal);
    if (cleanupMoves.length) applySeq(finalState, cleanupMoves);
    const wrong = wrongWingCount5(finalState);
    if (!best || wrong < best.wrong) best = { moves: [...bridge.moves, ...traversalMoves, ...cleanupMoves], wrong };
  }
  const runtimeMs = Date.now() - start;
  if (!best || best.moves.length === 0) return { type: "PARITY_GATED_CYCLE", moves: null, score: null, runtimeMs };
  const afterState = cloneCubies(cubies);
  applySeq(afterState, best.moves);
  const validation = validateDeferred(cubies, afterState);
  if (!validation.accepted) return { type: "PARITY_GATED_CYCLE", moves: null, score: null, runtimeMs };
  return { type: "PARITY_GATED_CYCLE", moves: best.moves, score: scoreFor(cubies, best.moves), runtimeMs };
}

function scoreFor(cubies: Cubie[], moves: Move[]): number {
  const baseScore = scoreWholeState(cubies, DEFAULT_EVALUATOR_WEIGHTS);
  const clone = cloneCubies(cubies);
  applySeq(clone, moves);
  const afterScore = scoreWholeState(clone, DEFAULT_EVALUATOR_WEIGHTS);
  return afterScore - baseScore - moves.length * MOVE_COST_WEIGHT;
}

const RUNNERS: Record<"REPAIR" | "CCR" | "PARITY_GATED_CYCLE", (cubies: Cubie[], lib: WingLibrary, deadline: number) => CandidateResult> = {
  REPAIR: runRepair,
  CCR: runCcr,
  PARITY_GATED_CYCLE: runParityGatedCycle,
};

export interface OptionCaseResult {
  label: string;
  option: SchedulerOption;
  offered: ("REPAIR" | "CCR" | "PARITY_GATED_CYCLE")[];
  chosen: "REPAIR" | "CCR" | "PARITY_GATED_CYCLE" | "none";
  expectedImprovement: number; // chosen candidate's own score, 0 if none chosen
  totalRuntimeMs: number;
}

export function replayOption(cubies: Cubie[], label: string, libs: ExecutorLibraries, option: SchedulerOption): OptionCaseResult {
  const order = OPTION_ORDERS[option];
  const start = Date.now();
  const deadline = start + OUTER_DEADLINE_MS;
  const results: CandidateResult[] = [];
  for (const type of order) {
    if (Date.now() > deadline) break;
    results.push(RUNNERS[type](cubies, libs.lib, deadline));
  }
  const totalRuntimeMs = Date.now() - start;

  const offered = results.filter((r) => r.moves && r.moves.length > 0).map((r) => r.type);
  const scored = results.filter((r) => r.score !== null) as (CandidateResult & { score: number })[];
  const best = scored.length ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;

  return {
    label,
    option,
    offered,
    chosen: best?.type ?? "none",
    expectedImprovement: best?.score ?? 0,
    totalRuntimeMs,
  };
}

export function replayAllOptions(holes: readonly HoleCase[], libs: ExecutorLibraries): Record<SchedulerOption, OptionCaseResult[]> {
  const options: SchedulerOption[] = ["A_current", "B_repair_parity_ccr", "C_parity_repair_ccr"];
  const out = {} as Record<SchedulerOption, OptionCaseResult[]>;
  for (const option of options) {
    out[option] = holes.map((h) => replayOption(h.cubies, h.label, libs, option));
  }
  return out;
}
