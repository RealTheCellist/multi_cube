// --- DualWingBridgePrototype (Parity-Gated Cycle Comparative Prototype
// Sprint v1, STEP1) -----------------------------------------------------------
// Real implementation (not design-only, unlike the prior Blueprint
// Sprint). Reuses the existing Primitive building blocks unmodified:
// detectComponents (ComponentDetection.ts), bfsMoveWingToPosition/
// wrongWings5/slotKey/toLiteEdges (fiveByFiveEdges.ts), traverseAllCycles
// (MultiCycleTraversal.ts), bestEffortCleanup (BridgeRemoval.ts),
// validateDeferred (solverV2Prototype/DeferredValidator.ts, protected --
// cited, never modified). No new Scheduler is introduced.
//
// Mechanism (Alternative Blueprint Sprint v1's own STEP2 description):
// instead of relocating ONE wrong wing between the two largest
// components, find TWO independent single-wing relocations -- forward
// (a wrong wing in compX -> a slot in compY) and backward (a wrong wing
// in compY -> a slot in compX) -- combine them into ONE move sequence,
// and check whether the COMBINED sequence merges the components even
// when neither move alone would (each direction's own raw BFS search is
// a disclosed duplicate of BridgeCandidateGeneration.ts's private
// `candidatesForDirection`, reused verbatim from the prior Sprint's own
// CandidateGenerationAudit.ts pattern -- only returning the found paths
// themselves here, not yet merge-filtered).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, bfsMoveWingToPosition, slotKey, toLiteEdges, wrongWings5, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { detectComponents, type ComponentInfo } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { MAX_SOURCE_WINGS_TRIED, MAX_TARGET_SLOTS_TRIED, BRIDGE_BFS_MAX_DEPTH, BRIDGE_BFS_PER_CANDIDATE_MS } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";

const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000; // fiveByFiveEdgeRecovery.ts's own private constant, reproduced (matches this arc's established Budget Contract)
const MAX_PAIRS_TO_TRY = 3; // bounded: try up to 3 forward x 3 backward combined pairs, not the full 5x5 combinatorial space

// Verbatim reimplementation of BridgeCandidateGeneration.ts's own private
// `targetedComponentsMerged` -- see that file for the original.
function targetedComponentsMerged(after: Cubie[], compSource: string[], compTarget: string[]): boolean {
  const { componentOfSlot } = detectComponents(after);
  const targetedSlots = [...compSource, ...compTarget].filter((slot) => componentOfSlot.has(slot));
  if (targetedSlots.length === 0) return false;
  const firstComponent = componentOfSlot.get(targetedSlots[0]);
  return targetedSlots.every((slot) => componentOfSlot.get(slot) === firstComponent);
}

// Disclosed duplicate of BridgeCandidateGeneration.ts's private
// `candidatesForDirection`, but returns the RAW found move sequences
// (bounded to MAX_PAIRS_TO_TRY) regardless of whether they alone merge
// anything -- Dual Wing Bridge needs the raw paths to combine with the
// opposite direction's own raw paths.
function findRawBridgeMoves(cubies: Cubie[], compSource: string[], compTarget: string[], deadline: number): Move[][] {
  const wrong = wrongWings5(cubies);
  const sourceCandidates = wrong.filter((w) => compSource.includes(slotKey(w))).slice(0, MAX_SOURCE_WINGS_TRIED);
  const targetSlotWings = wrong.filter((w) => compTarget.includes(slotKey(w)));
  const seenTargetSlots = new Set<string>();
  const targetWingsBySlot: Cubie[] = [];
  for (const w of targetSlotWings) {
    const key = slotKey(w);
    if (seenTargetSlots.has(key)) continue;
    seenTargetSlots.add(key);
    targetWingsBySlot.push(w);
    if (targetWingsBySlot.length >= MAX_TARGET_SLOTS_TRIED) break;
  }

  const found: Move[][] = [];
  for (const source of sourceCandidates) {
    for (const targetWing of targetWingsBySlot) {
      if (Date.now() > deadline || found.length >= MAX_PAIRS_TO_TRY) return found;
      const edges = toLiteEdges(cubies);
      const targetEdge = edges.find((e) => e.id === targetWing.id);
      if (!targetEdge) continue;
      const targetPosKey = `${targetEdge.x},${targetEdge.y},${targetEdge.z}`;
      const bfsDeadline = Math.min(deadline, Date.now() + BRIDGE_BFS_PER_CANDIDATE_MS);
      const path = bfsMoveWingToPosition(edges, source.id, targetPosKey, BRIDGE_BFS_MAX_DEPTH, undefined, bfsDeadline);
      if (path && path.length > 0) found.push(path);
    }
  }
  return found;
}

