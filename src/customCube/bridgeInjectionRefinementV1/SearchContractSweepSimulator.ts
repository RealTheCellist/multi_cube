// --- SearchContractSweepSimulator (Solver Primitive Refinement Sprint #1
// -- Bridge Injection Refinement Sprint v1, STEP3) ---------------------------
// solverV2Prototype/BoundedResolver.ts's own MAX_CANDIDATES_PER_HOP(=2),
// MAX_LEAVES_EXPLORED(=64), and PER_HOP_DEADLINE_MS(=60, unexported) are
// hardcoded module-level constants baked into its DFS body, not function
// parameters -- there is no way to sweep them without a parameterized copy.
// This is a disclosed duplicate of resolveBoundedMultiCycle's own DFS body
// (same algorithm: bounded backtracking over analyzeMultiCycle's cycle
// nodes, judged only at the leaf via the SAME unmodified validateDeferred),
// with those three constants plus a candidate-ordering option turned into
// parameters. BoundedResolver.ts itself is never edited.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";

export type CandidateOrdering = "asReturned" | "byPairCountGain";

export interface SearchContractConfig {
  label: string;
  maxCandidatesPerHop: number;
  maxLeavesExplored: number;
  perHopDeadlineMs: number;
  candidateOrdering: CandidateOrdering;
}

// Baseline = BoundedResolver.ts's own real, current production-prototype
// constants, cited exactly.
export const BASELINE_SEARCH_CONTRACT: SearchContractConfig = {
  label: "baseline(BoundedResolver real)",
  maxCandidatesPerHop: 2,
  maxLeavesExplored: 64,
  perHopDeadlineMs: 60,
  candidateOrdering: "asReturned",
};

export interface SearchContractResult {
  label: string;
  moves: Move[] | null;
  leavesExplored: number;
}

function orderCandidates(candidates: Move[][], working: Cubie[], ordering: CandidateOrdering): Move[][] {
  if (ordering === "asReturned") return candidates;
  // byPairCountGain: simulate each candidate, prefer the one leaving the
  // highest pairCount (same tie-break metric considerLeaf already uses at
  // the END of a path, applied here per-hop as an ordering heuristic).
  return [...candidates].sort((a, b) => {
    const wa = cloneCubies(working);
    applySeq(wa, a);
    const wb = cloneCubies(working);
    applySeq(wb, b);
    return pairCountOf(wb) - pairCountOf(wa);
  });
}

export function resolveBoundedMultiCycleConfigured(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number, config: SearchContractConfig): SearchContractResult {
  let leavesExplored = 0;
  let best: { moves: Move[]; cubies: Cubie[] } | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;

  function considerLeaf(moves: Move[], working: Cubie[]): void {
    leavesExplored++;
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline || leavesExplored >= config.maxLeavesExplored) return;
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

    const hopDeadline = Math.min(deadline, Date.now() + config.perHopDeadlineMs);
    const rawCandidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, config.maxCandidatesPerHop);
    const candidates = orderCandidates(rawCandidates, working, config.candidateOrdering);
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working);
      return;
    }

    let anyBranchTried = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline || leavesExplored >= config.maxLeavesExplored) break;
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working);
  }

  dfs(cloneCubies(cubies), [], 0);

  if (!best) return { label: config.label, moves: null, leavesExplored };
  const validation = validateDeferred(cubies, (best as { moves: Move[]; cubies: Cubie[] }).cubies);
  return { label: config.label, moves: validation.accepted ? (best as { moves: Move[]; cubies: Cubie[] }).moves : null, leavesExplored };
}

// Independent single-axis sweep configs.
export const SEARCH_CONTRACT_SWEEP_CONFIGS: SearchContractConfig[] = [
  BASELINE_SEARCH_CONTRACT,
  { ...BASELINE_SEARCH_CONTRACT, label: "maxCandidatesPerHop=1", maxCandidatesPerHop: 1 },
  { ...BASELINE_SEARCH_CONTRACT, label: "maxCandidatesPerHop=3", maxCandidatesPerHop: 3 },
  { ...BASELINE_SEARCH_CONTRACT, label: "maxCandidatesPerHop=4", maxCandidatesPerHop: 4 },
  { ...BASELINE_SEARCH_CONTRACT, label: "maxLeavesExplored=32", maxLeavesExplored: 32 },
  { ...BASELINE_SEARCH_CONTRACT, label: "maxLeavesExplored=128", maxLeavesExplored: 128 },
  { ...BASELINE_SEARCH_CONTRACT, label: "maxLeavesExplored=256", maxLeavesExplored: 256 },
  { ...BASELINE_SEARCH_CONTRACT, label: "perHopDeadlineMs=30", perHopDeadlineMs: 30 },
  { ...BASELINE_SEARCH_CONTRACT, label: "perHopDeadlineMs=120", perHopDeadlineMs: 120 },
  { ...BASELINE_SEARCH_CONTRACT, label: "candidateOrdering=byPairCountGain", candidateOrdering: "byPairCountGain" },
];
