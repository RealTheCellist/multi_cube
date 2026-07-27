// --- StructuralProfile (Deep Cycle Resolver Validation Sprint v1, RQ-1) ---
// Extends Recovery Necessity Sprint's structural feature set
// (cycleCount/cycleLength/componentCount/wrongWingCount/conflictEdgeCount/
// swapEdgeCount/parity, already established+validated) with 3 NEW
// graph-topology metrics the Directive explicitly requests
// (dependencyDepth/bridgeDistance/branchingFactor). Each new metric's
// definition is disclosed explicitly here rather than assumed, since none
// of them are pre-existing codebase concepts:
//
//   dependencyDepth -- length of the longest chain of WANTS-dependencies a
//     piece sits on before reaching a piece with no further dependency.
//     For a cycle, every node in it depends on the next all the way around,
//     so dependencyDepth = the cycle's own length (matches longestCycleLength
//     when a cycle exists). For a pure-CONFLICT case (no cycle at all --
//     CONFLICT edges form a DAG by construction, see stateGraphBuilder.ts's
//     own comment: "any WANTS edge that ISN'T part of a detected cycle"),
//     dependencyDepth is the longest directed path length through CONFLICT
//     edges alone (computed via DFS memoization -- cheap, DAG longest path).
//   bridgeDistance -- NOT a physical move-count (the WANTS-graph has no
//     concept of physical layer-turn distance between components); disclosed
//     as a simple structural proxy: (componentCount - 1), i.e. how many
//     "gaps" would need to be bridged to unify every unfinished component
//     into one. 0 for a single-component state.
//   branchingFactor -- a REAL measured quantity, not invented: for every
//     wrong wing that participates in a cycle or conflict edge (the "active"
//     WANTS-graph nodes), call the existing, unmodified
//     enumerateWingCandidates() with a small fixed budget (100ms) and
//     maxResults=10, and average the returned candidate-list lengths. This
//     is literally "how many distinct existing-library moves are available
//     to relocate this wing right now" -- a direct measurement of local
//     search breadth, used as this Sprint's branching-factor proxy.
import { cloneCubies, type Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { wrongWingCount5, wrongWings5, slotKey, enumerateWingCandidates, type WingLibrary } from "../fiveByFiveEdges";
import type { StateGraph } from "../capabilityAnalysis/capabilityTypes";

const BRANCHING_PROBE_DEADLINE_MS = 100;
const BRANCHING_PROBE_MAX_RESULTS = 10;

function longestConflictDagPath(graph: StateGraph): number {
  const conflictAdj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type !== "CONFLICT") continue;
    const list = conflictAdj.get(e.from) ?? [];
    list.push(e.to);
    conflictAdj.set(e.from, list);
  }
  const memo = new Map<string, number>();
  function longestFrom(node: string, visiting: Set<string>): number {
    if (memo.has(node)) return memo.get(node)!;
    if (visiting.has(node)) return 0; // CONFLICT edges are acyclic by construction; guard only against pathological input
    visiting.add(node);
    let best = 0;
    for (const next of conflictAdj.get(node) ?? []) {
      best = Math.max(best, 1 + longestFrom(next, visiting));
    }
    visiting.delete(node);
    memo.set(node, best);
    return best;
  }
  let overall = 0;
  for (const node of conflictAdj.keys()) overall = Math.max(overall, longestFrom(node, new Set()));
  return overall;
}

function measureBranchingFactor(cubies: Cubie[], activeSlots: Set<string>, lib: WingLibrary): number {
  const wrongs = wrongWings5(cubies).filter((w) => activeSlots.has(slotKey(w)));
  if (wrongs.length === 0) return 0;
  const deadlineBase = Date.now();
  const counts = wrongs.map((w) => enumerateWingCandidates(cubies, w, lib, deadlineBase + BRANCHING_PROBE_DEADLINE_MS, BRANCHING_PROBE_MAX_RESULTS).length);
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

export interface CycleTopology {
  cycleCount: number;
  cycleLengths: number[]; // every distinct cycle's length, longest first
  isSingleCycle: boolean; // exactly 1 cycle, 0 SWAP-only 2-cycles mixed in
  hasSwap: boolean; // any 2-cycle (mutual lock) present
}

export interface DeepCycleStructuralProfile {
  label: string;
  hasParity: boolean;
  cycleCount: number;
  cycleLength: number; // longest cycle length (0 if none)
  componentCount: number;
  wrongWingCount: number;
  conflictEdgeCount: number;
  swapEdgeCount: number;
  dependencyDepth: number;
  bridgeDistance: number;
  branchingFactor: number;
  cycleTopology: CycleTopology;
}

export function computeDeepCycleStructuralProfile(cubies: Cubie[], label: string, lib: WingLibrary): DeepCycleStructuralProfile {
  const graph = buildStateGraph(cubies);
  const stats = analyzeConstraints(graph);
  const swapEdgeCount = graph.edges.filter((e) => e.type === "SWAP").length;

  const cycleLengths = [...graph.cycles.map((c) => c.length)].sort((a, b) => b - a);
  const hasSwap = cycleLengths.some((l) => l === 2);
  const cycleTopology: CycleTopology = {
    cycleCount: graph.cycles.length,
    cycleLengths,
    isSingleCycle: graph.cycles.length === 1,
    hasSwap,
  };

  const dependencyDepth = stats.longestCycleLength > 0 ? stats.longestCycleLength : longestConflictDagPath(graph);
  const bridgeDistance = Math.max(0, stats.componentCount - 1);

  // "Active" nodes for the branching-factor probe: every node touched by a
  // CYCLE/SWAP/CONFLICT edge (i.e. every node this Sprint's structural
  // analysis actually cares about) -- not every WingNode, since SolvedPair
  // nodes never appear as `wrongWings5` members anyway.
  const activeSlots = new Set<string>();
  for (const e of graph.edges) {
    activeSlots.add(e.from);
    activeSlots.add(e.to);
  }
  const branchingFactor = measureBranchingFactor(cloneCubies(cubies), activeSlots, lib);

  return {
    label,
    hasParity: hasParity(cubies),
    cycleCount: stats.cycleCount,
    cycleLength: stats.longestCycleLength,
    componentCount: stats.componentCount,
    wrongWingCount: wrongWingCount5(cubies),
    conflictEdgeCount: stats.conflictCount,
    swapEdgeCount,
    dependencyDepth,
    bridgeDistance,
    branchingFactor,
    cycleTopology,
  };
}
