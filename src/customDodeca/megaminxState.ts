import * as THREE from "three";
import { buildSolvedDodeca, applyRawFifthTurn } from "./dodecaState";
import { VERTICES, FACE_VERTEX_INDICES, FACE_INDICES, nearestFaceIndex, type FaceIndex } from "./dodecaMath";
import { FACES_AT_VERTEX, nearestVertexIndex, centroid } from "./kilominxState";
import type { Rng } from "./dodecaState";

/**
 * Abstract (permutation + orientation) model of the N=3 Megaminx's 20
 * corner pieces AND 30 edge pieces (its 12 face pieces are fixed centers,
 * tracked implicitly by the puzzle's own orientation -- this puzzle family
 * has no whole-puzzle reorientation move, so centers never need tracking).
 * Same spirit as kilominxState.ts (see its own top comment for why move
 * tables are derived by SIMULATION against the verified geometric engine,
 * not by hand): corner geometry is IDENTICAL to the Kilominx's own (same
 * 20 vertices, same 3-face touching structure), so this module reuses
 * kilominxState.ts's own FACES_AT_VERTEX/nearestVertexIndex/centroid
 * rather than re-deriving them.
 *
 * A corner "position" is a vertex index 0..19, exactly as in
 * kilominxState.ts. An edge "position" is an index 0..29 into EDGES (a
 * dodecahedron edge, i.e. an unordered pair of adjacent vertices) --
 * assigned by first-encounter order while walking every face's own 5
 * edges, deduped since each real edge is shared by exactly 2 faces.
 * Corner orientation is mod 3 (3 touching faces); edge orientation is mod
 * 2 (2 touching faces) -- "slot 0" is whichever of an edge's 2 touching
 * faces has the smaller face index, by convention (no CCW/CW consistency
 * concern here the way corners had: with only 2 slots, swapping which one
 * is "0" is its own inverse either way, so plain ascending sort is safe).
 */
export interface MegaminxState {
  /**
   * Int8Array, not number[]: applyMegaminxMove allocates a fresh state on
   * EVERY move application and is the dominant cost of both library
   * builds and BFS/setup search (hundreds of millions of calls over a
   * full solve+build run) -- Int8Array cuts each of these 4 arrays from
   * an 8-byte-boxed-number backing store to 1 byte/element, unboxed, cutting
   * both allocation and GC cost at that volume. All stored values (piece
   * ids 0..29, orientations 0..2) fit Int8Array's signed 8-bit range.
   */
  /** cornerPerm[pos] = the corner piece id currently sitting at vertex `pos`. */
  cornerPerm: Int8Array;
  /** cornerOrient[pos] = 0..2, mod 3. */
  cornerOrient: Int8Array;
  /** edgePerm[pos] = the edge piece id currently sitting at EDGES[pos]. */
  edgePerm: Int8Array;
  /** edgeOrient[pos] = 0..1, mod 2. */
  edgeOrient: Int8Array;
}

export interface MegaminxMoveTable {
  cornerPerm: number[];
  cornerOrientDelta: number[];
  edgePerm: number[];
  edgeOrientDelta: number[];
}

/**
 * All 30 unique dodecahedron edges, as ascending [v1, v2] pairs -- derived
 * from FACE_VERTEX_INDICES (each face's 5 consecutive-vertex pairs are its
 * own 5 edges), deduped since every edge is shared by exactly 2 faces
 * (12 faces * 5 edges / 2 = 30, matching a real Megaminx's edge count).
 * Order is deterministic (first-encounter while walking faces ascending,
 * each face's own vertices in their own stored order) but otherwise
 * arbitrary -- edge piece IDs are just labels, same as corner vertex
 * indices already are.
 */
export const EDGES: readonly (readonly [number, number])[] = (() => {
  const seen = new Map<string, readonly [number, number]>();
  for (const f of FACE_INDICES) {
    const verts = FACE_VERTEX_INDICES[f];
    for (let j = 0; j < 5; j++) {
      const a = verts[j];
      const b = verts[(j + 1) % 5];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!seen.has(key)) seen.set(key, a < b ? [a, b] : [b, a]);
    }
  }
  return [...seen.values()];
})();

