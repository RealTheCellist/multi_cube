// --- CapabilityGapAnalyzer (Capability Analysis Engine v1) ------------------
// "가장 중요한 모듈" per spec. A capability is a genuine gap for a cluster
// only if EVERY tested primitive shows X on that row (matches spec's own
// "전부 X인 행이 새 Capability 후보"). Confidence is computed, not
// fabricated: the representative snapshot is the only one actually
// simulation-tested (real primitive execution is comparatively expensive,
// see PrimitiveCapabilityTester's TEST_DEADLINE_MS), but the CHEAP
// structural check (StateGraphBuilder + ConstraintAnalyzer, no primitive
// execution at all) can run over every OTHER member of the cluster --
// confidence is the fraction of the cluster's own members that show the
// same structural signal (a cycle/conflict of matching shape) the gap is
// attributed to.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildStateGraph } from "./stateGraphBuilder";
import { analyzeConstraints } from "./constraintAnalyzer";
import type { CapabilityGap, CapabilityMatrix, CapabilityRowName } from "./capabilityTypes";

const ROWS: CapabilityRowName[] = ["PairCreation", "PairPreservation", "CycleRemoval", "ConflictReduction", "MultiSwap"];

function structuralSignalMatches(row: CapabilityRowName, snapshot: FailureSnapshot): boolean {
  const graph = buildStateGraph(deserializeCube(snapshot.cubeState));
  const stats = analyzeConstraints(graph);
  switch (row) {
    case "CycleRemoval":
      return stats.cycleCount > 0;
    case "ConflictReduction":
      return stats.conflictCount > 0;
    case "MultiSwap":
      return stats.longestCycleLength >= 3;
    case "PairCreation":
    case "PairPreservation":
      return true; // always structurally relevant -- every unfinished slot involves these
  }
}

export function analyzeCapabilityGap(matrix: CapabilityMatrix, clusterSnapshots: readonly FailureSnapshot[]): CapabilityGap {
  const missingCapabilities = ROWS.filter((row) => Object.values(matrix.rows[row]).every((level) => level !== "O"));

  let confidence = 0;
  if (missingCapabilities.length > 0 && clusterSnapshots.length > 0) {
    const matchCounts = missingCapabilities.map(
      (row) => clusterSnapshots.filter((s) => structuralSignalMatches(row, s)).length / clusterSnapshots.length
    );
    confidence = Math.round((matchCounts.reduce((a, b) => a + b, 0) / matchCounts.length) * 100);
  }

  return { clusterId: matrix.clusterId, missingCapabilities, confidence };
}
