// --- ShadowBFS (First-Hop Failure Analysis Sprint v1) -----------------------
// Spec STEP 2's "BFS 내부 Failure Trace". fiveByFiveEdges.ts's own
// bfsMoveWingToPosition() is PRIVATE (not exported) and this Sprint forbids
// modifying that file at all -- so there is no way to literally instrument
// the real search. This is a disclosed, INDEPENDENT re-implementation of
// the same search STRUCTURE (same maxDepth semantics, same 12-move safe
// set via the EXPORTED allOuterMoves(), same "pin the target wing in
// place" constraint tryFixWing's own comment describes), built entirely
// from real Cubie clones + exported functions, used ONLY to characterize
// search cost/termination for replays where enumerateWingCandidates()
// (the real, exported, unmodified function) already found NOTHING --
// never to fabricate a "fix" the real Solver doesn't have.
//
// Runs at a SMALLER node budget (1500 vs the real bfsMoveWingToPosition's
// 8000) for tractability across the small number of replays this Sprint
// actually needs it for -- disclosed, not hidden.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, allOuterMoves, type Move } from "../fiveByFiveEdges";

export const SHADOW_NODE_BUDGET = 1500;

export type ShadowTerminationReason = "FOUND" | "EXHAUSTED_DEPTH" | "NODE_BUDGET_EXCEEDED";

export interface ShadowBFSResult {
  found: boolean;
  path: Move[] | null;
  queueSizePerDepth: number[];
  nodesVisited: number;
  maxDepthReached: number;
  branchFactor: number; // avg children actually enqueued per expanded node
  terminationReason: ShadowTerminationReason;
}

function posKeyOf(c: Cubie): string {
  const r = (n: number) => Math.round(n * 2) / 2;
  return `${r(c.position.x)},${r(c.position.y)},${r(c.position.z)}`;
}

function stateKeyOf(cubies: readonly Cubie[]): string {
  return cubies.map((c) => `${c.id}:${posKeyOf(c)}`).join("|");
}

/**
 * Moves the piece with id `pieceId` to `targetPosKey`, pinning the piece
 * with id `pinnedId` at `pinnedPosKey` for the whole search (mirroring
 * tryFixWing's own documented "pin w at p1" safety requirement).
 */
export function shadowBFSMoveToPosition(
  cubies: Cubie[],
  pieceId: number,
  targetPosKey: string,
  pinnedId: number,
  pinnedPosKey: string,
  maxDepth: number,
  nodeBudget: number = SHADOW_NODE_BUDGET
): ShadowBFSResult {
  const safe = allOuterMoves().flat();
  let frontier: { cubies: Cubie[]; path: Move[] }[] = [{ cubies, path: [] }];
  const seen = new Set<string>([stateKeyOf(cubies)]);
  const queueSizePerDepth: number[] = [];
  let nodesVisited = 0;
  let expandedNodes = 0;
  let childrenEnqueued = 0;
  let maxDepthReached = 0;

  const startPiece = cubies.find((c) => c.id === pieceId);
  if (startPiece && posKeyOf(startPiece) === targetPosKey) {
    return { found: true, path: [], queueSizePerDepth: [1], nodesVisited: 0, maxDepthReached: 0, branchFactor: 0, terminationReason: "FOUND" };
  }

  for (let depth = 0; depth < maxDepth; depth++) {
    queueSizePerDepth.push(frontier.length);
    maxDepthReached = depth;
    const next: { cubies: Cubie[]; path: Move[] }[] = [];

    for (const node of frontier) {
      for (const move of safe) {
        nodesVisited++;
        expandedNodes++;
        if (nodesVisited > nodeBudget) {
          return { found: false, path: null, queueSizePerDepth, nodesVisited, maxDepthReached, branchFactor: expandedNodes ? childrenEnqueued / expandedNodes : 0, terminationReason: "NODE_BUDGET_EXCEEDED" };
        }

        const childCubies = cloneCubies(node.cubies);
        applySeq(childCubies, [move]);

        const pinned = childCubies.find((c) => c.id === pinnedId);
        if (pinned && posKeyOf(pinned) !== pinnedPosKey) continue;

        const path = [...node.path, move];
        const piece = childCubies.find((c) => c.id === pieceId)!;
        if (posKeyOf(piece) === targetPosKey) {
          return { found: true, path, queueSizePerDepth, nodesVisited, maxDepthReached: depth + 1, branchFactor: expandedNodes ? childrenEnqueued / expandedNodes : 0, terminationReason: "FOUND" };
        }

        const key = stateKeyOf(childCubies);
        if (seen.has(key)) continue;
        seen.add(key);
        childrenEnqueued++;
        next.push({ cubies: childCubies, path });
      }
    }

    frontier = next;
    if (frontier.length === 0) break;
  }

  return {
    found: false,
    path: null,
    queueSizePerDepth,
    nodesVisited,
    maxDepthReached,
    branchFactor: expandedNodes ? childrenEnqueued / expandedNodes : 0,
    terminationReason: "EXHAUSTED_DEPTH",
  };
}
