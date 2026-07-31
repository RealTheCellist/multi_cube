// --- TraversalAnalysis (Parity-Gated Cycle Primitive Prototype
// Refinement Sprint v1, STEP3) -------------------------------------------------
// resolveBoundedMultiCycle() (solverV2Prototype/BoundedResolver.ts,
// unmodified, exported) only returns { moves, leavesExplored, cycleLength
// }, not the per-hop depth/branch-factor/abandoned-node detail this Sprint
// needs. This file is a disclosed duplicate of that function's own DFS --
// same real search functions (enumerateWingCandidates, wrongWingCount5,
// wrongWings5, slotKey from fiveByFiveEdges.ts; pairCountOf from
// GoalAnalyzer.ts; validateDeferred, cited not re-exported here per this
// Sprint's own protected-file list -- see driver for the one place it is
// imported), same bounded constants (MAX_CANDIDATES_PER_HOP,
// MAX_LEAVES_EXPLORED, both exported from BoundedResolver.ts), same
// PER_HOP_DEADLINE_MS(60ms) -- only instrumentation counters are added.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { MAX_CANDIDATES_PER_HOP, MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";

const PER_HOP_DEADLINE_MS = 60; // BoundedResolver.ts's own private constant, reproduced

export interface TraversalInstrumentedResult {
  cycleCount: number; // number of disjoint cycles in the WANTS graph BEFORE concatenation
  cycleLengths: number[];
  totalNodes: number; // sum of cycleLengths -- what traverseAllCycles() actually feeds resolveBoundedMultiCycle
  leavesExplored: number;
  maxDepthReached: number; // deepest hopIndex any explored branch actually visited
  avgBranchFactorObserved: number; // avg candidates.length actually returned by enumerateWingCandidates() per hop visited (capped at MAX_CANDIDATES_PER_HOP by construction)
  abandonedBranchCount: number; // hops where the overall deadline/leaf-cap was already hit before any candidate could be tried
  hitLeafCap: boolean; // leavesExplored reached MAX_LEAVES_EXPLORED
  hitDeadline: boolean; // Date.now() > deadline was observed during the search
  improvingLeafFound: boolean; // best leaf's own wrongWingCount < the starting wrongWingCount
  moves: Move[] | null; // best leaf's moves, PRE-validateDeferred (that gate is applied by the caller, not here)
}

export function analyzeTraversal(cubies: Cubie[], lib: WingLibrary, deadline: number): TraversalInstrumentedResult {
  const graph = buildStateGraph(cubies);
  const sortedCycles = [...graph.cycles].sort((a, b) => b.length - a.length);
  const cycleNodes = sortedCycles.flat();
  const cycleLengths = sortedCycles.map((c) => c.length);
  const startingWrongWingCount = wrongWingCount5(cubies);

  if (cycleNodes.length === 0) {
    return {
      cycleCount: 0,
      cycleLengths: [],
      totalNodes: 0,
      leavesExplored: 0,
      maxDepthReached: 0,
      avgBranchFactorObserved: 0,
      abandonedBranchCount: 0,
      hitLeafCap: false,
      hitDeadline: false,
      improvingLeafFound: false,
      moves: null,
    };
  }

  let leavesExplored = 0;
  let maxDepthReached = 0;
  let abandonedBranchCount = 0;
  let hitDeadline = false;
  const branchFactorsObserved: number[] = [];

  interface Leaf {
    moves: Move[];
    cubies: Cubie[];
    wrongWing: number;
  }
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[]): void {
    leavesExplored++;
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working, wrongWing };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (hopIndex > maxDepthReached) maxDepthReached = hopIndex;
    if (Date.now() > deadline) {
      hitDeadline = true;
      return;
    }
    if (leavesExplored >= MAX_LEAVES_EXPLORED) return;
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
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP);
    branchFactorsObserved.push(candidates.length);
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
    if (!anyBranchTried) {
      abandonedBranchCount++;
      considerLeaf(movesSoFar, working);
    }
  }

  dfs(cloneCubies(cubies), [], 0);

  const avgBranchFactorObserved = branchFactorsObserved.length > 0 ? branchFactorsObserved.reduce((s, v) => s + v, 0) / branchFactorsObserved.length : 0;
  const improvingLeafFound = best !== null && (best as Leaf).wrongWing < startingWrongWingCount;

  return {
    cycleCount: sortedCycles.length,
    cycleLengths,
    totalNodes: cycleNodes.length,
    leavesExplored,
    maxDepthReached,
    avgBranchFactorObserved,
    abandonedBranchCount,
    hitLeafCap: leavesExplored >= MAX_LEAVES_EXPLORED,
    hitDeadline,
    improvingLeafFound,
    moves: best ? (best as Leaf).moves : null,
  };
}