/** The 2 faces touching each edge, ascending by face index (see this module's own top comment for why plain ascending sort is safe here, unlike corners' CCW requirement). */
const FACES_AT_EDGE: readonly (readonly [number, number])[] = EDGES.map(([a, b]) => {
  const faces: number[] = [];
  for (const f of FACE_INDICES) {
    const verts = FACE_VERTEX_INDICES[f];
    for (let j = 0; j < 5; j++) {
      const x = verts[j];
      const y = verts[(j + 1) % 5];
      if ((x === a && y === b) || (x === b && y === a)) faces.push(f);
    }
  }
  if (faces.length !== 2) throw new Error(`megaminxState: edge [${a},${b}] touched by ${faces.length} faces, expected 2`);
  return faces.sort((p, q) => p - q) as readonly [number, number];
});

const EDGE_MIDPOINTS: readonly THREE.Vector3[] = EDGES.map(([a, b]) => VERTICES[a].clone().add(VERTICES[b]).multiplyScalar(0.5));

/**
 * Which of the 30 EDGES a point is nearest to. An edge sticker's own
 * first two corners are both exact points ALONG its true dodecahedron
 * edge (see buildFaceStickers's own shoulderPoints -- corners[0] sits at
 * `shoulderFraction` along the edge, corners[1] at `1 - shoulderFraction`
 * from the OTHER end, so their midpoint is exactly the edge's own
 * midpoint by symmetry, regardless of shoulderFraction's value) -- so
 * `midpoint(st.corners[0], st.corners[1])` gives an EXACT match here
 * after any rigid rotation, the same way corners[1] is an exact vertex
 * match for a corner sticker in kilominxState.ts. Still implemented as
 * "nearest" (not exact equality) for floating-point robustness.
 */
