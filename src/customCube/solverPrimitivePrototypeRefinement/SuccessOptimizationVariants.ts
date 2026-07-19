// --- SuccessOptimizationVariants (Solver Primitive Prototype Refinement
// Sprint v1) -- STEP2 (Strategy B -- Success Optimization): keeps v3's
// EXACT confirmed gate (cycleLength 2~3 AND conflictEdgeCount>0,
// MultiHopBridgePrototypeV3.ts, UNMODIFIED) fixed, and instead varies the
// bounded DFS's own internal search behavior -- per-hop candidate budget
// and candidate ordering -- to see whether Gate-internal Success Rate can
// rise without touching which replays are attempted. Independently
// reimplements the DFS (same disclosed pattern MultiHopBridgePrototypeV3.ts
// itself used relative to BoundedResolver.ts) so ordering/budget can be
// parametrized; reuses enumerateWingCandidates/applySeq/wrongWingCount5/
// pairCountOf/validateDeferred (all EXISTING exports, unmodified) exactly
// like v3.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { countConflictEdges, MIN_BRIDGE_CYCLE_LENGTH, MAX_BRIDGE_CYCLE_LENGTH } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";

// Mirrors MultiHopBridgePrototypeV3.ts's own redeclaration of
// BoundedResolver.ts's unexported PER_HOP_DEADLINE_MS=60 (that file
// doesn't export it either).
const PER_HOP_DEADLINE_MS = 60;

export interface SearchOptions {
  maxCandidatesPerHop: number;
  reorderByImmediateImprovement: boolean;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export interface ParametrizedSearchResult {
  moves: Move[] | null;
  leavesExplored: number;
  netImprovingLeaves: number;
  deferredRejected: boolean;
}

export function runParametrizedSearch(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number, options: SearchOptions): ParametrizedSearchResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let leavesExplored = 0;
  let netImprovingLeaves = 0;
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[]): void {
    leavesExplored++;
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    if (wrongWing < wrongWingBefore) netImprovingLeaves++;
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) return;
    if (hopIndex >= cycleNodes.length) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const slot = cycleNodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1);
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    let candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, options.maxCandidatesPerHop);

    if (options.reorderByImmediateImprovement && candidates.length > 1) {
      const before = wrongWingCount5(working);
      const scored = candidates.map((c) => {
        const trial = cloneCubies(working);
        applySeq(trial, c);
        return { c, improvement: before - wrongWingCount5(trial) };
      });
      scored.sort((a, b) => b.improvement - a.improvement);
      candidates = scored.map((s) => s.c);
    }

    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working);
      return;
    }

    let anyBranchTried = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) break;
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working);
  }

  dfs(cloneCubies(cubies), [], 0);

  let moves: Move[] | null = null;
  let deferredRejected = false;
  if (best) {
    const validation = validateDeferred(cubies, (best as Leaf).cubies);
    if (validation.accepted) moves = (best as Leaf).moves;
    else deferredRejected = true;
  }

  return { moves, leavesExplored, netImprovingLeaves, deferredRejected };
}

export interface SuccessVariant {
  name: string;
  options: SearchOptions;
}

export const SUCCESS_VARIANTS: SuccessVariant[] = [
  { name: "B0_baseline (maxCandidatesPerHop=2, enumerateWingCandidates 순서 그대로)", options: { maxCandidatesPerHop: 2, reorderByImmediateImprovement: false } },
  { name: "B1_reordered (maxCandidatesPerHop=2, 즉시 wrongWing 개선량 내림차순 정렬)", options: { maxCandidatesPerHop: 2, reorderByImmediateImprovement: true } },
  { name: "B2_widerHop (maxCandidatesPerHop=3, 순서 그대로)", options: { maxCandidatesPerHop: 3, reorderByImmediateImprovement: false } },
  { name: "B3_widerReordered (maxCandidatesPerHop=3, 즉시 개선량 내림차순 정렬)", options: { maxCandidatesPerHop: 3, reorderByImmediateImprovement: true } },
];

export interface SuccessVariantRunResult {
  matched: boolean;
  moves: Move[] | null;
  leavesExplored: number;
  netImprovingLeaves: number;
  netImprovingLeafRatio: number;
  deferredRejected: boolean;
}

// Applies v3's EXACT confirmed gate (cycleLength 2~3 AND conflictEdgeCount>0)
// -- only the internal search behavior (options) varies between
// SUCCESS_VARIANTS.
export function runSuccessVariant(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: SuccessVariant): SuccessVariantRunResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null, leavesExplored: 0, netImprovingLeaves: 0, netImprovingLeafRatio: 0, deferredRejected: false };
  if (analysis.cycleLength < MIN_BRIDGE_CYCLE_LENGTH || analysis.cycleLength > MAX_BRIDGE_CYCLE_LENGTH) {
    return { matched: false, moves: null, leavesExplored: 0, netImprovingLeaves: 0, netImprovingLeafRatio: 0, deferredRejected: false };
  }
  if (countConflictEdges(cubies) === 0) {
    return { matched: false, moves: null, leavesExplored: 0, netImprovingLeaves: 0, netImprovingLeafRatio: 0, deferredRejected: false };
  }

  const result = runParametrizedSearch(cubies, analysis.cycleNodes, lib, deadline, variant.options);
  return {
    matched: true,
    moves: result.moves,
    leavesExplored: result.leavesExplored,
    netImprovingLeaves: result.netImprovingLeaves,
    netImprovingLeafRatio: result.leavesExplored ? result.netImprovingLeaves / result.leavesExplored : 0,
    deferredRejected: result.deferredRejected,
  };
}
