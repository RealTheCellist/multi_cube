// --- CapabilityBenchmark (Parity-Gated Cycle Primitive Prototype
// Refinement Sprint v1, STEP5) -------------------------------------------------
// Real replay, 3 arms, over the SAME 41 real PRIMITIVE_FAILURE cases
// STEP1-4 already used:
//   Baseline -- no rescue attempt at all (wrongWingCount unchanged).
//   Current Primitive -- the real, unmodified bridge(bounded)+traversal+
//     cleanup+validateDeferred composition (same as FailureTaxonomy.ts's
//     own pipeline, reused here for its end-state, not its category).
//   Counterfactual Candidate Injection -- identical pipeline, except the
//     bridge step uses CounterfactualCandidateInjection.ts's own widened
//     (uncapped) search instead of the real bounded
//     generateBridgeCandidates(). Traversal/cleanup/validateDeferred are
//     byte-for-byte the same real functions in both arms -- only the
//     bridge candidate SOURCE differs.
// Statistical Validation reuses this arc's own Standard Evaluation
// Protocol (computeStats/analyzeEffectSize,
// solverPrimitiveEvaluationStabilization/, unmodified) on the paired
// improved-count diff (Injection arm - Current arm), N=41 (>=15).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { injectWidenedBridgeCandidates } from "./CounterfactualCandidateInjection";
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000; // fiveByFiveEdgeRecovery.ts's own private constant, reproduced (see FailureTaxonomy.ts's own disclosure)
const BRIDGE_SUB_BUDGET_MS = 300;

interface ArmResult {
  finalWrong: number;
  runtimeMs: number;
  bridgeCandidateCount: number;
  finalMoves: Move[];
}

function runArm(cubies: Cubie[], lib: WingLibrary, bridgeCandidates: { moves: Move[] }[], deadline: number): ArmResult {
  const start = Date.now();
  let best: { moves: Move[]; wrong: number } | null = null;
  const tryList = bridgeCandidates.length > 0 ? bridgeCandidates : [{ moves: [] }];

  for (const bridge of tryList) {
    if (Date.now() > deadline) break;
    const afterBridge = cloneCubies(cubies);
    if (bridge.moves.length) applySeq(afterBridge, bridge.moves);
    const traversal = traverseAllCycles(afterBridge, lib, deadline);
    const traversalMoves = traversal.moves ?? [];
    const afterTraversal = cloneCubies(afterBridge);
    if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
    const cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
    const finalState = cloneCubies(afterTraversal);
    if (cleanupMoves.length) applySeq(finalState, cleanupMoves);
    const wrong = wrongWingCount5(finalState);
    if (!best || wrong < best.wrong) best = { moves: [...bridge.moves, ...traversalMoves, ...cleanupMoves], wrong };
  }

  const runtimeMs = Date.now() - start;
  if (!best || best.moves.length === 0) {
    return { finalWrong: wrongWingCount5(cubies), runtimeMs, bridgeCandidateCount: bridgeCandidates.length, finalMoves: [] };
  }
  const afterState = cloneCubies(cubies);
  applySeq(afterState, best.moves);
  const validation = validateDeferred(cubies, afterState);
  if (!validation.accepted) {
    return { finalWrong: wrongWingCount5(cubies), runtimeMs, bridgeCandidateCount: bridgeCandidates.length, finalMoves: [] };
  }
  return { finalWrong: best.wrong, runtimeMs, bridgeCandidateCount: bridgeCandidates.length, finalMoves: best.moves };
}

export interface BenchmarkCaseResult {
  label: string;
  startingWrong: number;
  baseline: { finalWrong: number; improved: boolean; regression: boolean };
  current: ArmResult & { improved: boolean; regression: boolean };
  injected: ArmResult & { improved: boolean; regression: boolean };
}

export function benchmarkCase(hole: HoleCase, lib: WingLibrary): BenchmarkCaseResult {
  const startingWrong = wrongWingCount5(hole.cubies);
  const components = detectComponents(hole.cubies);

  const currentDeadline = Date.now() + PARITY_GATED_CYCLE_RESERVED_SLICE_MS;
  const currentBridges = generateBridgeCandidates(hole.cubies, components, Math.min(currentDeadline, Date.now() + BRIDGE_SUB_BUDGET_MS), "largestTwo");
  const current = runArm(hole.cubies, lib, currentBridges, currentDeadline);

  const injectedDeadline = Date.now() + PARITY_GATED_CYCLE_RESERVED_SLICE_MS;
  const injectedBridges = injectWidenedBridgeCandidates(hole.cubies, components, injectedDeadline, "largestTwo");
  const injected = runArm(hole.cubies, lib, injectedBridges, injectedDeadline);

  return {
    label: hole.label,
    startingWrong,
    baseline: { finalWrong: startingWrong, improved: false, regression: false },
    current: { ...current, improved: current.finalWrong < startingWrong, regression: current.finalWrong > startingWrong },
    injected: { ...injected, improved: injected.finalWrong < startingWrong, regression: injected.finalWrong > startingWrong },
  };
}

export interface BenchmarkSummary {
  n: number;
  currentImprovedCount: number;
  currentRegressionCount: number;
  injectedImprovedCount: number;
  injectedRegressionCount: number;
  currentAvgRuntimeMs: number;
  injectedAvgRuntimeMs: number;
  currentAvgTraversalCount: number;
  injectedAvgTraversalCount: number;
  improvedCountDiffStats: SampleStats; // paired-diff: injected.improved(0/1) - current.improved(0/1), per case
  improvedCountDiffEffectSize: EffectSizeResult;
}

export function summarizeBenchmark(perCase: readonly BenchmarkCaseResult[]): BenchmarkSummary {
  const n = perCase.length;
  const sum = (f: (c: BenchmarkCaseResult) => number) => perCase.reduce((s, c) => s + f(c), 0);
  const diffs = perCase.map((c) => (c.injected.improved ? 1 : 0) - (c.current.improved ? 1 : 0));
  const diffStats = computeStats(diffs);
  const effectSize = analyzeEffectSize({ meanDiff: diffStats.mean, stddevDiff: diffStats.stddev, n: diffStats.n });

  return {
    n,
    currentImprovedCount: perCase.filter((c) => c.current.improved).length,
    currentRegressionCount: perCase.filter((c) => c.current.regression).length,
    injectedImprovedCount: perCase.filter((c) => c.injected.improved).length,
    injectedRegressionCount: perCase.filter((c) => c.injected.regression).length,
    currentAvgRuntimeMs: n > 0 ? sum((c) => c.current.runtimeMs) / n : 0,
    injectedAvgRuntimeMs: n > 0 ? sum((c) => c.injected.runtimeMs) / n : 0,
    currentAvgTraversalCount: n > 0 ? sum((c) => c.current.bridgeCandidateCount) / n : 0,
    injectedAvgTraversalCount: n > 0 ? sum((c) => c.injected.bridgeCandidateCount) / n : 0,
    improvedCountDiffStats: diffStats,
    improvedCountDiffEffectSize: effectSize,
  };
}
