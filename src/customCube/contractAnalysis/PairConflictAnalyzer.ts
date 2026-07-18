// --- PairConflictAnalyzer (Solver Contract Analysis Sprint v1) -------------
// Spec STEP 2: for every PAIR_CONFLICT Replay (classified by
// firstHopAnalysis/FailureModeClassifier.ts, reused read-only), records the
// candidate move(s) tryFixWing()'s own "immediate net improvement" contract
// rejects -- found via the SAME enumerateWingCandidates() (existing,
// exported, unmodified) First-Hop Failure Analysis Sprint v1 already used
// to distinguish PAIR_CONFLICT from NO_VALID_PATH.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { FirstHopTraceRecord } from "../firstHopAnalysis/FirstHopTraceDB";

export interface RejectedCandidate {
  move: Move[];
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
}

export interface PairConflictRecord {
  replayHash: string;
  startSlot: string;
  totalCandidates: number;
  rejectedCandidates: RejectedCandidate[]; // all of them are "rejected" by definition -- none net-improve, that's what makes this PAIR_CONFLICT
  bestWrongWingDelta: number; // the least-bad candidate's own delta (closest to improving, or the smallest regression)
}

function findWing(cubies: Cubie[], slot: string): Cubie | undefined {
  return wrongWings5(cubies).find((w) => slotKey(w) === slot);
}

export function analyzePairConflict(record: FirstHopTraceRecord, snapshot: FailureSnapshot, lib: WingLibrary, deadlineMs: number): PairConflictRecord {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongHere = findWing(cubies, record.startSlot);
  const rejected: RejectedCandidate[] = [];

  if (wrongHere) {
    const deadline = Date.now() + deadlineMs;
    const candidates = enumerateWingCandidates(cubies, wrongHere, lib, deadline, 20);
    for (const move of candidates) {
      const clone = cloneCubies(cubies);
      const wrongWingBefore = wrongWingCount5(clone);
      const pairBefore = pairCountOf(clone);
      applySeq(clone, move);
      rejected.push({
        move,
        wrongWingBefore,
        wrongWingAfter: wrongWingCount5(clone),
        pairBefore,
        pairAfter: pairCountOf(clone),
      });
    }
  }

  const bestWrongWingDelta = rejected.length ? Math.min(...rejected.map((r) => r.wrongWingAfter - r.wrongWingBefore)) : 0;

  return {
    replayHash: record.replayHash,
    startSlot: record.startSlot,
    totalCandidates: rejected.length,
    rejectedCandidates: rejected,
    bestWrongWingDelta,
  };
}

export function analyzeAllPairConflicts(records: readonly FirstHopTraceRecord[], snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): PairConflictRecord[] {
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  return records.filter((r) => r.candidateCount > 0).map((r) => analyzePairConflict(r, byHash.get(r.replayHash)!, lib, deadlineMs));
}
