// --- PrimitiveReuseAnalysis (Primitive Discovery Sprint #3) ----------------
// STEP4. Before designing a brand-new search Primitive for CCR, tests
// whether REPAIR's OWN existing search core already generalizes if its
// cycleLength band is simply widened -- exactly the same question Gate
// Relaxation Validation Sprint v1 asked about the conflictEdgeCount axis,
// asked here about the cycleLength axis instead. This is a disclosed,
// independent reimplementation of runSuccessV2/runParametrizedSearchV2's
// own DFS body (solverPrimitivePrototypeRefinementV2/
// SuccessOptimizationV2.ts, read-only/production this Sprint -- never
// modified) with exactly ONE axis changed (MAX_CYCLE_LENGTH 4 -> 6),
// otherwise byte-identical: same W2_widerHop options (maxCandidatesPerHop
// 3, no reordering -- the variant fiveByFiveEdgeRecovery.ts's genRepair()
// actually calls in production), same PER_HOP_DEADLINE_MS=60, same
// MAX_LEAVES_EXPLORED (imported from solverV2Prototype/BoundedResolver.ts,
// UNMODIFIED), same enumerateWingCandidates/applySeq/wrongWingCount5/
// pairCountOf/validateDeferred (all EXISTING exports, unmodified). This
// is a research PROBE only -- never wired into production, never called
// from Recovery/Executor/Engine.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

const PER_HOP_DEADLINE_MS = 60;
const MIN_CYCLE_LENGTH = 2;
const MAX_CYCLE_LENGTH_EXTENDED = 6; // the ONE axis changed vs runSuccessV2's own MAX_CYCLE_LENGTH=4
const MAX_CANDIDATES_PER_HOP = 3; // == W2_WIDER_HOP's own value (production's actual variant)
// Mirrors fiveByFiveEdgeRecovery.ts's own unexported REPAIR_RESERVED_SLICE_MS=75
// -- redeclared here (not importable) with the identical disclosed value,
// since this probe's realism goal is "what REPAIR's actual reservedBudget
// window could achieve", not an unbounded search.
const REPAIR_RESERVED_SLICE_MS = 75;

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export interface ExtendedSearchResult {
  matched: boolean; // Deferred Validation accepted a net-improving leaf
  leavesExplored: number;
  nodesVisited: number;
  hitLeafCap: boolean; // leavesExplored reached MAX_LEAVES_EXPLORED before the DFS naturally finished
  hitDeadline: boolean; // wall-clock deadline hit before the DFS naturally finished
  timeMs: number;
}

function runExtendedSearch(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number): ExtendedSearchResult {
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

  let matched = false;
  if (best) {
    const validation = validateDeferred(cubies, (best as Leaf).cubies);
    matched = validation.accepted;
  }
  return { matched, leavesExplored, nodesVisited, hitLeafCap, hitDeadline, timeMs: Date.now() - start };
}

export interface ReuseProbeRecord {
  hash: string;
  gateInBand: boolean; // cycleLength within the EXTENDED 2~6 band
  result: ExtendedSearchResult | null; // null if no cycle / out of band
}

export function runReuseProbe(cubies: Cubie[], hash: string, lib: WingLibrary, deadlineMs: number = REPAIR_RESERVED_SLICE_MS): ReuseProbeRecord {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis || analysis.cycleLength < MIN_CYCLE_LENGTH || analysis.cycleLength > MAX_CYCLE_LENGTH_EXTENDED) {
    return { hash, gateInBand: false, result: null };
  }
  const deadline = Date.now() + deadlineMs;
  const result = runExtendedSearch(cubies, analysis.cycleNodes, lib, deadline);
  return { hash, gateInBand: true, result };
}

export interface ReuseProbeSummary {
  n: number;
  matchedCount: number;
  matchRate: number;
  avgLeavesExplored: number;
  avgNodesVisited: number;
  leafCapHitRate: number; // fraction of probes where the bounded DFS was truncated by MAX_LEAVES_EXPLORED before finishing naturally
  deadlineHitRate: number; // fraction truncated by the 75ms reservedBudget window instead
  avgTimeMs: number;
}

