// --- BoundedLookaheadPrototype (Solver v3 Primitive Prototype Sprint v1 / BP-5)
// STEP3: a REAL, executed depth=2 bounded lookahead (not just an
// analytical estimate) over the Sparse Wrongness candidate set (STEP2).
// Reuses enumerateWingCandidates()/applySeq()/cloneCubies() (existing,
// exported, unmodified) exactly as BoundedResolver.ts (BP-1, protected,
// read-only) already established for its own bounded DFS + Deferred
// Validation pattern -- but BP-1 walks a FIXED WANTS-cycle order, which
// these sparse states usually don't have enough of. This search instead
// considers ALL currently-wrong wings at each hop (deterministic slotKey
// order), since there's no rich cycle scaffold to walk.
//
// Every enumerateWingCandidates() call is measured for its TRUE returned
// candidate count (maxResults=20, matching Contract Analysis Sprint v1's
// own PairConflictAnalyzer.ts methodology exactly, for a directly
// comparable branching-factor number) -- regardless of how many of those
// candidates are actually expanded into child search nodes. Expansion
// itself stays bounded (MAX_EXPAND_PER_WRONG_WING, MAX_WRONG_WINGS_PER_HOP,
// MAX_LEAVES_EXPLORED) so the real wall-clock cost is measured under an
// actually-bounded search, not a runaway one.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { validateDeferred } from "../solverV2Prototype/DeferredValidator";

export const MAX_CANDIDATES_MEASURED = 20; // matches Contract Analysis Sprint v1's own maxResults, for a directly comparable branching-factor number
export const MAX_EXPAND_PER_WRONG_WING = 2;
export const MAX_WRONG_WINGS_PER_HOP = 4;
export const MAX_LEAVES_EXPLORED = 64; // same disclosed bound BoundedResolver.ts (BP-1) already uses
export const LOOKAHEAD_DEPTH = 2;
const PER_HOP_SUBDEADLINE_MS = 60; // same disclosed budget-starvation fix BoundedResolver.ts already needed

export interface BoundedLookaheadResult {
  hash: string;
  moves: Move[] | null; // null if no explored leaf net-improves WrongWing (Deferred Validation rejects), or no candidate at all
  leavesExplored: number;
  nodesVisited: number; // total enumerateWingCandidates() calls made
  branchingFactorSamples: number[]; // one entry per enumerateWingCandidates() call -- its TRUE returned length
  wallTimeMs: number;
  hitOverallDeadline: boolean;
}

interface Leaf {
  moves: Move[];
  cubies: Cubie[];
}

function runBoundedLookahead(cubies: Cubie[], lib: WingLibrary, deadline: number): { moves: Move[] | null; leavesExplored: number; nodesVisited: number; branchingFactorSamples: number[]; hitOverallDeadline: boolean } {
  let leavesExplored = 0;
  let nodesVisited = 0;
  const branchingFactorSamples: number[] = [];
  let hitOverallDeadline = false;
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
    if (Date.now() > deadline) {
      hitOverallDeadline = true;
      return;
    }
    if (leavesExplored >= MAX_LEAVES_EXPLORED) return;
    if (hopIndex >= LOOKAHEAD_DEPTH) {
      considerLeaf(movesSoFar, working);
      return;
    }

    const wrongHere = wrongWings5(working)
      .slice()
      .sort((a, b) => (slotKey(a) < slotKey(b) ? -1 : slotKey(a) > slotKey(b) ? 1 : 0))
      .slice(0, MAX_WRONG_WINGS_PER_HOP);

    if (wrongHere.length === 0) {
      considerLeaf(movesSoFar, working); // nothing left wrong -- valid leaf
      return;
    }

    let anyBranchTried = false;
    for (const wrongWing of wrongHere) {
      if (Date.now() > deadline) {
        hitOverallDeadline = true;
        break;
      }
      if (leavesExplored >= MAX_LEAVES_EXPLORED) break;

      const hopDeadline = Math.min(deadline, Date.now() + PER_HOP_SUBDEADLINE_MS);
      const candidates = enumerateWingCandidates(working, wrongWing, lib, hopDeadline, MAX_CANDIDATES_MEASURED);
      nodesVisited++;
      branchingFactorSamples.push(candidates.length);

      for (const candidate of candidates.slice(0, MAX_EXPAND_PER_WRONG_WING)) {
        if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED) break;
        anyBranchTried = true;
        const next = cloneCubies(working);
        applySeq(next, candidate);
        dfs(next, [...movesSoFar, ...candidate], hopIndex + 1);
      }
    }
    if (!anyBranchTried) considerLeaf(movesSoFar, working); // deadline/cap hit before any candidate tried -- still a valid partial leaf
  }

  dfs(cloneCubies(cubies), [], 0);

  if (!best) return { moves: null, leavesExplored, nodesVisited, branchingFactorSamples, hitOverallDeadline };
  const validation = validateDeferred(cubies, (best as Leaf).cubies);
  return { moves: validation.accepted ? (best as Leaf).moves : null, leavesExplored, nodesVisited, branchingFactorSamples, hitOverallDeadline };
}

export function runBoundedLookaheadOn(snapshot: FailureSnapshot, lib: WingLibrary, deadlineMs: number): BoundedLookaheadResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const startedAt = Date.now();
  const result = runBoundedLookahead(cubies, lib, startedAt + deadlineMs);
  const wallTimeMs = Date.now() - startedAt;

  return {
    hash: snapshot.hash,
    moves: result.moves,
    leavesExplored: result.leavesExplored,
    nodesVisited: result.nodesVisited,
    branchingFactorSamples: result.branchingFactorSamples,
    wallTimeMs,
    hitOverallDeadline: result.hitOverallDeadline,
  };
}
