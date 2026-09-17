// Bridges the 3D scene's sticker-level state (src/customTetra/) and the N=6
// solver's piece-level RoyalPyraminxState / move-name strings.
//
// The piece-index numbering here MUST match royalPyraminxMoves.ts's already-
// embedded tables exactly (its commutators hardcode specific slot numbers
// like buffer=20) -- so this reuses the IDENTICAL union-find/shared-corner
// grouping algorithm that originally derived those tables (see that file's
// "Regeneration note"), rather than inventing a fresh (and possibly
// differently-numbered) piece labeling.
import type * as THREE from "three";
import { precompute, patternFromState, type TetraMove } from "../../customTetra/masterTetraminxSolver";
import { buildSolvedTetra, type PieceType, type TetraState } from "../../customTetra/tetraState";
import { ALL_ROYAL_MOVE_NAMES } from "./royalPyraminxMoves";
import { createSolvedRoyalState, type RoyalPyraminxState } from "./royalPyraminxState";

const ROYAL_LAYER_COUNT = 6;

interface SlotPieceInfo {
  type: PieceType;
  pieceIndex: number;
  orderInGroup: number;
  groupSize: number;
}

interface PieceGrouping {
  slotToPiece: SlotPieceInfo[];
  groupsByType: Record<PieceType, number[][]>;
}

let cachedGrouping: PieceGrouping | null = null;

/** Groups N=6's 144 sticker slots into physical pieces via shared-edge
 * (>=2 common 3D corner points) union-find at the solved state -- same
 * technique, same deterministic ordering (group by type, then sort by each
 * group's minimum slot id; within a group, canonical order = ascending
 * homeFaceIndex) as the offline derivation that produced
 * royalPyraminxMoves.ts. */
function buildPieceGrouping(): PieceGrouping {
  if (cachedGrouping) return cachedGrouping;

  const solved = buildSolvedTetra(ROYAL_LAYER_COUNT);
  const stickers = solved.stickers;
  const n = stickers.length;
  const EPS = 1e-6;
  const pointsClose = (a: THREE.Vector3, b: THREE.Vector3) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.z - b.z) < EPS;

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (stickers[i].homeFaceIndex === stickers[j].homeFaceIndex) continue;
      let shared = 0;
      for (const ca of stickers[i].corners) for (const cb of stickers[j].corners) if (pointsClose(ca, cb)) shared++;
      if (shared >= 2) union(i, j);
    }
  }

  const groupsByRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groupsByRoot.has(r)) groupsByRoot.set(r, []);
    groupsByRoot.get(r)!.push(i);
  }

  const groupsByType: Record<PieceType, number[][]> = { tip: [], edge: [], axial: [], center: [] };
  for (const [, members] of groupsByRoot) {
    const type = stickers[members[0]].pieceType;
    const sorted = members.slice().sort((a, b) => stickers[a].homeFaceIndex - stickers[b].homeFaceIndex);
    groupsByType[type].push(sorted);
  }
  (Object.keys(groupsByType) as PieceType[]).forEach((type) => {
    groupsByType[type].sort((a, b) => Math.min(...a) - Math.min(...b));
  });

  const slotToPiece = new Array<SlotPieceInfo>(n);
  (Object.keys(groupsByType) as PieceType[]).forEach((type) => {
    groupsByType[type].forEach((group, pieceIndex) => {
      group.forEach((slot, orderInGroup) => {
        slotToPiece[slot] = { type, pieceIndex, orderInGroup, groupSize: group.length };
      });
    });
  });

  cachedGrouping = { slotToPiece, groupsByType };
  return cachedGrouping;
}

/**
 * Converts the scene's live sticker state into a RoyalPyraminxState, by
 * matching live sticker centroids back to solved-reference slots
 * (patternFromState, the same technique masterTetraminxSolver.ts's own
 * solvers use), then projecting that sticker-level occupancy onto the piece
 * groups above -- the live-state analog of what derive_move_tables.mjs did
 * for a single move's precomputed permutation.
 */
export function sceneStateToRoyalState(state: TetraState): RoyalPyraminxState {
  const pre = precompute(ROYAL_LAYER_COUNT);
  const { slotToPiece, groupsByType } = buildPieceGrouping();
  const pattern = patternFromState(state, pre); // pattern[slot] = sticker id now occupying slot

  const result = createSolvedRoyalState();
  const targets: Record<PieceType, { perm: Uint8Array; ori?: Uint8Array }> = {
    tip: { perm: result.tips, ori: result.tipOri },
    edge: { perm: result.edges, ori: result.edgeOri },
    axial: { perm: result.axial },
    center: { perm: result.centers },
  };

  (Object.keys(groupsByType) as PieceType[]).forEach((type) => {
    const target = targets[type];
    groupsByType[type].forEach((qGroup, qPieceIndex) => {
      const occupants = qGroup.map((slot) => pattern[slot]);
      const srcInfo = occupants.map((id) => slotToPiece[id]);
      target.perm[qPieceIndex] = srcInfo[0].pieceIndex;
      if (target.ori) {
        const size = srcInfo[0].groupSize;
        target.ori[qPieceIndex] = ((srcInfo[0].orderInGroup % size) + size) % size;
      }
    });
  });

  return result;
}

let cachedMoveNameToTetraMove: ReadonlyMap<string, TetraMove> | null = null;

/**
 * royalPyraminxMoves.ts's ALL_ROYAL_MOVE_NAMES was generated by iterating
 * precompute(6).allMoves in order (see generate_ts.mjs/derive_move_tables.mjs)
 * -- so zipping the two arrays by index gives an exact name<->TetraMove
 * correspondence, with no need to re-parse the move-name string convention
 * (axis letter/depth token/direction suffix) by hand.
 */
function moveNameToTetraMoveMap(): ReadonlyMap<string, TetraMove> {
  if (cachedMoveNameToTetraMove) return cachedMoveNameToTetraMove;
  const pre = precompute(ROYAL_LAYER_COUNT);
  const map = new Map<string, TetraMove>();
  pre.allMoves.forEach((move, i) => map.set(ALL_ROYAL_MOVE_NAMES[i], move));
  cachedMoveNameToTetraMove = map;
  return map;
}

export function royalMoveNamesToTetraMoves(names: readonly string[]): TetraMove[] {
  const map = moveNameToTetraMoveMap();
  return names.map((name) => {
    const move = map.get(name);
    if (!move) throw new Error(`royalMoveNamesToTetraMoves: unknown move name "${name}"`);
    return move;
  });
}
