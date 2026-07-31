// --- MultiComponentMergePrototype (Parity-Gated Cycle Comparative
// Prototype Sprint v1, STEP2) --------------------------------------------------
// Real implementation. Reuses detectComponents (ComponentDetection.ts),
// generateBridgeCandidates (BridgeCandidateGeneration.ts) UNMODIFIED and
// repeatedly -- only the "iterate across more than 2 components"
// orchestration is new Primitive logic (Alternative Blueprint Sprint
// v1's own STEP3 feasibility note: "Recovery: low -- largestTwo/
// smallestTwo 전략 선택 부분만 다중 컴포넌트 선택으로 확장"). Reuses
// traverseAllCycles/bestEffortCleanup/validateDeferred exactly like
// DualWingBridgePrototype.ts and the real production genParityGatedCycle().
//
// Mechanism: when componentCount > 2, sequentially bridge the current
// two largest components, re-detect components on the result, and
// repeat -- targeting the actual >2-component population this Sprint's
// prior Blueprint work identified (14.6% of real failures). When
// componentCount === 2, there is nothing extra for this mechanism to
// contribute, so it falls back to the SAME single-bridge behavior the
// current Primitive already uses (via generateBridgeCandidates directly)
// -- this keeps the 3-arm Benchmark fair across the full Hole Dataset,
// not just the >2-component subset.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";

const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000; // fiveByFiveEdgeRecovery.ts's own private constant, reproduced
const BRIDGE_SUB_BUDGET_MS = 300;
const MAX_SEQUENTIAL_MERGES = 4; // bounded -- never more merge steps than a 5-component worst case would need

export interface MultiComponentMergeResult {
  componentCountBefore: number;
  componentCountAfter: number; // after all sequential merge attempts, before traversal
  mergeStepsAttempted: number;
  mergeStepsSucceeded: number;
  moves: Move[] | null;
}

export function tryMultiComponentMerge(cubies: Cubie[], deadline: number): MultiComponentMergeResult {
  const initialComponents = detectComponents(cubies);
  const componentCountBefore = initialComponents.components.length;
  if (componentCountBefore < 2) {
    return { componentCountBefore, componentCountAfter: componentCountBefore, mergeStepsAttempted: 0, mergeStepsSucceeded: 0, moves: null };
  }

  let working = cloneCubies(cubies);
  const allMoves: Move[] = [];
  let mergeStepsAttempted = 0;
  let mergeStepsSucceeded = 0;
  let currentComponents = initialComponents;

  while (currentComponents.components.length >= 2 && mergeStepsAttempted < MAX_SEQUENTIAL_MERGES && Date.now() < deadline) {
    mergeStepsAttempted++;
    const bridgeDeadline = Math.min(deadline, Date.now() + BRIDGE_SUB_BUDGET_MS);
    const candidates = generateBridgeCandidates(working, currentComponents, bridgeDeadline, "largestTwo");
    if (candidates.length === 0) break;

    let best: { moves: Move[]; componentCountAfter: number } | null = null;
    for (const c of candidates) {
      if (!best || c.componentCountAfter < best.componentCountAfter) best = { moves: c.moves, componentCountAfter: c.componentCountAfter };
    }
    if (!best) break;

    applySeq(working, best.moves);
    allMoves.push(...best.moves);
    mergeStepsSucceeded++;
    currentComponents = detectComponents(working);

    // componentCount==2 case: this mechanism has nothing extra to
    // contribute beyond the single bridge the current Primitive already
    // performs -- stop after one step so the 3-arm Benchmark's fallback
    // behavior matches the baseline single-bridge mechanism exactly.
    if (componentCountBefore === 2) break;
  }

  return {
    componentCountBefore,
    componentCountAfter: currentComponents.components.length,
    mergeStepsAttempted,
    mergeStepsSucceeded,
    moves: allMoves.length > 0 ? allMoves : null,
  };
}

export interface MultiComponentMergePipelineResult {
  finalMoves: Move[] | null;
  finalWrong: number;
  runtimeMs: number;
  componentCountBefore: number;
  componentCountAfter: number;
  mergeStepsAttempted: number;
  mergeStepsSucceeded: number;
  traversalLeavesExplored: number;
}

export function runMultiComponentMergePipeline(cubies: Cubie[], lib: WingLibrary): MultiComponentMergePipelineResult {
  const start = Date.now();
  const deadline = start + PARITY_GATED_CYCLE_RESERVED_SLICE_MS;
  const startingWrong = wrongWingCount5(cubies);

  const merge = tryMultiComponentMerge(cubies, deadline);
  if (merge.componentCountBefore < 2) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs: Date.now() - start, componentCountBefore: merge.componentCountBefore, componentCountAfter: merge.componentCountAfter, mergeStepsAttempted: 0, mergeStepsSucceeded: 0, traversalLeavesExplored: 0 };
  }

  const afterMerge = cloneCubies(cubies);
  if (merge.moves && merge.moves.length) applySeq(afterMerge, merge.moves);

  const traversal = traverseAllCycles(afterMerge, lib, deadline);
  const traversalMoves = traversal.moves ?? [];
  const afterTraversal = cloneCubies(afterMerge);
  if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
  const cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
  const finalState = cloneCubies(afterTraversal);
  if (cleanupMoves.length) applySeq(finalState, cleanupMoves);

  const combinedMoves = [...(merge.moves ?? []), ...traversalMoves, ...cleanupMoves];
  const runtimeMs = Date.now() - start;

  if (combinedMoves.length === 0) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs, componentCountBefore: merge.componentCountBefore, componentCountAfter: merge.componentCountAfter, mergeStepsAttempted: merge.mergeStepsAttempted, mergeStepsSucceeded: merge.mergeStepsSucceeded, traversalLeavesExplored: traversal.leavesExplored };
  }

  const afterAll = cloneCubies(cubies);
  applySeq(afterAll, combinedMoves);
  const validation = validateDeferred(cubies, afterAll);
  if (!validation.accepted) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs, componentCountBefore: merge.componentCountBefore, componentCountAfter: merge.componentCountAfter, mergeStepsAttempted: merge.mergeStepsAttempted, mergeStepsSucceeded: merge.mergeStepsSucceeded, traversalLeavesExplored: traversal.leavesExplored };
  }

  return {
    finalMoves: combinedMoves,
    finalWrong: wrongWingCount5(afterAll),
    runtimeMs,
    traversalLeavesExplored: traversal.leavesExplored,
    componentCountBefore: merge.componentCountBefore,
    componentCountAfter: merge.componentCountAfter,
    mergeStepsAttempted: merge.mergeStepsAttempted,
    mergeStepsSucceeded: merge.mergeStepsSucceeded,
  };
}
