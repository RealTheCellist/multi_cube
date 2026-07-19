// --- MultiHopBridgePrototypeV3 (Solver Primitive Prototype Sprint v3) ----
// Implements the Blueprint confirmed by Solver Primitive Blueprint Sprint
// v2 (solverPrimitiveBlueprintV2/, cited, unmodified): Preconditions =
// cycleLength 2~3 AND conflictEdgeCount>0. MultiHopBridgePrototype.ts (v2,
// this same directory, UNMODIFIED -- this Sprint never touches it) only
// gates on cycleLength and calls resolveBoundedMultiCycle() as a black
// box. v3 adds the conflictEdgeCount>0 gate exactly as the Blueprint
// specifies, and independently RE-IMPLEMENTS the bounded DFS traversal
// (rather than calling resolveBoundedMultiCycle) so this Sprint's own
// STEP2 Expected-Mechanism verification can instrument per-hop
// candidate/leaf counts that BoundedResolver.ts's own return type
// (leavesExplored only) doesn't expose. The traversal logic mirrors
// resolveBoundedMultiCycle (solverV2Prototype/BoundedResolver.ts,
// UNMODIFIED, cited) hop-for-hop -- same MAX_CANDIDATES_PER_HOP/
// MAX_LEAVES_EXPLORED constants (imported, unmodified), same
// PER_HOP_DEADLINE_MS=60 value (redeclared here since that file doesn't
// export it, identical rationale), same enumerateWingCandidates/
// applySeq/wrongWingCount5/pairCountOf calls (all EXISTING exports,
// unmodified), same validateDeferred (DeferredValidator.ts, unmodified)
// -- only the instrumentation counters are new.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { MAX_CANDIDATES_PER_HOP, MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

export const MIN_BRIDGE_CYCLE_LENGTH = 2;
export const MAX_BRIDGE_CYCLE_LENGTH = 3;
// Mirrors BoundedResolver.ts's own unexported PER_HOP_DEADLINE_MS=60 --
// redeclared here (not importable, that file doesn't export it) with the
// identical disclosed value and rationale (a single slow hop must not
// consume the whole remaining deadline).
const PER_HOP_DEADLINE_MS = 60;

export function countConflictEdges(cubies: Cubie[]): number {
  const graph = buildStateGraph(cubies);
  let count = 0;
  for (const e of graph.edges) if (e.type === "CONFLICT") count++;
  return count;
}

export interface InstrumentedSearchResult {
  moves: Move[] | null;
  nodesVisited: number; // every DFS call, including dead ends and hops already resolved earlier in-path
  candidatesGenerated: number; // sum of enumerateWingCandidates() result lengths across all hops
  leavesExplored: number; // complete branches judged (matches BoundedResolver's own definition)
  netImprovingLeaves: number; // among judged leaves, how many individually beat the ORIGINAL wrongWingCount
  deferredRejected: boolean; // a best leaf was found but validateDeferred rejected it
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

/**
 * Independent re-implementation of resolveBoundedMultiCycle's own bounded
 * DFS, with instrumentation counters added. Used both by the deployed
 * tryMultiHopBridgeV3() (only on gate_matched states) and directly by
 * MechanismVerification.ts's counterfactual probe (also on cycleLength
 * 2~3 / conflictEdgeCount==0 states, deliberately bypassing the gate,
 * purely to compare search behavior between the two populations -- never
 * used as the deployed Primitive's own decision path).
 */
export function runInstrumentedBoundedSearch(cubies: Cubie[], cycleNodes: readonly string[], lib: WingLibrary, deadline: number): InstrumentedSearchResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let nodesVisited = 0;
  let candidatesGenerated = 0;
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
    nodesVisited++;
    if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) return;
    if (hopIndex >= cycleNodes.length) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const slot = cycleNodes[hopIndex];
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) {
      dfs(working, movesSoFar, hopIndex + 1); // already resolved earlier in this same path -- move on
      return;
    }

    const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_DEADLINE_MS);
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, MAX_CANDIDATES_PER_HOP);
    candidatesGenerated += candidates.length;
    if (candidates.length === 0) {
      considerLeaf(movesSoFar, working); // dead end -- still a valid (partial) leaf to judge
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

  return { moves, nodesVisited, candidatesGenerated, leavesExplored, netImprovingLeaves, deferredRejected };
}

export type GateOutcome = "no_cycle" | "out_of_band" | "no_conflict" | "gate_matched";

export interface MultiHopBridgeV3Result {
  gateOutcome: GateOutcome;
  moves: Move[] | null;
  cycleLength: number;
  conflictEdgeCount: number;
  search: InstrumentedSearchResult | null;
  timeMs: number;
}

/** The deployed Primitive: applies the FULL confirmed Blueprint gate. */
export function tryMultiHopBridgeV3(cubies: Cubie[], lib: WingLibrary, deadline: number): MultiHopBridgeV3Result {
  const start = Date.now();
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { gateOutcome: "no_cycle", moves: null, cycleLength: 0, conflictEdgeCount: 0, search: null, timeMs: Date.now() - start };

  const inBand = analysis.cycleLength >= MIN_BRIDGE_CYCLE_LENGTH && analysis.cycleLength <= MAX_BRIDGE_CYCLE_LENGTH;
  if (!inBand) return { gateOutcome: "out_of_band", moves: null, cycleLength: analysis.cycleLength, conflictEdgeCount: 0, search: null, timeMs: Date.now() - start };

  const conflictEdgeCount = countConflictEdges(cubies);
  if (conflictEdgeCount === 0) return { gateOutcome: "no_conflict", moves: null, cycleLength: analysis.cycleLength, conflictEdgeCount, search: null, timeMs: Date.now() - start };

  const search = runInstrumentedBoundedSearch(cubies, analysis.cycleNodes, lib, deadline);
  return { gateOutcome: "gate_matched", moves: search.moves, cycleLength: analysis.cycleLength, conflictEdgeCount, search, timeMs: Date.now() - start };
}
