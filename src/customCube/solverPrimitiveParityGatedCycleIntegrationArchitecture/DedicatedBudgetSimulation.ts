// --- DedicatedBudgetSimulation (Parity-Gated Cycle Integration
// Architecture Analysis Sprint v1, STEP4) ------------------------------------
// Scheduler POSITION is held fixed at today's real production order
// (REPAIR -> CCR -> PARITY_GATED_CYCLE, Option A from
// CounterfactualSchedulerReplay.ts) -- only PARITY_GATED_CYCLE's own
// Budget policy varies: "remainingTime" (whatever's left of the outer
// deadline, CCR's own style, d=deadline directly) vs a FIXED reserved
// slice of 500/1000/1500/2000ms (Math.min(deadline, Date.now()+X), REPAIR/
// MIXED_COMMUTATOR/SETUP/today's-PARITY_GATED_CYCLE's own style). Reuses
// the SAME real REPAIR/CCR runners and PARITY_GATED_CYCLE pipeline
// building blocks CounterfactualSchedulerReplay.ts already established
// (not re-derived) -- only the budget-policy branch is new.
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

const MOVE_COST_WEIGHT = 2;
const OUTER_DEADLINE_MS = 1000;
const REPAIR_RESERVED_SLICE_MS = 75;

export type BudgetPolicy = "remainingTime" | 500 | 1000 | 1500 | 2000;
export const BUDGET_POLICIES: BudgetPolicy[] = ["remainingTime", 500, 1000, 1500, 2000];

function scoreFor(cubies: Cubie[], moves: Move[]): number {
  const baseScore = scoreWholeState(cubies, DEFAULT_EVALUATOR_WEIGHTS);
  const clone = cloneCubies(cubies);
  applySeq(clone, moves);
  const afterScore = scoreWholeState(clone, DEFAULT_EVALUATOR_WEIGHTS);
  return afterScore - baseScore - moves.length * MOVE_COST_WEIGHT;
}

function runParityGatedCycleWithPolicy(cubies: Cubie[], lib: WingLibrary, deadline: number, policy: BudgetPolicy): { moves: Move[] | null; score: number | null; runtimeMs: number } {
  const start = Date.now();
  const stats = analyzeConstraints(buildStateGraph(cubies));
  if (stats.componentCount <= 1) return { moves: null, score: null, runtimeMs: Date.now() - start };

  const d = policy === "remainingTime" ? deadline : Math.min(deadline, Date.now() + policy);
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
  if (!best || best.moves.length === 0) return { moves: null, score: null, runtimeMs };
  const afterState = cloneCubies(cubies);
  applySeq(afterState, best.moves);
  const validation = validateDeferred(cubies, afterState);
  if (!validation.accepted) return { moves: null, score: null, runtimeMs };
  return { moves: best.moves, score: scoreFor(cubies, best.moves), runtimeMs };
}

export interface BudgetPolicyCaseResult {
  label: string;
  policy: BudgetPolicy;
  parityOffered: boolean;
  parityChosen: boolean;
  totalRuntimeMs: number;
}

export function replayBudgetPolicy(cubies: Cubie[], label: string, libs: ExecutorLibraries, policy: BudgetPolicy): BudgetPolicyCaseResult {
  const start = Date.now();
  const deadline = start + OUTER_DEADLINE_MS;

  // Fixed order matching today's real production position: REPAIR -> CCR -> PARITY_GATED_CYCLE.
  const repairD = Math.min(deadline, Date.now() + REPAIR_RESERVED_SLICE_MS);
  const repair = runSuccessV2(cubies, libs.lib, repairD, W2_WIDER_HOP);
  const repairScore = repair.matched && repair.moves ? scoreFor(cubies, repair.moves) : null;

  const ccr = runCCRPrototype(cubies, libs.lib, deadline, "singleCycle");
  const ccrScore = ccr.matched && ccr.moves ? scoreFor(cubies, ccr.moves) : null;

  const parity = runParityGatedCycleWithPolicy(cubies, libs.lib, deadline, policy);
  const totalRuntimeMs = Date.now() - start;

  const candidates: { type: string; score: number }[] = [];
  if (repairScore !== null) candidates.push({ type: "REPAIR", score: repairScore });
  if (ccrScore !== null) candidates.push({ type: "CCR", score: ccrScore });
  if (parity.score !== null) candidates.push({ type: "PARITY_GATED_CYCLE", score: parity.score });
  const best = candidates.length ? candidates.reduce((a, b) => (b.score > a.score ? b : a)) : null;

  return {
    label,
    policy,
    parityOffered: parity.moves !== null && parity.moves.length > 0,
    parityChosen: best?.type === "PARITY_GATED_CYCLE",
    totalRuntimeMs,
  };
}

export function replayAllBudgetPolicies(holes: readonly HoleCase[], libs: ExecutorLibraries): Record<string, BudgetPolicyCaseResult[]> {
  const out: Record<string, BudgetPolicyCaseResult[]> = {};
  for (const policy of BUDGET_POLICIES) {
    out[String(policy)] = holes.map((h) => replayBudgetPolicy(h.cubies, h.label, libs, policy));
  }
  return out;
}
