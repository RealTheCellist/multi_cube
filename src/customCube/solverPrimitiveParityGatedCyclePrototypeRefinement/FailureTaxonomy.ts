// --- FailureTaxonomy (Parity-Gated Cycle Primitive Prototype Refinement
// Sprint v1, STEP1) -----------------------------------------------------------
// Re-executes the real, unmodified Primitive pipeline (detectComponents ->
// generateBridgeCandidates -> traverseAllCycles -> bestEffortCleanup ->
// validateDeferred, the SAME composition genParityGatedCycle() itself uses
// in fiveByFiveEdgeRecovery.ts, cited not imported since that function is
// private) on ONLY the 41 real cases the prior Architecture Analysis
// Sprint classified as PRIMITIVE_FAILURE (cases where neither a different
// Scheduler order NOR an unbounded dedicated budget at the real position
// recovered the case -- Budget/Scheduler are already ruled out for this
// exact population), and classifies each into exactly one of:
//
//   CANDIDATE_GENERATION_FAILURE -- generateBridgeCandidates() itself
//     returns 0 candidates; the real production fallback
//     (`bridgeCandidates = [{ moves: [] }]`) then only ever tries a
//     "do-nothing" bridge, so no physical component merge is ever
//     attempted at all.
//   SEARCH_EXHAUSTION -- at least one bridge was tried, but for every
//     bridge tried, resolveBoundedMultiCycle's own DFS was cut short by
//     MAX_LEAVES_EXPLORED (64) or the real deadline before it could
//     finish exploring, and no improving leaf was found in what it did
//     explore -- more search budget MIGHT help.
//   TRAVERSAL_FAILURE -- at least one bridge was tried and its traversal
//     ran to natural completion (neither the leaf cap nor the deadline
//     was hit) without ever finding an improving leaf -- the traversal
//     algorithm itself, not its budget, is the limit for this case.
//   VALIDATION_FAILURE -- the composed bridge+traversal+cleanup pipeline
//     DID produce a non-empty move sequence, but the outer
//     validateDeferred(cubies, afterState) check on the FULL combined
//     sequence rejected it (a stricter, whole-sequence check than the
//     inner per-leaf judgment resolveBoundedMultiCycle already applies).
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import { generateBridgeCandidates } from "../parityGatedCyclePrototypeV1/BridgeCandidateGeneration";
import { traverseAllCycles } from "../parityGatedCyclePrototypeV1/MultiCycleTraversal";
import { bestEffortCleanup } from "../parityGatedCyclePrototypeV1/BridgeRemoval";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

// fiveByFiveEdgeRecovery.ts's own private constants (not exported --
// reproduced here exactly, matching genParityGatedCycle()'s real Budget
// Contract). These 41 cases were already shown (prior Sprint's STEP4
// Dedicated Budget Simulation, "remainingTime" policy) to fail even with
// an unbounded budget at the real position, so this Sprint gives the
// Primitive the SAME real 2000ms/300ms shape but standalone (no
// competition from REPAIR/CCR) -- isolating pure Primitive capability.
const PARITY_GATED_CYCLE_RESERVED_SLICE_MS = 2000;
const BRIDGE_SUB_BUDGET_MS = 300;

export type FailureCategory = "CANDIDATE_GENERATION_FAILURE" | "SEARCH_EXHAUSTION" | "TRAVERSAL_FAILURE" | "VALIDATION_FAILURE";

export interface BridgeTrialResult {
  bridgeIndex: number;
  bridgeMoveCount: number;
  leavesExplored: number;
  cycleLength: number;
  hitSearchCap: boolean;
  hitDeadline: boolean;
  traversalImproved: boolean; // resolveBoundedMultiCycle's own inner leaf judgment found something and its own validateDeferred accepted it
}

export interface FailureCaseResult {
  label: string;
  category: FailureCategory;
  gatePass: boolean;
  bridgeCandidateCount: number;
  bridgeTrials: BridgeTrialResult[];
  finalMoveCount: number;
  finalValidationAccepted: boolean | null; // null if the pipeline never produced a non-empty final sequence to validate
}

