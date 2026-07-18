// --- FailureModeClassifier (First-Hop Failure Analysis Sprint v1) ----------
// Spec STEP 3: one representative Failure Mode per FIRST_HOP_FAIL Replay.
//
// WRONG_START takes priority over the raw local diagnosis (NO_VALID_PATH /
// PAIR_CONFLICT) whenever a DIFFERENT starting slot in the SAME cycle would
// have let CycleChase succeed -- reusing coverageExpansion's own
// `alternateStart` simulation (already built and validated in Coverage
// Expansion Sprint v1, read-only, never re-implemented differently here)
// as the ground truth for "would a different start have worked".
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { simulateCycleChase } from "../coverageExpansion/CycleChaseSimulator";
import type { FirstHopTraceRecord } from "./FirstHopTraceDB";

export type FailureMode = "WRONG_START" | "NO_VALID_PATH" | "PAIR_CONFLICT" | "UNKNOWN";

export interface FailureModeResult {
  replayHash: string;
  mode: FailureMode;
  candidateCount: number;
  rescuedByAlternateStart: boolean;
}

export function classifyFailureMode(record: FirstHopTraceRecord, snapshot: FailureSnapshot, libs: ExecutorLibraries, deadlineMs: number): FailureModeResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const rescued =
    simulateCycleChase(cubies, libs, Date.now() + deadlineMs, { minimumCycleLength: 4, alternateStart: true, parityPreTry: false }) !== null;

  let mode: FailureMode;
  if (rescued) mode = "WRONG_START";
  else if (record.candidateCount === 0) mode = "NO_VALID_PATH";
  else if (record.candidateCount > 0) mode = "PAIR_CONFLICT";
  else mode = "UNKNOWN";

  return { replayHash: record.replayHash, mode, candidateCount: record.candidateCount, rescuedByAlternateStart: rescued };
}

export function classifyAllFailureModes(
  records: readonly FirstHopTraceRecord[],
  snapshots: readonly FailureSnapshot[],
  libs: ExecutorLibraries,
  deadlineMs: number
): FailureModeResult[] {
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  return records.map((r) => classifyFailureMode(r, byHash.get(r.replayHash)!, libs, deadlineMs));
}

export function tallyFailureModes(results: readonly FailureModeResult[]): Record<FailureMode, number> {
  const tally: Record<FailureMode, number> = { WRONG_START: 0, NO_VALID_PATH: 0, PAIR_CONFLICT: 0, UNKNOWN: 0 };
  for (const r of results) tally[r.mode]++;
  return tally;
}
