// --- CrossComponentBridgeCycleResolver (Parity-Gated Cycle Prototype
// Sprint v1, STEP1 top-level entry point) ------------------------------------
// Wires the Blueprint's own STEP1 order exactly: component 탐색 -> bridge
// 후보 생성 -> temporary bridge 적용 -> multi-cycle traversal -> bridge
// 제거. Configurable (ResolverConfig) so STEP4's Ablation can reuse this
// SAME function with individual steps toggled off, rather than duplicating
// the pipeline -- matching this arc's own established "one parameterized
// function, not N copies" convention (GateSweepSimulator.ts etc).
//
// Gate: Candidate A's own declared precondition (componentCount>1 AND
// cycleCount>=2 AND conflictEdgeCount===0), cited from
// parityGatedCycleBlueprintV1/BlueprintCandidates.ts's CANDIDATE_A (not
// imported directly -- that Gate is typed against StructuralFeatureSetV4,
// a different feature-object shape than the recoveryNecessity/
// StructuralFeatures.ts's RecoveryNecessityFeatures this file uses for a
// direct cubies-based check, matching every Gate-check module this arc's
// Refinement Sprints have already written, e.g. bridgeInjectionRefinementV1/
// GateSweepSimulator.ts's own checkGate()). Same three named conditions,
// same thresholds -- reimplemented against a differently-shaped feature
// object, not a differently-defined Gate.
//
// Only ONE Deferred Validation gate at the very end (validateDeferred,
// unmodified) -- matching every other Primitive's own contract: the whole
// sequence (bridge+traversal+cleanup) is returned only if it net-improves
// wrongWingCount, exactly like BoundedResolver/CCR/MultiHopBridge/
// ConflictDominantSacrifice all already require.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { detectComponents } from "./ComponentDetection";
import { generateBridgeCandidates, type ComponentSelectionStrategy } from "./BridgeCandidateGeneration";
import { traverseAllCycles } from "./MultiCycleTraversal";
import { bestEffortCleanup } from "./BridgeRemoval";

export interface ResolverConfig {
  label: string;
  useBridge: boolean; // STEP4 ablation axis: "Bridge 생성 제거"
  useTraversal: boolean; // STEP4 ablation axis: "Traversal 제거"
  useCleanup: boolean; // STEP4 ablation axis: "Bridge Removal 제거"
  componentSelectionStrategy: ComponentSelectionStrategy; // STEP4 ablation axis: "Component 선택 변경"
}

export const FULL_CONFIG: ResolverConfig = { label: "full(all steps)", useBridge: true, useTraversal: true, useCleanup: true, componentSelectionStrategy: "largestTwo" };

const BRIDGE_CANDIDATE_BUDGET_MS = 300;

export interface CrossComponentBridgeResult {
  gateMatched: boolean;
  moves: Move[] | null;
  bridgeUsed: boolean;
  leavesExplored: number;
}

function checkGate(cubies: Cubie[]): boolean {
  const f = computeStructuralFeatures(cubies, "gate-check");
  return f.componentCount > 1 && f.cycleCount >= 2 && f.conflictEdgeCount === 0;
}

export function tryCrossComponentBridgeCycleResolverConfigured(cubies: Cubie[], lib: WingLibrary, deadline: number, config: ResolverConfig): CrossComponentBridgeResult {
  if (!checkGate(cubies)) return { gateMatched: false, moves: null, bridgeUsed: false, leavesExplored: 0 };

  let bridgeCandidates: { moves: Move[] }[] = [{ moves: [] }]; // "no bridge" ablation: exactly one candidate, the empty bridge

  if (config.useBridge) {
    const components = detectComponents(cubies);
    const bridgeDeadline = Math.min(deadline, Date.now() + BRIDGE_CANDIDATE_BUDGET_MS);
    const generated = generateBridgeCandidates(cubies, components, bridgeDeadline, config.componentSelectionStrategy);
    if (generated.length > 0) bridgeCandidates = generated;
  }

  let best: { moves: Move[]; cubies: Cubie[] } | null = null;
  let bestWrongWing = Infinity;
  let totalLeaves = 0;

  for (const bridge of bridgeCandidates) {
    if (Date.now() > deadline) break;
    const afterBridge = cloneCubies(cubies);
    if (bridge.moves.length) applySeq(afterBridge, bridge.moves);

    let traversalMoves: Move[] = [];
    if (config.useTraversal) {
      const traversal = traverseAllCycles(afterBridge, lib, deadline);
      totalLeaves += traversal.leavesExplored;
      if (traversal.moves) traversalMoves = traversal.moves;
    }
    const afterTraversal = cloneCubies(afterBridge);
    if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);

    let cleanupMoves: Move[] = [];
    if (config.useCleanup) {
      cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
    }
    const finalState = cloneCubies(afterTraversal);
    if (cleanupMoves.length) applySeq(finalState, cleanupMoves);

    const wrongWingAfter = wrongWingCount5(finalState);
    if (wrongWingAfter < bestWrongWing) {
      bestWrongWing = wrongWingAfter;
      best = { moves: [...bridge.moves, ...traversalMoves, ...cleanupMoves], cubies: finalState };
    }
  }

  if (!best || best.moves.length === 0) return { gateMatched: true, moves: null, bridgeUsed: false, leavesExplored: totalLeaves };
  const validation = validateDeferred(cubies, best.cubies);
  const bridgeUsed = best.moves.length > 0 && bridgeCandidates.some((b) => b.moves.length > 0);
  return { gateMatched: true, moves: validation.accepted ? best.moves : null, bridgeUsed, leavesExplored: totalLeaves };
}

export function tryCrossComponentBridgeCycleResolver(cubies: Cubie[], lib: WingLibrary, deadline: number): CrossComponentBridgeResult {
  return tryCrossComponentBridgeCycleResolverConfigured(cubies, lib, deadline, FULL_CONFIG);
}
