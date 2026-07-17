// --- Replay Integration (Capability Analysis Engine v1) ---------------------
// Thin wrapper over the EXISTING failureAnalysis Replay (built two engines
// ago, already verified) -- this module adds nothing new to Replay itself,
// it just gives ClusterCapabilitySummary a one-call path from "a cluster" to
// "its representative failure, replayed against the real solver".
import type { FailureDatabase } from "../failureAnalysis/failureDatabase";
import { loadFailure, replayFailure, type ReplayResult } from "../failureAnalysis/failureReplay";
import type { Cubie } from "../cubeState";

export function loadRepresentativeState(db: FailureDatabase, representativeHash: string): Cubie[] | null {
  return loadFailure(db, representativeHash);
}

export function replayCluster(db: FailureDatabase, representativeHash: string): ReplayResult | null {
  return replayFailure(db, representativeHash);
}
