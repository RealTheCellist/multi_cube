// --- StateGraphAtlas (Coverage Hole Discovery Sprint v1, Phase 1 STEP5) ---
// Scoping disclosure: the Master Directive's "State Graph 생성" cannot
// literally mean a full reachability graph over the entire 5x5 wing-pairing
// state space -- that space is astronomically large (12 wing slots x up to
// 24 wing pieces under full scramble) and no BFS/DFS over it is tractable.
// What IS tractable, and what this whole research arc has already
// established as its working notion of "state graph" (capabilityAnalysis/
// stateGraphBuilder.ts, reused unmodified by MultiCycleAnalyzer,
// ParityStructureAnalyzer, and now this module), is the per-CASE WANTS/
// constraint graph: 12 canonical slot nodes, directed WANTS edges
// classified as SWAP/CYCLE/CONFLICT. This module's job is to aggregate that
// existing per-case graph across the whole Hole Dataset into one Atlas: a
// shape-frequency summary plus one full representative graph per Dead State
// Cluster (STEP2), which is what Phase 2 (Structural State Classification)
// needs to build a State Taxonomy from.
import type { ConstraintEdgeType, StateGraph, WingNodeType } from "../capabilityAnalysis/capabilityTypes";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import type { HoleCase } from "./HoleDatasetBuilder";
import type { DeadStateCluster } from "./DeadStateClusterAnalysis";

export interface GraphShapeSummary {
  label: string;
  nodeTypeCounts: Record<WingNodeType, number>;
  edgeTypeCounts: Record<ConstraintEdgeType, number>;
  cycleCount: number;
  cycleLengths: number[];
}

function summarizeGraph(label: string, graph: StateGraph): GraphShapeSummary {
  const nodeTypeCounts: Record<WingNodeType, number> = { SolvedPair: 0, WingPair: 0, BrokenPair: 0 };
  for (const n of graph.nodes) nodeTypeCounts[n.type]++;
  const edgeTypeCounts: Record<ConstraintEdgeType, number> = { SWAP: 0, CYCLE: 0, CONFLICT: 0 };
  for (const e of graph.edges) edgeTypeCounts[e.type]++;
  return {
    label,
    nodeTypeCounts,
    edgeTypeCounts,
    cycleCount: graph.cycles.length,
    cycleLengths: graph.cycles.map((c) => c.length),
  };
}

export interface CoverageStateGraphAtlas {
  shapeSummaries: GraphShapeSummary[];
  // One full StateGraph per Dead State Cluster (STEP2), keyed by the
  // cluster's own composite key -- the representative is the cluster's
  // first member, giving Phase 2 one concrete graph to inspect per
  // mechanism class instead of every single case's full graph (which would
  // be redundant within a cluster by construction).
  representativeGraphsByCluster: Record<string, { representativeLabel: string; graph: StateGraph }>;
  aggregateNodeTypeCounts: Record<WingNodeType, number>;
  aggregateEdgeTypeCounts: Record<ConstraintEdgeType, number>;
}

export function buildStateGraphAtlas(holes: HoleCase[], clusters: DeadStateCluster[]): CoverageStateGraphAtlas {
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const shapeSummaries: GraphShapeSummary[] = holes.map((h) => summarizeGraph(h.label, buildStateGraph(h.cubies)));

  const representativeGraphsByCluster: CoverageStateGraphAtlas["representativeGraphsByCluster"] = {};
  for (const cluster of clusters) {
    const representativeLabel = cluster.members[0];
    const hole = holesByLabel.get(representativeLabel);
    if (!hole) continue;
    representativeGraphsByCluster[cluster.key] = { representativeLabel, graph: buildStateGraph(hole.cubies) };
  }

  const aggregateNodeTypeCounts: Record<WingNodeType, number> = { SolvedPair: 0, WingPair: 0, BrokenPair: 0 };
  const aggregateEdgeTypeCounts: Record<ConstraintEdgeType, number> = { SWAP: 0, CYCLE: 0, CONFLICT: 0 };
  for (const s of shapeSummaries) {
    for (const k of Object.keys(aggregateNodeTypeCounts) as WingNodeType[]) aggregateNodeTypeCounts[k] += s.nodeTypeCounts[k];
    for (const k of Object.keys(aggregateEdgeTypeCounts) as ConstraintEdgeType[]) aggregateEdgeTypeCounts[k] += s.edgeTypeCounts[k];
  }

  return { shapeSummaries, representativeGraphsByCluster, aggregateNodeTypeCounts, aggregateEdgeTypeCounts };
}
