// --- ConflictGraphFeatures (CONFLICT_DEEP_DEPENDENCY Structural Mechanism
// Analysis Sprint v1, RQ-4) ---------------------------------------------------
// Extends Primitive Set Completeness Validation Sprint v2's own
// ResidualFeatureSetV2 (reused UNMODIFIED -- wrongWingCount/pairCount/
// cycleCount/cycleLength/componentCount/conflictEdgeCount/swapEdgeCount/
// cycleEdgeCount/dependencyDepth/bridgeDistance/branchingFactor, all
// already computed there) with 5 NEW features the Directive explicitly
// asks for, none of which exist anywhere else in the codebase (confirmed
// by this Sprint's own research phase): dependencyBranching,
// dependencyComponentCount, bridgeCount, sharedConflictCount,
// protectedEdgeCount. All 5 are derived purely from `StateGraph.edges`
// (buildStateGraph, unmodified, read-only) filtered to `type==="CONFLICT"`
// -- no Production file touched.
//
// Disclosed definitions (fixed before any measurement, per this arc's own
// convention):
//   - dependencyBranching: MAX out-degree among nodes in the CONFLICT-only
//     directed graph -- 1 means a simple linear chain, >1 means some node
//     has more than one outgoing dependency (a branching tree/DAG rather
//     than a chain).
//   - dependencyComponentCount: weakly-connected component count computed
//     over ONLY the CONFLICT-type edges (undirected) -- distinct from
//     ConstraintStats.componentCount, which spans ALL edge types together.
//   - bridgeCount: number of bridge (cut) edges in the CONFLICT-only
//     undirected multigraph -- brute-force removal check (graphs here are
//     <=12 nodes, so O(V*E) is trivial).
//   - sharedConflictCount: number of nodes whose combined (in+out) degree
//     within the CONFLICT-only subgraph is >1 -- nodes that participate in
//     more than one dependency edge (a "shared hub").
//   - protectedEdgeCount: count of non-CONFLICT edges (SWAP+CYCLE) present
//     in the SAME state -- an already-correct relationship a Conflict-
//     targeting fix must not disturb while resolving the dependency chain.
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { computeResidualFeatureSetV2, type ResidualFeatureSetV2 } from "../primitiveSetCompletenessV2/ResidualFeatureSetV2";
import type { WingLibrary } from "../fiveByFiveEdges";

export interface ConflictGraphFeatures extends ResidualFeatureSetV2 {
  dependencyBranching: number;
  dependencyComponentCount: number;
  bridgeCount: number;
  sharedConflictCount: number;
  protectedEdgeCount: number;
}

function conflictSubgraphComponents(nodes: string[], undirectedAdj: Map<string, Set<string>>): number {
  const visited = new Set<string>();
  let components = 0;
  for (const n of nodes) {
    if (visited.has(n)) continue;
    components++;
    const queue = [n];
    visited.add(n);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of undirectedAdj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }
  return components;
}

function countBridges(nodes: string[], undirectedEdges: [string, string][]): number {
  let bridgeCount = 0;
  for (let i = 0; i < undirectedEdges.length; i++) {
    const adj = new Map<string, Set<string>>();
    for (const n of nodes) adj.set(n, new Set());
    for (let j = 0; j < undirectedEdges.length; j++) {
      if (j === i) continue;
      const [a, b] = undirectedEdges[j];
      adj.get(a)?.add(b);
      adj.get(b)?.add(a);
    }
    const withoutEdge = conflictSubgraphComponents(nodes, adj);
    const fullAdj = new Map<string, Set<string>>();
    for (const n of nodes) fullAdj.set(n, new Set());
    for (const [a, b] of undirectedEdges) {
      fullAdj.get(a)?.add(b);
      fullAdj.get(b)?.add(a);
    }
    const withEdge = conflictSubgraphComponents(nodes, fullAdj);
    if (withoutEdge > withEdge) bridgeCount++;
  }
  return bridgeCount;
}

export function computeConflictGraphFeatures(cubies: Cubie[], label: string, lib: WingLibrary): ConflictGraphFeatures {
  const base = computeResidualFeatureSetV2(cubies, label, lib);
  const graph = buildStateGraph(cubies);
  const conflictEdges = graph.edges.filter((e) => e.type === "CONFLICT");
  const protectedEdgeCount = graph.edges.length - conflictEdges.length; // SWAP + CYCLE

  const outDegree = new Map<string, number>();
  const degree = new Map<string, number>();
  const conflictNodes = new Set<string>();
  const undirectedEdges: [string, string][] = [];
  for (const e of conflictEdges) {
    conflictNodes.add(e.from);
    conflictNodes.add(e.to);
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    undirectedEdges.push([e.from, e.to]);
  }

  const dependencyBranching = conflictNodes.size ? Math.max(0, ...Array.from(outDegree.values())) : 0;
  const sharedConflictCount = Array.from(degree.values()).filter((d) => d > 1).length;

  const nodesArr = Array.from(conflictNodes);
  const undirectedAdj = new Map<string, Set<string>>();
  for (const n of nodesArr) undirectedAdj.set(n, new Set());
  for (const [a, b] of undirectedEdges) {
    undirectedAdj.get(a)?.add(b);
    undirectedAdj.get(b)?.add(a);
  }
  const dependencyComponentCount = nodesArr.length ? conflictSubgraphComponents(nodesArr, undirectedAdj) : 0;
  const bridgeCount = nodesArr.length ? countBridges(nodesArr, undirectedEdges) : 0;

  return { ...base, dependencyBranching, dependencyComponentCount, bridgeCount, sharedConflictCount, protectedEdgeCount };
}
