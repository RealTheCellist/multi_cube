// --- PrototypeReplay (Primitive Invention Sprint v1) ------------------------
// Loads the real Failure Replay database for the Prototype Benchmark (spec
// section 8: "대표 Replay 50개" -- this codebase's whole failure database
// only has 75 real snapshots total, so the full 75 satisfies "at least
// 50" the same way every prior engine in this series has). Read-only reuse
// of the EXISTING, unmodified Failure Analysis Engine.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

export function loadAllReplaySnapshots(dbPath: string): FailureSnapshot[] {
  return allSnapshots(loadDatabase(dbPath));
}

export function restoreReplayState(snapshot: FailureSnapshot) {
  return deserializeCube(snapshot.cubeState);
}
