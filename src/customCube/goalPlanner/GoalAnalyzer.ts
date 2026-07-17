// --- GoalAnalyzer (GOSP prototype) -------------------------------------------
// The Goal Search + State Graph builder (spec sections 8, 9, 10). Explores
// real state transitions reachable from a Failure Replay's raw state by
// re-executing EXISTING Primitives (BASE/FLIP/CASE/PARITY -- see GoalState.ts
// for why RECOVERY is excluded), never inventing a new one, never touching
// fiveByFiveEdges.ts/fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts.
//
// Every function called below (tryFixWing/tryFlipWingsInPlace/
// tryExactCaseMatch/bestFixOverall/tryEndgameMultiPly) is an EXISTING public
// export, called exactly the way capabilityAnalysis/primitiveCapabilityTester.ts
// already does -- this file only adds its OWN configurable, smaller
// per-attempt deadline (spec doesn't require reproducing production's 400ms
// capability-test budget; a graph search visiting dozens of nodes needs a
// cheaper per-node cost, see GoalState.ts's DEFAULT_GOAL_SEARCH_OPTIONS).
import { cloneCubies, type Cubie } from "../cubeState";
import {
  applySeq,
  bestFixOverall,
  tryEndgameMultiPly,
  tryExactCaseMatch,
  tryFixWing,
  tryFlipWingsInPlace,
  wrongWingCount5,
  wrongWings5,
  type Move,
} from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { analyzeEdgeSlots, detectEdgeSlotPattern } from "../fiveByFiveHumanEdges";
import { computeEdgeSolverStateHash } from "../fiveByFiveEdgeStateHash";
import {
  ALL_GOAL_PRIMITIVES,
  type GoalPrimitiveName,
  type GoalSearchOptions,
  type GoalStateEdge,
  type GoalStateNode,
  type StateGraph,
} from "./GoalState";
import type { GoalCandidate, GoalConditionFlag } from "./GoalDescriptor";

function pairCountOf(cubies: Cubie[]): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

function hasParity(cubies: Cubie[]): boolean {
  return analyzeEdgeSlots(cubies).some((s) => s.pairedCount < 2 && detectEdgeSlotPattern(s) === "unpaired");
}

function hashOf(cubies: Cubie[]): string {
  return computeEdgeSolverStateHash(cubies).toString(16);
}

/** Tries ONE named Primitive against `cubies` (a scratch clone the caller
 * owns), returning the moves it applied (already committed to `cubies`) or
 * null if it made no progress within `deadline`. Mirrors
 * primitiveCapabilityTester.ts's own BASE/FLIP/CASE/PARITY branches exactly,
 * just parameterized by deadline instead of a hardcoded constant. */
function tryApplyPrimitive(cubies: Cubie[], primitive: GoalPrimitiveName, libs: ExecutorLibraries, deadline: number): Move[] | null {
  if (primitive === "BASE") {
    for (const w of wrongWings5(cubies)) {
      if (Date.now() > deadline) break;
      const fix = tryFixWing(cubies, w, libs.lib, deadline);
      if (fix && fix.length > 0) {
        applySeq(cubies, fix);
        return fix;
      }
    }
    return null;
  }
  if (primitive === "FLIP") {
    const before = wrongWingCount5(cubies);
    for (const w of wrongWings5(cubies)) {
      if (Date.now() > deadline) break;
      const fix = tryFlipWingsInPlace(cubies, w, libs.flipLib, before);
      if (fix && fix.length > 0) {
        applySeq(cubies, fix);
        return fix;
      }
    }
    return null;
  }
  if (primitive === "CASE") {
    const fix = tryExactCaseMatch(cubies, libs.caseLib, deadline);
    if (fix && fix.length > 0) {
      applySeq(cubies, fix);
      return fix;
    }
    return null;
  }
  // PARITY
  let fix = bestFixOverall(cubies, libs.lib, libs.flipLib, deadline);
  if (!fix || fix.length === 0) fix = tryEndgameMultiPly(cubies, libs.lib, libs.flipLib, deadline);
  if (fix && fix.length > 0) {
    applySeq(cubies, fix);
    return fix;
  }
  return null;
}

interface QueueItem {
  hash: string;
  cubies: Cubie[];
  depth: number;
}

/**
 * BFS over real cube states reachable from `rootCubies` by repeatedly
 * re-executing the 4 existing Primitives (spec section 8: "Failure State ->
 * 기존 Primitive 적용 -> State 기록 -> ..."). Deduplicates by Cube Hash (spec
 * section 9's Node), bounded by `options.maxDepth`/`options.maxNodesPerReplay`
 * to keep the search tractable across many replays.
 */
