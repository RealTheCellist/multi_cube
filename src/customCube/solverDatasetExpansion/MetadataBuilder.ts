// --- MetadataBuilder (Solver Failure Dataset Expansion Sprint v2) --------
// STEP3: computes the required per-replay metadata (WrongWing/Pair/Cycle/
// Conflict/Shape/Hard Gap/Cluster) for every validated candidate (STEP2),
// reusing existing, unmodified, read-only functions: deserializeCube,
// pairCountOf/hasParity, buildStateGraph, computeCoarseShapeKey/
// computeCycleShape, and GapDetector's own per-snapshot `profileReplay`
// (which already computes WrongWing/Pair/Parity/longestCycleLength/
// isHardGap for exactly one snapshot -- no need to reimplement it).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { profileReplay } from "../solverV2Research/GapDetector";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";

export interface ReplayMetadata {
  hash: string;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  cycleCount: number;
  longestCycleLength: number;
  conflictEdgeCount: number;
  coarseShapeKey: string;
  exactShapeKey: string;
  isHardGap: boolean;
  clusterKey: string; // w{wrongWing}|p{parity}, same convention as GapDetector.ts
}

export function buildMetadataForAll(snapshots: readonly FailureSnapshot[], gapDeadlineMs: number): ReplayMetadata[] {
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  return snapshots.map((snapshot) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const clusterKey = `w${snapshot.wrongWingCount}|p${snapshot.parity ? 1 : 0}`;
    const profile = profileReplay(snapshot, clusterKey, libs, gapDeadlineMs);

    const graph = buildStateGraph(cubies);
    const conflictEdgeCount = graph.edges.filter((e) => e.type === "CONFLICT").length;

    return {
      hash: snapshot.hash,
      wrongWingCount: profile.wrongWingCount,
      pairCount: profile.pairCount,
      parity: profile.parity,
      cycleCount: graph.cycles.length,
      longestCycleLength: profile.longestCycleLength,
      conflictEdgeCount,
      coarseShapeKey: computeCoarseShapeKey(cubies),
      exactShapeKey: computeCycleShape(cubies).shapeKey,
      isHardGap: profile.isHardGap,
      clusterKey: profile.clusterKey,
    };
  });
}
