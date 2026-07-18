// --- FirstHopTraceDB (First-Hop Failure Analysis Sprint v1) -----------------
// Spec STEP 1: builds a trace record for every FIRST_HOP_FAIL Replay (as
// classified by coverageExpansion/InactivityClassifier.ts, reused read-only
// -- never modified) at the exact point right before CycleChase's first
// tryFixWing() call.
//
// Key tool: fiveByFiveEdges.ts's EXPORTED `enumerateWingCandidates()` --
// documented in its own source comment as running the SAME safe candidate
// search tryFixWing() uses, WITHOUT requiring an immediate net WrongWing
// improvement (tryFixWing only ever returns a fix that helps right now;
// enumerateWingCandidates returns every structurally valid one). Comparing
// "does enumerateWingCandidates find anything at all" against "did
// tryFixWing still return null" is how this Sprint distinguishes "no valid
// move exists" from "valid moves exist but none of them net-improve" --
// using ONLY an existing, unmodified, exported function, never
// reimplementing or peeking into tryFixWing's own internals.
import { cloneCubies, type Cubie } from "../cubeState";
import { colorKeyOf, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type WingLibrary } from "../fiveByFiveEdges";
import { pieceType5 } from "../fiveByFivePieces";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { classifyReplay } from "../coverageExpansion/InactivityClassifier";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

export interface FirstHopTraceRecord {
  replayHash: string;
  cycleLength: number;
  startSlot: string;
  targetSlot: string;
  wantedColorKey: string;
  candidateCount: number; // enumerateWingCandidates(...).length -- 0 means no structurally valid move exists at all
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
}

function findFirstHopWing(cubies: Cubie[], startSlot: string): Cubie | undefined {
  return wrongWings5(cubies).find((w) => slotKey(w) === startSlot);
}

/** Selects the 46 (or however many) real FIRST_HOP_FAIL Replays out of all
 * 75, using coverageExpansion's own classifier as ground truth (never
 * re-deriving a possibly-inconsistent definition of "FIRST_HOP_FAIL"). */
export function selectFirstHopFailReplays(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): FailureSnapshot[] {
  return snapshots.filter((s) => classifyReplay(s, lib, deadlineMs).cause === "FIRST_HOP_FAIL");
}

export function buildFirstHopTrace(snapshot: FailureSnapshot, lib: WingLibrary, deadlineMs: number): FirstHopTraceRecord | null {
  const cubies = deserializeCube(snapshot.cubeState);
  const working = cloneCubies(cubies);
  const cycle = pickLongestCycle(buildStateGraph(working).cycles);
  if (!cycle || cycle.length < 4) return null; // shouldn't happen for a genuine FIRST_HOP_FAIL, defensively guarded

  const startSlot = cycle[0];
  const targetSlot = cycle[1 % cycle.length];
  const wrongHere = findFirstHopWing(working, startSlot);
  if (!wrongHere) return null;

  const targetTrueEdge = working.find((c) => pieceType5(c) === "trueEdge" && slotKey(c) === targetSlot);
  const wantedColorKey = targetTrueEdge ? colorKeyOf(targetTrueEdge) : "unknown";

  const deadline = Date.now() + deadlineMs;
  const candidates = enumerateWingCandidates(working, wrongHere, lib, deadline, 20);

  return {
    replayHash: snapshot.hash,
    cycleLength: cycle.length,
    startSlot,
    targetSlot,
    wantedColorKey,
    candidateCount: candidates.length,
    wrongWingCount: wrongWingCount5(working),
    pairCount: pairCountOf(working),
    parity: hasParity(working),
  };
}

export function buildFirstHopTraceDatabase(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): FirstHopTraceRecord[] {
  const failReplays = selectFirstHopFailReplays(snapshots, lib, deadlineMs);
  return failReplays.map((s) => buildFirstHopTrace(s, lib, deadlineMs)).filter((r): r is FirstHopTraceRecord => r !== null);
}
