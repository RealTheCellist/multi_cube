// --- CapabilityAnalysisEngine (Capability Analysis Engine v1) --------------
// Ties the whole pipeline together: reuses ../primitiveDiscovery's
// clustering (no re-clustering from scratch) + ../failureAnalysis's stored
// snapshots, picks ONE representative snapshot per cluster to actually
// simulation-test (real primitive execution -- see
// PrimitiveCapabilityTester's own cost comment), and runs the cheaper
// structural checks (gap confidence) across every cluster member.
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "../fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { canonicalizeAll, clusterCanonicalEntries } from "../primitiveDiscovery/clusterAnalyzer";
import { buildStateGraph } from "./stateGraphBuilder";
import { testAllCapabilities } from "./primitiveCapabilityTester";
import { buildCapabilityMatrix } from "./capabilityMatrix";
import { analyzeCapabilityGap } from "./capabilityGapAnalyzer";
import { computeSimilarityPairs, mergeSimilarClusters } from "./capabilitySimilarity";
import { generatePrimitiveCandidates } from "./primitiveCandidateGenerator";
import type { ClusterCapabilitySummary, PrimitiveCandidate } from "./capabilityTypes";

export interface CapabilityAnalysisResult {
  summaries: ClusterCapabilitySummary[];
  candidates: PrimitiveCandidate[];
  mergedGroups: number[][];
  totalFailureCount: number;
}

export function runCapabilityAnalysis(snapshots: readonly FailureSnapshot[]): CapabilityAnalysisResult {
  warmupFiveByFiveEdgeLibraries();
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const canonicalEntries = canonicalizeAll(snapshots);
  const clusters = clusterCanonicalEntries(canonicalEntries);

  const summaries: ClusterCapabilitySummary[] = clusters.map((cluster) => {
    const clusterSnapshots = cluster.snapshotHashes.map((h) => byHash.get(h)).filter((s): s is FailureSnapshot => !!s);
    const representative = clusterSnapshots[0];
    const cubies = deserializeCube(representative.cubeState);

    const testResults = testAllCapabilities(cubies, libs);
    const graph = buildStateGraph(cubies);
    const hasMultiSwapCycle = graph.cycles.some((c) => c.length >= 3);
    const matrix = buildCapabilityMatrix(cluster.id, testResults, hasMultiSwapCycle);
    const gap = analyzeCapabilityGap(matrix, clusterSnapshots);

    return { cluster, matrix, gap, representativeHash: representative.hash };
  });

  const similarityPairs = computeSimilarityPairs(summaries.map((s) => s.gap));
  const mergedGroups = mergeSimilarClusters(
    summaries.filter((s) => s.gap.missingCapabilities.length > 0).map((s) => s.cluster.id),
    similarityPairs
  );

  const candidates = generatePrimitiveCandidates(summaries, snapshots.length);

  return { summaries, candidates, mergedGroups, totalFailureCount: snapshots.length };
}
