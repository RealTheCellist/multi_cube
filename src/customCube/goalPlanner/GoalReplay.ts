// --- GoalReplay (GOSP prototype) ---------------------------------------------
// Replay loading (real Failure Replay states, never Random Scramble -- spec
// section 7) + the Goal Replay verification step (spec section 14). Reuses
// the EXISTING, unmodified Failure Analysis Engine's clustering
// (failureCluster.ts) and Replay machinery (cubeSerialization.ts), and the
// EXISTING, unmodified FiveByFiveEdgeSolverEngine for the real "재실행"
// check -- read-only, exactly like every prior engine in this series.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import { clusterFailures } from "../failureAnalysis/failureCluster";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";
import { FiveByFiveEdgeSolverEngine } from "../fiveByFiveEdgeSolverEngine";
import type { GoalCandidate, GoalReplayBenchmarkResult } from "./GoalDescriptor";

export interface ReplayEntry {
  clusterKey: string;
  snapshot: FailureSnapshot;
  cubies: Cubie[];
}

/** Picks representative replays across the TOP FailureClusters (spec section
 * 7: "대표 Cluster 상위 20개 Replay를 사용한다"), filling each cluster's own
 * member snapshots (largest cluster first) until the total budget is
 * reached -- deliberately NOT one-representative-per-cluster (unlike Sprint
 * v2's PrimitiveReplay.ts), since spec section 13's own worked example
 * ("Cluster A: Replay 1, Replay 2, Replay 3") requires MULTIPLE real replays
 * from the SAME cluster to compare Goal commonality within it. */
export function loadTopReplays(dbPath: string, totalReplayBudget: number): ReplayEntry[] {
  const db = loadDatabase(dbPath);
  const snapshots = allSnapshots(db);
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const clusters = clusterFailures(snapshots); // already sorted by size desc

  const entries: ReplayEntry[] = [];
  for (const cluster of clusters) {
    if (entries.length >= totalReplayBudget) break;
    for (const hash of cluster.hashes) {
      if (entries.length >= totalReplayBudget) break;
      const snapshot = byHash.get(hash);
      if (!snapshot) continue;
      entries.push({ clusterKey: cluster.key, snapshot, cubies: deserializeCube(snapshot.cubeState) });
    }
  }
  return entries;
}

/**
 * Goal Replay verification (spec section 14): re-applies `candidate`'s own
 * move sequence to a FRESH clone of the ORIGINAL replay snapshot (never
 * mutating stored data), confirms it actually reaches goalHash, then
 * re-runs the REAL, unmodified FiveByFiveEdgeSolverEngine from there --
 * measured against running the same real Solver directly on the untouched
 * Failure State (no Goal detour) as the baseline. Both `solve()` calls
 * re-derive their own libraries as a safety net (see
 * fiveByFiveEdgeSolverEngine.ts's own solve() docstring), so no separate
 * warmup call is required here.
 */
export function runGoalVerification(candidate: GoalCandidate, originalSnapshot: FailureSnapshot): GoalReplayBenchmarkResult {
  const baselineCubies = deserializeCube(originalSnapshot.cubeState);
  const baselineEngine = new FiveByFiveEdgeSolverEngine();
  const baselinePlan = baselineEngine.solve(baselineCubies);
  const afterBaseline = cloneCubies(baselineCubies);
  applySeq(afterBaseline, baselinePlan.moveQueue);
  const wrongWingWithoutGoal = wrongWingCount5(afterBaseline);

  const goalCubies = deserializeCube(originalSnapshot.cubeState);
  applySeq(goalCubies, candidate.moveSequence);
  const reachedHash = computeEdgeSolverStateHash(goalCubies).toString(16);
  const goalReached = reachedHash === candidate.goalHash;

  const goalEngine = new FiveByFiveEdgeSolverEngine();
  const goalPlan = goalEngine.solve(goalCubies);
  const afterGoal = cloneCubies(goalCubies);
  applySeq(afterGoal, goalPlan.moveQueue);
  const wrongWingAfterGoal = wrongWingCount5(afterGoal);

  return {
    goalHash: candidate.goalHash,
    replayHash: candidate.replayHash,
    clusterKey: candidate.clusterKey,
    goalReached,
    solverSolvedWithoutGoal: wrongWingWithoutGoal === 0,
    wrongWingWithoutGoal,
    solverSolvedAfterGoal: wrongWingAfterGoal === 0,
    wrongWingAfterGoal,
    improved: wrongWingAfterGoal < wrongWingWithoutGoal,
  };
}
