// --- InstrumentedSearch (Incremental Recovery Prototype Refinement Sprint
// v1) -------------------------------------------------------------------
// Shared core for STEP1/2/3. runCCRPrototype()/runSuccessV2() (both
// EXISTING, unmodified Prototypes -- protected this Sprint, read-only) are
// black boxes: they return only {matched, moves}, discarding all timing
// and Deferred-Validation-rejection information. Their own private dfs()
// closures cannot be imported or instrumented directly (not exported).
// This is a disclosed, INDEPENDENT reimplementation of the exact same DFS
// STRUCTURE both of them already use (byte-identical: same
// considerLeaf/dfs shape, same enumerateWingCandidates/applySeq/
// wrongWingCount5/pairCountOf/validateDeferred calls, all EXISTING,
// unmodified exports) -- established precedent for this whole research
// arc (e.g. firstHopAnalysis/ShadowBFS.ts's own disclosed reimplementation
// of the unexported bfsMoveWingToPosition). The only NEW code is
// instrumentation (Date.now() timing capture) and exposing the
// pre-Deferred-Validation "best leaf" instead of discarding it on
// rejection.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";

export const DEFAULT_PER_HOP_DEADLINE_MS = 60; // matches CCRPrototype.ts/SuccessOptimizationV2.ts's own constant exactly
export const DEFAULT_MAX_CANDIDATES_PER_HOP = 3; // matches W2_WIDER_HOP / CCR's own MAX_CANDIDATES_PER_HOP exactly

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

export interface InstrumentedSearchResult {
  leafFound: boolean; // the DFS found ANY leaf via considerLeaf, regardless of Deferred Validation
  deferredAccepted: boolean; // validateDeferred accepted the best leaf found
  moves: Move[] | null; // non-null only if deferredAccepted (matches runCCRPrototype/runSuccessV2's own contract)
  wrongWingBefore: number;
  wrongWingAfterBestLeaf: number | null; // the best leaf's own wrongWingCount, even if Deferred Validation rejected it -- the "deferred improvement" magnitude
  hopCandidateGenMs: number[]; // one entry per enumerateWingCandidates() call -- the only unchecked-for-deadline chunk of work between two Date.now() checks
  leafEvalMs: number[]; // one entry per considerLeaf() call (wrongWingCount5+pairCountOf cost)
  totalWallMs: number;
  leavesExplored: number;
  hopsAttempted: number; // number of enumerateWingCandidates() calls made
}

/** Same DFS structure as CCRPrototype.ts's runBoundedDfs / SuccessOptimizationV2.ts's runParametrizedSearchV2, with instrumentation added. */
export function runInstrumentedDfs(
  cubies: Cubie[],
  nodes: readonly string[],
  lib: WingLibrary,
  deadline: number,
  maxCandidatesPerHop: number = DEFAULT_MAX_CANDIDATES_PER_HOP,
  perHopDeadlineMs: number = DEFAULT_PER_HOP_DEADLINE_MS,
): InstrumentedSearchResult {
  const wallStart = Date.now();
  let leavesExplored = 0;
  let hopsAttempted = 0;
  let best: Leaf | null = null;
  let bestWrongWing = Infinity;
  let bestPair = -Infinity;
  const hopCandidateGenMs: number[] = [];
  const leafEvalMs: number[] = [];

  function considerLeaf(moves: Move[], working: Cubie[]): void {
    const t0 = Date.now();
    leavesExplored++;
    const wrongWing = wrongWingCount5(working);
    const pair = pairCountOf(working);
    leafEvalMs.push(Date.now() - t0);
    if (wrongWing < bestWrongWing || (wrongWing === bestWrongWing && pair > bestPair)) {
      best = { moves, cubies: working };
      bestWrongWing = wrongWing;
      bestPair = pair;
    }
  }

  function dfs(working: Cubie[], movesSoFar: Move[], hopIndex: number): void {
    if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) return;
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

    const hopDeadline = Math.min(deadline, Date.now() + perHopDeadlineMs);
    const genStart = Date.now();
    hopsAttempted++;
    const candidates = enumerateWingCandidates(working, wrongHere, lib, hopDeadline, maxCandidatesPerHop);
    hopCandidateGenMs.push(Date.now() - genStart);

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
  const totalWallMs = Date.now() - wallStart;

  if (!best) {
    return {
      leafFound: false,
      deferredAccepted: false,
      moves: null,
      wrongWingBefore: wrongWingCount5(cubies),
      wrongWingAfterBestLeaf: null,
      hopCandidateGenMs,
      leafEvalMs,
      totalWallMs,
      leavesExplored,
      hopsAttempted,
    };
  }

  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return {
    leafFound: true,
    deferredAccepted: validation.accepted,
    moves: validation.accepted ? (best as Leaf).moves : null,
    wrongWingBefore: validation.wrongWingBefore,
    wrongWingAfterBestLeaf: validation.wrongWingAfter,
    hopCandidateGenMs,
    leafEvalMs,
    totalWallMs,
    leavesExplored,
    hopsAttempted,
  };
}

export type IncrementalPrimitiveKind = "REPAIR" | "CCR" | null;

/** REPAIR's own current Gate (cycleLength 2~4, any conflictEdgeCount) -- identical to Prototype v1's own repairGateEligible. */
function repairGateEligible(cycleLength: number): boolean {
  return cycleLength >= 2 && cycleLength <= 4;
}

export interface InstrumentedAttempt {
  primitiveUsed: IncrementalPrimitiveKind;
  search: InstrumentedSearchResult | null; // null if neither Gate was eligible
}

/**
 * Mirrors Prototype v1's attemptIncrementalRecovery() dispatch (REPAIR
 * first, then CCR) but calls the instrumented DFS core above instead of
 * the black-box runCCRPrototype()/runSuccessV2(), and does NOT mutate
 * `cubies` -- callers decide whether/when to apply `search.moves`.
 */
export function runInstrumentedIncrementalAttempt(cubies: Cubie[], lib: WingLibrary, deadline: number): InstrumentedAttempt {
  const gate = analyzeCcrGate(cubies);
  const ccrEligible = gate.eligible;
  const repEligible = repairGateEligible(gate.primaryCycleLength);

  if (repEligible) {
    const analysis = analyzeMultiCycle(cubies);
    if (analysis) {
      const search = runInstrumentedDfs(cubies, analysis.cycleNodes, lib, deadline);
      if (search.deferredAccepted) return { primitiveUsed: "REPAIR", search };
      if (!ccrEligible) return { primitiveUsed: "REPAIR", search };
      // fall through to CCR only if also eligible (structurally rare -- see STEP5 of the Blueprint/Prototype Sprints, cycleLength bands 2-4 vs 5-6 don't overlap)
    }
  }
  if (ccrEligible) {
    const nodes = gate.primaryCycleNodes;
    const search = runInstrumentedDfs(cubies, nodes, lib, deadline);
    return { primitiveUsed: "CCR", search };
  }
  return { primitiveUsed: null, search: null };
}