export interface DualWingBridgeResult {
  candidateCount: number; // total raw forward+backward move sequences found (before combining/checking merge)
  bridgeGeneratedCount: number; // number of combined forward+backward PAIRS actually checked for merge
  mergeSuccess: boolean;
  moves: Move[] | null; // the winning bridge moves, pre-traversal (null if no combined pair merges)
}

export function tryDualWingBridge(cubies: Cubie[], components: ComponentInfo, deadline: number): DualWingBridgeResult {
  const bySize = [...components.components].sort((a, b) => b.length - a.length);
  if (bySize.length < 2) return { candidateCount: 0, bridgeGeneratedCount: 0, mergeSuccess: false, moves: null };
  const [compX, compY] = bySize;

  const forwardMoves = findRawBridgeMoves(cubies, compX, compY, deadline);
  const backwardMoves = findRawBridgeMoves(cubies, compY, compX, deadline);
  const candidateCount = forwardMoves.length + backwardMoves.length;

  let bridgeGeneratedCount = 0;
  let best: Move[] | null = null;
  let bestWrong = Infinity;

  for (const fwd of forwardMoves) {
    for (const bwd of backwardMoves) {
      if (Date.now() > deadline) break;
      bridgeGeneratedCount++;
      const combined = [...fwd, ...bwd];
      const after = cloneCubies(cubies);
      applySeq(after, combined);
      if (targetedComponentsMerged(after, compX, compY)) {
        const wrong = wrongWingCount5(after);
        if (wrong < bestWrong) {
          best = combined;
          bestWrong = wrong;
        }
      }
    }
  }

  return { candidateCount, bridgeGeneratedCount, mergeSuccess: best !== null, moves: best };
}

export interface DualWingBridgePipelineResult {
  finalMoves: Move[] | null;
  finalWrong: number;
  runtimeMs: number;
  candidateCount: number;
  bridgeGeneratedCount: number;
  mergeSuccess: boolean;
  traversalLeavesExplored: number;
}

// Full Primitive contract: Dual Wing Bridge -> Traversal -> Cleanup ->
// Final Validation, matching genParityGatedCycle()'s own composition
// (fiveByFiveEdgeRecovery.ts, cited not modified).
export function runDualWingBridgePipeline(cubies: Cubie[], lib: WingLibrary): DualWingBridgePipelineResult {
  const start = Date.now();
  const deadline = start + PARITY_GATED_CYCLE_RESERVED_SLICE_MS;
  const startingWrong = wrongWingCount5(cubies);
  const components = detectComponents(cubies);

  if (components.components.length < 2) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs: Date.now() - start, candidateCount: 0, bridgeGeneratedCount: 0, mergeSuccess: false, traversalLeavesExplored: 0 };
  }

  const bridgeDeadline = Math.min(deadline, Date.now() + 300);
  const bridge = tryDualWingBridge(cubies, components, bridgeDeadline);

  const afterBridge = cloneCubies(cubies);
  if (bridge.moves && bridge.moves.length) applySeq(afterBridge, bridge.moves);

  const traversal = traverseAllCycles(afterBridge, lib, deadline);
  const traversalMoves = traversal.moves ?? [];
  const afterTraversal = cloneCubies(afterBridge);
  if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
  const cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
  const finalState = cloneCubies(afterTraversal);
  if (cleanupMoves.length) applySeq(finalState, cleanupMoves);

  const combinedMoves = [...(bridge.moves ?? []), ...traversalMoves, ...cleanupMoves];
  const runtimeMs = Date.now() - start;

  if (combinedMoves.length === 0) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs, candidateCount: bridge.candidateCount, bridgeGeneratedCount: bridge.bridgeGeneratedCount, mergeSuccess: bridge.mergeSuccess, traversalLeavesExplored: traversal.leavesExplored };
  }

  const afterAll = cloneCubies(cubies);
  applySeq(afterAll, combinedMoves);
  const validation = validateDeferred(cubies, afterAll);
  if (!validation.accepted) {
    return { finalMoves: null, finalWrong: startingWrong, runtimeMs, candidateCount: bridge.candidateCount, bridgeGeneratedCount: bridge.bridgeGeneratedCount, mergeSuccess: bridge.mergeSuccess, traversalLeavesExplored: traversal.leavesExplored };
  }

  return { finalMoves: combinedMoves, finalWrong: wrongWingCount5(afterAll), runtimeMs, candidateCount: bridge.candidateCount, bridgeGeneratedCount: bridge.bridgeGeneratedCount, mergeSuccess: bridge.mergeSuccess, traversalLeavesExplored: traversal.leavesExplored };
}