export function classifyFailureCase(hole: HoleCase, lib: WingLibrary): FailureCaseResult {
  const cubies = hole.cubies;
  const stats = analyzeConstraints(buildStateGraph(cubies));
  const gatePass = stats.componentCount > 1;

  const start = Date.now();
  const deadline = Math.min(start + PARITY_GATED_CYCLE_RESERVED_SLICE_MS, start + PARITY_GATED_CYCLE_RESERVED_SLICE_MS);
  const components = detectComponents(cubies);
  const bridgeDeadline = Math.min(deadline, Date.now() + BRIDGE_SUB_BUDGET_MS);
  const bridgeCandidates = generateBridgeCandidates(cubies, components, bridgeDeadline, "largestTwo");

  if (bridgeCandidates.length === 0) {
    return { label: hole.label, category: "CANDIDATE_GENERATION_FAILURE", gatePass, bridgeCandidateCount: 0, bridgeTrials: [], finalMoveCount: 0, finalValidationAccepted: null };
  }

  const bridgeTrials: BridgeTrialResult[] = [];
  let best: { moves: Move[]; wrong: number } | null = null;

  bridgeCandidates.forEach((bridge, bridgeIndex) => {
    if (Date.now() > deadline) return;
    const afterBridge = cloneCubies(cubies);
    if (bridge.moves.length) applySeq(afterBridge, bridge.moves);

    const beforeTraversalWrong = wrongWingCount5(afterBridge);
    const traversal = traverseAllCycles(afterBridge, lib, deadline);
    const traversalMoves = traversal.moves ?? [];
    const traversalImproved = traversal.moves !== null;
    const hitSearchCap = traversal.leavesExplored >= MAX_LEAVES_EXPLORED;
    const hitDeadline = Date.now() > deadline;

    const afterTraversal = cloneCubies(afterBridge);
    if (traversalMoves.length) applySeq(afterTraversal, traversalMoves);
    const cleanupMoves = bestEffortCleanup(afterTraversal, lib, deadline);
    const finalState = cloneCubies(afterTraversal);
    if (cleanupMoves.length) applySeq(finalState, cleanupMoves);
    const wrong = wrongWingCount5(finalState);

    bridgeTrials.push({
      bridgeIndex,
      bridgeMoveCount: bridge.moves.length,
      leavesExplored: traversal.leavesExplored,
      cycleLength: traversal.cycleLength,
      hitSearchCap,
      hitDeadline,
      traversalImproved,
    });

    void beforeTraversalWrong;
    if (!best || wrong < best.wrong) best = { moves: [...bridge.moves, ...traversalMoves, ...cleanupMoves], wrong };
  });

  const anyTraversalImproved = bridgeTrials.some((t) => t.traversalImproved);
  if (!anyTraversalImproved) {
    const allExhausted = bridgeTrials.length > 0 && bridgeTrials.every((t) => t.hitSearchCap || t.hitDeadline);
    const category: FailureCategory = allExhausted ? "SEARCH_EXHAUSTION" : "TRAVERSAL_FAILURE";
    const finalMoveCount = best ? (best as { moves: Move[]; wrong: number }).moves.length : 0;
    return { label: hole.label, category, gatePass, bridgeCandidateCount: bridgeCandidates.length, bridgeTrials, finalMoveCount, finalValidationAccepted: null };
  }

  // At least one bridge's traversal genuinely improved -- the composed
  // pipeline produces a real move sequence. The remaining possible
  // failure mode is the OUTER validateDeferred() rejecting the FULL
  // combined sequence even though the inner per-leaf judgment accepted it.
  const finalMoves = best ? (best as { moves: Move[]; wrong: number }).moves : [];
  if (finalMoves.length === 0) {
    return { label: hole.label, category: "TRAVERSAL_FAILURE", gatePass, bridgeCandidateCount: bridgeCandidates.length, bridgeTrials, finalMoveCount: 0, finalValidationAccepted: null };
  }
  const afterState = cloneCubies(cubies);
  applySeq(afterState, finalMoves);
  const validation = validateDeferred(cubies, afterState);
  return {
    label: hole.label,
    category: "VALIDATION_FAILURE",
    gatePass,
    bridgeCandidateCount: bridgeCandidates.length,
    bridgeTrials,
    finalMoveCount: finalMoves.length,
    finalValidationAccepted: validation.accepted,
  };
}

export interface FailureTaxonomyResult {
  totalCases: number;
  counts: Record<FailureCategory, number>;
  percent: Record<FailureCategory, number>;
}

function zeroCounts(): Record<FailureCategory, number> {
  return { CANDIDATE_GENERATION_FAILURE: 0, SEARCH_EXHAUSTION: 0, TRAVERSAL_FAILURE: 0, VALIDATION_FAILURE: 0 };
}

export function buildFailureTaxonomy(holes: readonly HoleCase[], libs: ExecutorLibraries): { perCase: FailureCaseResult[]; summary: FailureTaxonomyResult } {
  const perCase = holes.map((h) => classifyFailureCase(h, libs.lib));
  const counts = zeroCounts();
  for (const r of perCase) counts[r.category]++;
  const percent = zeroCounts();
  for (const cat of Object.keys(counts) as FailureCategory[]) {
    percent[cat] = holes.length > 0 ? (counts[cat] / holes.length) * 100 : 0;
  }
  return { perCase, summary: { totalCases: holes.length, counts, percent } };
}
