// --- PolicyReplay (Policy Generalization Sprint v1) -------------------------
// Loads the real Failure Replay database (spec section 7: "75 Replay
// 전체에서 검증한다", never a fresh scramble) -- read-only reuse of the
// EXISTING, unmodified Failure Analysis Engine, exactly like every prior
// engine in this series.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { hasParity } from "../goalPlanner/GoalAnalyzer";

export function loadAllReplaySnapshots(dbPath: string): FailureSnapshot[] {
  return allSnapshots(loadDatabase(dbPath));
}

export function restoreReplayState(snapshot: FailureSnapshot): Cubie[] {
  return deserializeCube(snapshot.cubeState);
}

/** The same `w{wrongWing}|p{0|1}` signature vocabulary used throughout this
 * whole Sprint (FailureCluster/GoalCluster/Policy), computed against a
 * LIVE cube state rather than a stored snapshot field. */
export function stateSignatureOf(cubies: Cubie[]): string {
  return `w${wrongWingCount5(cubies)}|p${hasParity(cubies) ? 1 : 0}`;
}
