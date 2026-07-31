// --- GraphTopologyAnalysis (Deep Cycle Subtype Discovery Sprint v1,
// STEP1 support) --------------------------------------------------------
// Computes graph-theoretic features over the same real WANTS graph
// capabilityAnalysis/stateGraphBuilder.ts's buildStateGraph() (unmodified)
// and capabilityAnalysis/constraintAnalyzer.ts's analyzeConstraints()
// (unmodified) already build -- but analyzeConstraints() only returns
// aggregate stats (componentCount, cycleCount, ...), not the underlying
// undirected adjacency, which articulation-point/biconnected-component
// detection needs. This file re-derives that adjacency from the SAME real
// edges (graph.edges, graph.cycles), using the identical
// unfinished-slots-only, undirected-adjacency construction
// analyzeConstraints() itself uses internally (disclosed re-derivation,
// not a new graph -- no fabricated structure).
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import type { StateGraph } from "../capabilityAnalysis/capabilityTypes";

export interface GraphTopologyFeatures {
  articulationPointCount: number;
  biconnectedComponentCount: number;
  cycleOverlap: boolean; // do 2+ distinct cycles share at least one node?
  cycleDensity: number; // distinct nodes appearing in ANY cycle / total unfinished nodes
  conflictAdjacentToCycle: boolean; // does any CONFLICT edge touch a node that's also part of a cycle?
  pairGraphDensity: number; // SolvedPair node count / total node count (12 canonical slots)
}

function buildUndirectedAdjacency(graph: StateGraph): { unfinishedSlots: string[]; adj: Map<string, Set<string>> } {
  const unfinishedSlots = graph.nodes.filter((n) => n.type !== "SolvedPair").map((n) => n.slot);
  const adj = new Map<string, Set<string>>();
  for (const slot of unfinishedSlots) adj.set(slot, new Set());
  for (const e of graph.edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }
  return { unfinishedSlots, adj };
}

// Standard Tarjan's articulation-point / biconnected-component algorithm
// (disc/low arrays), applied to the undirected WANTS-graph adjacency built
// above. The graph has at most 12 nodes (one per canonical edge slot), so
// a plain recursive DFS is more than fast enough -- no need for an
// iterative rewrite.
function findArticulationPointsAndBiconnectedComponents(unfinishedSlots: string[], adj: Map<string, Set<string>>): { articulationPoints: Set<string>; biconnectedComponentCount: number } {
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationPoints = new Set<string>();
  const edgeStack: string[] = [];
  let biconnectedComponentCount = 0;
  let timer = 0;

  function popComponentUntil(target: string): void {
    biconnectedComponentCount++;
    while (edgeStack.length && edgeStack[edgeStack.length - 1] !== target) edgeStack.pop();
    if (edgeStack.length) edgeStack.pop();
  }

  function dfs(u: string): void {
    disc.set(u, timer);
    low.set(u, timer);
    timer++;
    let children = 0;

    for (const v of adj.get(u) ?? []) {
      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        edgeStack.push(`${u}-${v}`);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        if ((parent.get(u) === null || parent.get(u) === undefined) && children > 1) articulationPoints.add(u);
        if (parent.get(u) !== null && parent.get(u) !== undefined && low.get(v)! >= disc.get(u)!) articulationPoints.add(u);
        if (low.get(v)! >= disc.get(u)!) popComponentUntil(`${u}-${v}`);
      } else if (v !== parent.get(u) && disc.get(v)! < disc.get(u)!) {
        edgeStack.push(`${u}-${v}`);
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const slot of unfinishedSlots) {
    if (disc.has(slot)) continue;
    parent.set(slot, null);
    dfs(slot);
    if (edgeStack.length) biconnectedComponentCount++;
    edgeStack.length = 0;
  }

  return { articulationPoints, biconnectedComponentCount };
}

export function computeGraphTopology(cubies: Cubie[]): GraphTopologyFeatures {
  const graph = buildStateGraph(cubies);
  const { unfinishedSlots, adj } = buildUndirectedAdjacency(graph);
  const { articulationPoints, biconnectedComponentCount } = findArticulationPointsAndBiconnectedComponents(unfinishedSlots, adj);

  const cycleNodeSets = graph.cycles.map((c) => new Set(c));
  let cycleOverlap = false;
  for (let i = 0; i < cycleNodeSets.length && !cycleOverlap; i++) {
    for (let j = i + 1; j < cycleNodeSets.length && !cycleOverlap; j++) {
      for (const node of cycleNodeSets[i]) {
        if (cycleNodeSets[j].has(node)) {
          cycleOverlap = true;
          break;
        }
      }
    }
  }

  const nodesInAnyCycle = new Set<string>();
  for (const c of graph.cycles) for (const node of c) nodesInAnyCycle.add(node);
  const cycleDensity = unfinishedSlots.length > 0 ? nodesInAnyCycle.size / unfinishedSlots.length : 0;

  const conflictAdjacentToCycle = graph.edges.some((e) => e.type === "CONFLICT" && (nodesInAnyCycle.has(e.from) || nodesInAnyCycle.has(e.to)));

  const pairGraphDensity = graph.nodes.length > 0 ? graph.nodes.filter((n) => n.type === "SolvedPair").length / graph.nodes.length : 0;

  return {
    articulationPointCount: articulationPoints.size,
    biconnectedComponentCount,
    cycleOverlap,
    cycleDensity,
    conflictAdjacentToCycle,
    pairGraphDensity,
  };
}