export function summarizeReuseProbe(records: readonly ReuseProbeRecord[]): ReuseProbeSummary {
  const withResult = records.filter((r): r is ReuseProbeRecord & { result: ExtendedSearchResult } => r.result !== null);
  const n = withResult.length;
  return {
    n,
    matchedCount: withResult.filter((r) => r.result.matched).length,
    matchRate: n ? withResult.filter((r) => r.result.matched).length / n : 0,
    avgLeavesExplored: n ? withResult.reduce((a, r) => a + r.result.leavesExplored, 0) / n : 0,
    avgNodesVisited: n ? withResult.reduce((a, r) => a + r.result.nodesVisited, 0) / n : 0,
    leafCapHitRate: n ? withResult.filter((r) => r.result.hitLeafCap).length / n : 0,
    deadlineHitRate: n ? withResult.filter((r) => r.result.hitDeadline).length / n : 0,
    avgTimeMs: n ? withResult.reduce((a, r) => a + r.result.timeMs, 0) / n : 0,
  };
}

/** Theoretical worst-case leaf count (maxCandidatesPerHop ^ cycleLength) vs
 * the shared MAX_LEAVES_EXPLORED cap. NOTE (see measureFirstHopLatency's own
 * disclosure below): empirically this comparison turned out NOT to be the
 * binding constraint for this population -- leafCapHitRate measured 0% at
 * REPAIR's real 75ms budget. Kept here as a documented, ruled-out hypothesis,
 * not the actual explanation. */
export function theoreticalBranchingComparison(): { cycleLength: number; theoreticalMaxLeaves: number; cappedAt: number }[] {
  const rows: { cycleLength: number; theoreticalMaxLeaves: number; cappedAt: number }[] = [];
  for (let cl = MIN_CYCLE_LENGTH; cl <= MAX_CYCLE_LENGTH_EXTENDED; cl++) {
    rows.push({ cycleLength: cl, theoreticalMaxLeaves: Math.pow(MAX_CANDIDATES_PER_HOP, cl), cappedAt: MAX_LEAVES_EXPLORED });
  }
  return rows;
}

// The REAL explanation for STEP4's initially-puzzling 91.9% deadline-hit
// rate at only ~2 nodesVisited/1 leavesExplored average (first measured
// with the 75ms probe above): a SINGLE enumerateWingCandidates() call on
// this population (avg wrongWingCount 12.24, denser than REPAIR's own
// cycleLength 2~4 target) already costs enough on its own, most of the
// time, to exhaust REPAIR's 75ms reservedBudget before the DFS ever
// branches -- not DFS branching explosion (leafCapHitRate measured 0%).
// Verified two ways below: (1) direct latency measurement of one isolated
// first-hop call, generous 500ms per-call sub-budget so the measurement
// itself is never truncated; (2) rerunning the exact same probe with the
// real whole-plan PLAN_TIME_BUDGET_MS (1000ms) instead of REPAIR's own
// 75ms reservedBudget slice, to see whether match rate recovers.
export const GENEROUS_BUDGET_MS = PLAN_TIME_BUDGET_MS;

export function measureFirstHopLatency(cubies: Cubie[], lib: WingLibrary): number | null {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return null;
  const slot = analysis.cycleNodes[0];
  const wrongHere = wrongWings5(cubies).find((w) => slotKey(w) === slot);
  if (!wrongHere) return null;
  const start = Date.now();
  enumerateWingCandidates(cubies, wrongHere, lib, Date.now() + 500, MAX_CANDIDATES_PER_HOP);
  return Date.now() - start;
}

export interface LatencySummary {
  n: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export function summarizeLatencies(samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    n,
    avgMs: n ? sorted.reduce((a, b) => a + b, 0) / n : 0,
    p50Ms: n ? sorted[Math.floor(n * 0.5)] : 0,
    p95Ms: n ? sorted[Math.floor(n * 0.95)] : 0,
    maxMs: n ? sorted[n - 1] : 0,
  };
}
