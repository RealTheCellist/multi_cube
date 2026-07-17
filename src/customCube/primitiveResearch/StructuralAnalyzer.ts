// --- StructuralAnalyzer (Primitive Invention Sprint v1) ---------------------
// Spec section 6's "Replay 복원 -> 사람이 분석 가능한 상태 생성 -> 공통
// 구조 추출" steps. Reuses capabilityAnalysis/stateGraphBuilder.ts's
// EXISTING, unmodified WANTS-relation graph (grounded in real colorKeyOf
// matching, not fabricated) -- the same graph Capability Analysis Engine
// v1 already built and validated, read-only, exactly like every other
// engine in this series reuses a previous one's tools.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { wrongWingCount5 } from "../fiveByFiveEdges";

export interface ReplayStructuralProfile {
  hash: string;
  wrongWingCount: number;
  swapCount: number; // number of distinct 2-cycles ("SWAP" edges / 2)
  cycleEdgeCount: number; // edges belonging to a 3+ length cycle
  conflictCount: number; // WANTS edges that are NOT part of any detected cycle
  cycleLengths: number[];
  longestCycleLength: number;
}

export function analyzeReplayStructure(snapshot: FailureSnapshot): ReplayStructuralProfile {
  const cubies = deserializeCube(snapshot.cubeState);
  const graph = buildStateGraph(cubies);
  const swapCount = graph.edges.filter((e) => e.type === "SWAP").length / 2; // each 2-cycle contributes 2 directed edges
  const cycleEdgeCount = graph.edges.filter((e) => e.type === "CYCLE").length;
  const conflictCount = graph.edges.filter((e) => e.type === "CONFLICT").length;
  const cycleLengths = graph.cycles.map((c) => c.length);

  return {
    hash: snapshot.hash,
    wrongWingCount: wrongWingCount5(cubies),
    swapCount,
    cycleEdgeCount,
    conflictCount,
    cycleLengths,
    longestCycleLength: cycleLengths.length ? Math.max(...cycleLengths) : 0,
  };
}

export interface ClusterStructuralSummary {
  clusterKey: string;
  profiles: ReplayStructuralProfile[];
  fractionWithCycleLenAtLeast4: number; // spec section 6's "공통 구조": how often a 4+ length cycle (beyond tryFixWing's own native 3-leg handling) is present
  avgLongestCycleLength: number;
}

export function summarizeClusterStructure(clusterKey: string, members: readonly FailureSnapshot[]): ClusterStructuralSummary {
  const profiles = members.map(analyzeReplayStructure);
  const withLongCycle = profiles.filter((p) => p.longestCycleLength >= 4).length;
  const avgLongestCycleLength = profiles.length ? profiles.reduce((s, p) => s + p.longestCycleLength, 0) / profiles.length : 0;
  return {
    clusterKey,
    profiles,
    fractionWithCycleLenAtLeast4: profiles.length ? withLongCycle / profiles.length : 0,
    avgLongestCycleLength,
  };
}