function nearestEdgeIndex(p: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 30; i++) {
    const d = p.distanceToSquared(EDGE_MIDPOINTS[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Derives one move's full corner+edge (perm, orientDelta) tables by
 * actually applying it to a fresh solved geometric state and reading back
 * where every piece and orientation landed -- see this module's own top
 * comment for why (same rule as kilominxState.ts's own deriveMove, which
 * this mirrors for corners and extends for edges).
 */
function deriveMove(face: FaceIndex, sign: 1 | -1): MegaminxMoveTable {
  const scrambled = buildSolvedDodeca(3);
  applyRawFifthTurn(scrambled, face, 1, sign);

  // Corners: identical technique to kilominxState.ts's own deriveMove.
  const cornerPieceIdOfFaceTriple = new Map<string, number>();
  for (let v = 0; v < 20; v++) cornerPieceIdOfFaceTriple.set([...FACES_AT_VERTEX[v]].sort((a, b) => a - b).join(","), v);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  // Edges: same shape, keyed by physical edge index instead of vertex.
  const edgePieceIdOfFacePair = new Map<string, number>();
  for (let e = 0; e < 30; e++) edgePieceIdOfFacePair.set([...FACES_AT_EDGE[e]].sort((a, b) => a - b).join(","), e);
  const byEdge: { homeFace: number; curFace: number }[][] = Array.from({ length: 30 }, () => []);

  for (const st of scrambled.stickers) {
    if (st.pieceType === "corner") {
      const v = nearestVertexIndex(st.corners[1]);
      const curFace = nearestFaceIndex(centroid(st.corners));
      byVertex[v].push({ homeFace: st.homeFaceIndex, curFace });
    } else if (st.pieceType === "edge") {
      const e = nearestEdgeIndex(centroid([st.corners[0], st.corners[1]]));
      const curFace = nearestFaceIndex(centroid(st.corners));
      byEdge[e].push({ homeFace: st.homeFaceIndex, curFace });
    }
    // "center" stickers are fixed and not tracked (see this module's own top comment).
  }

  const cornerPerm: number[] = new Array(20).fill(-1);
  const cornerOrientDelta: number[] = new Array(20).fill(0);
  for (let v = 0; v < 20; v++) {
    const triple = byVertex[v]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = cornerPieceIdOfFaceTriple.get(triple);
    if (pieceId === undefined) throw new Error(`megaminxState: no corner piece match at vertex ${v}: [${triple}]`);
    cornerPerm[v] = pieceId;
    if (pieceId === v) continue;
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    cornerOrientDelta[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  const edgePerm: number[] = new Array(30).fill(-1);
  const edgeOrientDelta: number[] = new Array(30).fill(0);
  for (let e = 0; e < 30; e++) {
    const pair = byEdge[e]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = edgePieceIdOfFacePair.get(pair);
    if (pieceId === undefined) throw new Error(`megaminxState: no edge piece match at edge ${e}: [${pair}]`);
    edgePerm[e] = pieceId;
    if (pieceId === e) continue;
    const bySlot = [...byEdge[e]].sort((a, b) => FACES_AT_EDGE[e].indexOf(a.curFace) - FACES_AT_EDGE[e].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_EDGE[pieceId][0];
    edgeOrientDelta[e] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  return { cornerPerm, cornerOrientDelta, edgePerm, edgeOrientDelta };
}

/** MOVE_TABLE[face][0] = sign +1, MOVE_TABLE[face][1] = sign -1. */
export const MOVE_TABLE: readonly (readonly [MegaminxMoveTable, MegaminxMoveTable])[] = FACE_INDICES.map((f) => [deriveMove(f, 1), deriveMove(f, -1)] as const);

export function solvedMegaminxState(): MegaminxState {
  return {
    cornerPerm: Int8Array.from({ length: 20 }, (_, i) => i),
    cornerOrient: new Int8Array(20),
    edgePerm: Int8Array.from({ length: 30 }, (_, i) => i),
    edgeOrient: new Int8Array(30),
  };
}

export function isMegaminxSolved(state: MegaminxState): boolean {
  return state.cornerPerm.every((p, i) => p === i) && state.cornerOrient.every((o) => o === 0) && state.edgePerm.every((p, i) => p === i) && state.edgeOrient.every((o) => o === 0);
}

/** Applies one move to `state`, returning a NEW state (state is never mutated). */
export function applyMegaminxMove(state: MegaminxState, face: FaceIndex, sign: 1 | -1): MegaminxState {
  const move = MOVE_TABLE[face][sign === 1 ? 0 : 1];
  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = move.cornerPerm[pos];
    cornerPerm[pos] = state.cornerPerm[from];
    cornerOrient[pos] = (state.cornerOrient[from] + move.cornerOrientDelta[pos]) % 3;
  }
  const edgePerm = new Int8Array(30);
  const edgeOrient = new Int8Array(30);
  for (let pos = 0; pos < 30; pos++) {
    const from = move.edgePerm[pos];
    edgePerm[pos] = state.edgePerm[from];
    edgeOrient[pos] = (state.edgeOrient[from] + move.edgeOrientDelta[pos]) % 2;
  }
  return { cornerPerm, cornerOrient, edgePerm, edgeOrient };
}

export interface MegaminxTurn {
  face: FaceIndex;
  sign: 1 | -1;
}

export function randomMegaminxScramble(length = 40, rng: Rng = Math.random): MegaminxTurn[] {
  const turns: MegaminxTurn[] = [];
  let lastFace = -1;
  for (let i = 0; i < length; i++) {
    let face: FaceIndex;
    do {
      face = FACE_INDICES[Math.floor(rng() * FACE_INDICES.length)];
    } while (face === lastFace);
    lastFace = face;
    const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;
    turns.push({ face, sign });
  }
  return turns;
}

export function applyMegaminxScramble(state: MegaminxState, turns: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of turns) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
