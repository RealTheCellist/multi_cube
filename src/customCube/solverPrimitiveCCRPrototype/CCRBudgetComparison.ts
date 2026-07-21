// --- CCRBudgetComparison (CCR Prototype Sprint v1) -------------------------
// STEP3, the core of this Sprint: REPAIR's own 75ms reservedBudget is NOT
// reused as-is (Discovery Sprint #3 measured it as badly budget-starved on
// this denser population). Compares 150/250/500/1000ms candidate budgets
// on the "singleCycle" strategy (isolating the budget's own effect from
// STEP4's separate multi-cycle question), measuring Match Rate, Runtime,
// Deadline-hit rate, Leaves, Nodes -- an instrumented, disclosed
// reimplementation of CCRPrototype.ts's own DFS body with counters added
// (the same measurement-only-instrumentation pattern
// solverPrimitiveDiscovery2/PrimitiveReuseAnalysis.ts already used), so
// CCRPrototype.ts itself stays a clean, uninstrumented Primitive.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { analyzeCcrGate } from "./CCRGate";
import { traversalNodesFor, type CCRStrategy } from "./CCRPrototype";

const PER_HOP_DEADLINE_MS = 60;
const MAX_CANDIDATES_PER_HOP = 3;

export const CANDIDATE_BUDGETS_MS: readonly number[] = [150, 250, 500, 1000];

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export interface InstrumentedResult {
  matched: boolean;
  success: boolean; // Deferred Validation accepted a net-improving leaf
  leavesExplored: number;
  nodesVisited: number;
  hitLeafCap: boolean;
  hitDeadline: boolean;
  timeMs: number;
}

export function runInstrumentedOnNodes(cubies: Cubie[], nodes: readonly string[], lib: WingLibrary, deadline: number): InstrumentedResult {
  const start = Date.now();
  let nodesVisited = 0;
  let leavesExplored = 0;
  let hitLeafCap = false;
  let hitDeadline = false;
  let best: Leaf | null = null;
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
    nodesVisited++;
    if (Date.now() > deadline) {
      hitDeadline = true;
      return;
    }
    if (leavesExplored >= MAX_LEAVES_EXPLORED) {
      hitLeafCap = true;
      return;
    }
    if (hopIndex >= nodes.length) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const slot = nodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1);
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP);
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working);
      return;
    }

    let anyBranchTried = false;
    for (const candidate of candidates) {
      if (Date.now() > deadline) {
        hitDeadline = true;
        break;
      }
      if (leavesExplored >= MAX_LEAVES_EXPLORED) {
        hitLeafCap = true;
        break;
      }
      anyBranchTried = true;
      const next = cloneCubies(working);
      applySeq(next, candidate);
      dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working);
  }

  dfs(cloneCubies(cubies), [], 0);

  let success = false;
  if (best) {
    const validation = validateDeferred(cubies, (best as Leaf).cubies);
    success = validation.accepted;
  }
  return { matched: true, success, leavesExplored, nodesVisited, hitLeafCap, hitDeadline, timeMs: Date.now() - start };
}

export function runBudgetProbe(cubies: Cubie[], lib: WingLibrary, budgetMs: number, strategy: CCRStrategy = "singleCycle"): InstrumentedResult | null {
  const gate = analyzeCcrGate(cubies);
  if (!gate.eligible) return null;
  const nodes = traversalNodesFor(gate, strategy);
  const deadline = Date.now() + budgetMs;
  return runInstrumentedOnNodes(cubies, nodes, lib, deadline);
}

export interface BudgetSummary {
  budgetMs: number;
  n: number;
  matchRate: number;
  successCount: number;
  avgLeavesExplored: number;
  avgNodesVisited: number;
  leafCapHitRate: number;
  deadlineHitRate: number;
  avgTimeMs: number;
}

export function summarizeBudgetProbe(budgetMs: number, results: readonly InstrumentedResult[]): BudgetSummary {
  const n = results.length;
  return {
    budgetMs,
    n,
    matchRate: n ? results.filter((r) => r.success).length / n : 0,
    successCount: results.filter((r) => r.success).length,
    avgLeavesExplored: n ? results.reduce((a, r) => a + r.leavesExplored, 0) / n : 0,
    avgNodesVisited: n ? results.reduce((a, r) => a + r.nodesVisited, 0) / n : 0,
    leafCapHitRate: n ? results.filter((r) => r.hitLeafCap).length / n : 0,
    deadlineHitRate: n ? results.filter((r) => r.hitDeadline).length / n : 0,
    avgTimeMs: n ? results.reduce((a, r) => a + r.timeMs, 0) / n : 0,
  };
}