export function exploreStateGraph(
  rootCubies: Cubie[],
  libs: ExecutorLibraries,
  replayHash: string,
  clusterKey: string,
  options: GoalSearchOptions
): StateGraph {
  const rootHash = hashOf(rootCubies);
  const nodesByHash = new Map<string, GoalStateNode>();
  const edges: GoalStateEdge[] = [];

  nodesByHash.set(rootHash, {
    hash: rootHash,
    depth: 0,
    wrongWingCount: wrongWingCount5(rootCubies),
    pairCount: pairCountOf(rootCubies),
    parity: hasParity(rootCubies),
    parentHash: null,
    viaPrimitive: null,
    moveCountFromParent: 0,
    explored: false,
    successfulPrimitivesFromHere: [],
  });

  const queue: QueueItem[] = [{ hash: rootHash, cubies: rootCubies, depth: 0 }];
  let nodesExplored = 0;

  while (queue.length > 0 && nodesExplored < options.maxNodesPerReplay) {
    const current = queue.shift()!;
    const node = nodesByHash.get(current.hash)!;
    if (node.explored) continue; // already expanded via a shorter/earlier path
    nodesExplored++;
    node.explored = true;

    if (current.depth >= options.maxDepth) continue;

    const succeeded: GoalPrimitiveName[] = [];
    for (const primitive of ALL_GOAL_PRIMITIVES) {
      const clone = cloneCubies(current.cubies);
      const deadline = Date.now() + options.primitiveDeadlineMs;
      const applied = tryApplyPrimitive(clone, primitive, libs, deadline);
      if (!applied || applied.length === 0) continue;

      succeeded.push(primitive);
      const childHash = hashOf(clone);
      edges.push({ from: current.hash, to: childHash, primitive, moves: applied });

      if (!nodesByHash.has(childHash)) {
        nodesByHash.set(childHash, {
          hash: childHash,
          depth: current.depth + 1,
          wrongWingCount: wrongWingCount5(clone),
          pairCount: pairCountOf(clone),
          parity: hasParity(clone),
          parentHash: current.hash,
          viaPrimitive: primitive,
          moveCountFromParent: applied.length,
          explored: false,
          successfulPrimitivesFromHere: [],
        });
        queue.push({ hash: childHash, cubies: clone, depth: current.depth + 1 });
      }
    }
    node.successfulPrimitivesFromHere = succeeded;
  }

  return { replayHash, clusterKey, rootHash, nodes: [...nodesByHash.values()], edges };
}

function goalSignature(node: GoalStateNode): string {
  return `w${node.wrongWingCount}|p${node.parity ? 1 : 0}`;
}

/** Reconstructs the root->node primitive/move path by walking parentHash
 * pointers backward then reversing -- edges are looked up by (from,to,
 * primitive) triple since a node may be reachable via more than one edge in
 * principle, but only the FIRST-discovered path (the one that created this
 * node, i.e. matches node.parentHash/viaPrimitive) is ever used here. */
function reconstructPath(graph: StateGraph, node: GoalStateNode): { primitives: GoalPrimitiveName[]; moves: Move[] } {
  const nodesByHash = new Map(graph.nodes.map((n) => [n.hash, n]));
  const primitives: GoalPrimitiveName[] = [];
  const moveChunks: Move[][] = [];
  let cursor: GoalStateNode | undefined = node;

  while (cursor && cursor.parentHash) {
    const parent = nodesByHash.get(cursor.parentHash);
    const edge = graph.edges.find((e) => e.from === cursor!.parentHash && e.to === cursor!.hash && e.primitive === cursor!.viaPrimitive);
    if (!parent || !edge || !cursor.viaPrimitive) break;
    primitives.unshift(cursor.viaPrimitive);
    moveChunks.unshift(edge.moves);
    cursor = parent;
  }

  return { primitives, moves: moveChunks.flat() };
}

/** Every one of `graph`'s non-root, EXPLORED nodes that satisfies at least
 * one of spec section 10's 4 conditions, relative to the root's own
 * baseline metrics. */
export function extractGoalCandidates(graph: StateGraph): GoalCandidate[] {
  const root = graph.nodes.find((n) => n.hash === graph.rootHash);
  if (!root) return [];

  const rootDiversity = root.successfulPrimitivesFromHere.length;
  const rootBaseSuccess = root.successfulPrimitivesFromHere.includes("BASE");

  const candidates: GoalCandidate[] = [];
  for (const node of graph.nodes) {
    if (node.hash === graph.rootHash) continue;
    if (!node.explored) continue; // never tested -- can't claim anything about it

    const diversity = node.successfulPrimitivesFromHere.length;
    const baseSuccess = node.successfulPrimitivesFromHere.includes("BASE");

    const satisfied: GoalConditionFlag[] = [];
    if (baseSuccess && !rootBaseSuccess) satisfied.push("baseSuccessUp");
    if (node.wrongWingCount < root.wrongWingCount) satisfied.push("wrongWingDown");
    if (node.pairCount >= root.pairCount) satisfied.push("pairStabilityUp");
    if (diversity > rootDiversity) satisfied.push("primitiveDiversityUp");
    if (satisfied.length === 0) continue;

    const { primitives, moves } = reconstructPath(graph, node);

    candidates.push({
      replayHash: graph.replayHash,
      clusterKey: graph.clusterKey,
      goalHash: node.hash,
      goalSignature: goalSignature(node),
      primitiveSequence: primitives,
      moveSequence: moves,
      reachCost: node.depth,
      wrongWingBefore: root.wrongWingCount,
      wrongWingAfter: node.wrongWingCount,
      pairBefore: root.pairCount,
      pairAfter: node.pairCount,
      parityBefore: root.parity,
      parityAfter: node.parity,
      primitiveDiversityBefore: rootDiversity,
      primitiveDiversityAfter: diversity,
      baseSuccessBefore: rootBaseSuccess,
      baseSuccessAfter: baseSuccess,
      satisfiedConditions: satisfied,
      goalScore: null,
    });
  }
  return candidates;
}
