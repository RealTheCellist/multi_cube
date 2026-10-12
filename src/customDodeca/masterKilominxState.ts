import * as THREE from "three";
import { buildSolvedDodeca, applyRawFifthTurn, type DodecaState, type RawDodecaTurn } from "./dodecaState";
import { VERTICES, FACE_VERTEX_INDICES, FACE_INDICES, nearestFaceIndex, type FaceIndex } from "./dodecaMath";
import { FACES_AT_VERTEX, nearestVertexIndex, centroid } from "./kilominxState";
import { EDGES } from "./megaminxState";
export { EDGES };
import type { Rng } from "./dodecaState";

/**
 * Abstract (permutation + orientation) model of the N=4 Master Kilominx's
 * 20 corner pieces AND 30 edge pieces. Same spirit as kilominxState.ts/
 * megaminxState.ts: move tables are derived by SIMULATION against the
 * verified geometric engine, not hand-derived -- corner geometry is
 * IDENTICAL to Kilominx/Megaminx's own (same 20 vertices), and edge
 * geometry uses the same 30-edge structure as Megaminx's EDGES, so both
 * are reused directly rather than re-derived.
 *
 * Piece structure was discovered empirically (not assumed), by unioning
 * stickers that keep sharing a literal 3D corner point across every
 * depth=1 move (co-movement under a single turn is NOT sufficient --
 * one turn moves many distinct pieces at once):
 * - 20 CORNER pieces, 3 stickers each -- same as every other size.
 * - 30 EDGE pieces, 4 stickers each (2 per adjacent face, not split into
 *   2 independent "wing" pieces the way N=5's wings are) -- a real
 *   Master Kilominx's edge piece is ONE physical chunk spanning the full
 *   width of the edge. Orientation is still mod 2 (the piece as a whole
 *   can only sit "normal" or "flipped" at any edge position; the 2
 *   stickers on the same face can't individually reorder, since they're
 *   part of one rigid piece whose shape fixes their relative order).
 * - 12 "inner wedge" pieces (pieceType "corner", N=4 has no even-N
 *   "center" pieceType), 5 stickers each, ALWAYS all on the same single
 *   home face -- confirmed empirically to NEVER migrate to another face
 *   under any depth=1 move. Since every sticker on one face shares that
 *   face's single color (dodecaState.ts's own buildFaceStickers), and
 *   isSolved() only checks each sticker's CURRENT face against its HOME
 *   face (dodecaState.ts's isSolved), these pieces can never visibly
 *   leave solved-looking state -- they need NO solver tracking at all,
 *   same as how Megaminx's own true fixed centers need none.
 *
 * Depth>=2 turns are deliberately NOT modeled here: the live game only
 * ever applies depth=1 swipes (dodecaSwipeControls.ts's TURN_DEPTH=1,
 * hardcoded for every puzzle size), and dodecaState.ts's generic
 * depth-from-face distance classification was found (empirically, same
 * investigation as above) to sweep inconsistent, piece-unaware subsets of
 * the 12 inner-wedge pieces at depth>=2 for N=4 specifically -- the exact
 * bug class GIGAMINX_SOLVE_PRODUCTION_ACCEPTANCE_V1 already found and
 * fixed for N=5's fixed centers, left unexplored here since depth>=2 isn't
 * a validated real move for this puzzle size at all.
 */
export interface MasterKilominxState {
  /** cornerPerm[pos] = the corner piece id currently sitting at vertex `pos`. */
  cornerPerm: Int8Array;
  /** cornerOrient[pos] = 0..2, mod 3. */
  cornerOrient: Int8Array;
  /** edgePerm[pos] = the edge piece id currently sitting at EDGES[pos]. */
  edgePerm: Int8Array;
  /** edgeOrient[pos] = 0..1, mod 2. */
  edgeOrient: Int8Array;
}

export interface MasterKilominxMoveTable {
  cornerPerm: number[];
  cornerOrientDelta: number[];
  edgePerm: number[];
  edgeOrientDelta: number[];
}

/** The 2 faces touching each edge, ascending by face index -- same convention as megaminxState.ts's own FACES_AT_EDGE. */
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
  if (faces.length !== 2) throw new Error(`masterKilominxState: edge [${a},${b}] touched by ${faces.length} faces, expected 2`);
  return faces.sort((p, q) => p - q) as readonly [number, number];
});

/**
 * Point-to-segment distance against each of the 30 real dodecahedron
 * edges (not a nearest-midpoint check against `corners[0]/[1]`, the
 * megaminxState.ts convention): N=4's 2 "wing" edge stickers don't share
 * Megaminx's convention of corners[0]/[1] both sitting exactly along the
 * true edge, so their own centroid can land well off the edge's midpoint.
 * A full point-to-segment distance against the true vertex-to-vertex
 * segment is robust to that regardless of a sticker's own corner layout.
 */
function nearestEdgeIndex(p: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 30; i++) {
    const [a, b] = EDGES[i];
    const va = VERTICES[a], vb = VERTICES[b];
    const ab = vb.clone().sub(va);
    const t = THREE.MathUtils.clamp(p.clone().sub(va).dot(ab) / ab.lengthSq(), 0, 1);
    const closest = va.clone().add(ab.multiplyScalar(t));
    const d = p.distanceToSquared(closest);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const VERTEX_EPS_SQ = 1e-6;

/**
 * Distinguishes a REAL outer-corner sticker (corners[1] sits exactly on a
 * true dodecahedron vertex) from one of the 12 inner-wedge pieces (same
 * "corner" pieceType, but corners[1] is an interior lerped point, nowhere
 * near any true vertex) -- see this module's own top comment for why the
 * 2 need telling apart at all.
 */
function isRealCornerSticker(p: THREE.Vector3): boolean {
  const v = nearestVertexIndex(p);
  return p.distanceToSquared(VERTICES[v]) < VERTEX_EPS_SQ;
}

function deriveMove(face: FaceIndex, sign: 1 | -1): MasterKilominxMoveTable {
  const scrambled = buildSolvedDodeca(4);
  applyRawFifthTurn(scrambled, face, 1, sign);

  const cornerPieceIdOfFaceTriple = new Map<string, number>();
  for (let v = 0; v < 20; v++) cornerPieceIdOfFaceTriple.set([...FACES_AT_VERTEX[v]].sort((a, b) => a - b).join(","), v);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  const edgePieceIdOfFacePair = new Map<string, number>();
  for (let e = 0; e < 30; e++) edgePieceIdOfFacePair.set([...FACES_AT_EDGE[e]].sort((a, b) => a - b).join(","), e);
  const byEdge: { homeFace: number; curFace: number; nearV: number }[][] = Array.from({ length: 30 }, () => []);

  for (const st of scrambled.stickers) {
    if (st.pieceType === "corner") {
      if (!isRealCornerSticker(st.corners[1])) continue; // inner wedge -- not tracked
      const v = nearestVertexIndex(st.corners[1]);
      const curFace = nearestFaceIndex(centroid(st.corners));
      byVertex[v].push({ homeFace: st.homeFaceIndex, curFace });
    } else if (st.pieceType === "edge") {
      const c = centroid(st.corners);
      const e = nearestEdgeIndex(c);
      const curFace = nearestFaceIndex(c);
      // Which end of the edge (EDGES[e][0] vs [1]) this sticker's own
      // centroid sits nearest -- the extra "which half" signal 4-sticker
      // edges need beyond megaminxState.ts's 2-sticker version, to pick a
      // single canonical representative sticker per face for orientation.
      const nearV = VERTICES[EDGES[e][0]].distanceToSquared(c) < VERTICES[EDGES[e][1]].distanceToSquared(c) ? EDGES[e][0] : EDGES[e][1];
      byEdge[e].push({ homeFace: st.homeFaceIndex, curFace, nearV });
    }
    // Inner-wedge "corner" stickers skipped above; true "center" stickers (odd N only) don't exist for N=4.
  }

  const cornerPerm: number[] = new Array(20).fill(-1);
  const cornerOrientDelta: number[] = new Array(20).fill(0);
  for (let v = 0; v < 20; v++) {
    const triple = byVertex[v]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = cornerPieceIdOfFaceTriple.get(triple);
    if (pieceId === undefined) throw new Error(`masterKilominxState: no corner piece match at vertex ${v}: [${triple}]`);
    cornerPerm[v] = pieceId;
    if (pieceId === v) continue;
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    cornerOrientDelta[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  const edgePerm: number[] = new Array(30).fill(-1);
  const edgeOrientDelta: number[] = new Array(30).fill(0);
  for (let e = 0; e < 30; e++) {
    // One representative sticker per face (nearest EDGES[e][0]) stands in
    // for the whole 4-sticker piece -- its home-face identity fully
    // determines the piece's flip state, same as megaminxState.ts's 1
    // sticker/face edges, just filtered down from 2 candidates to 1 first.
    const reps = byEdge[e].filter((x) => x.nearV === EDGES[e][0]);
    const pair = reps
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = edgePieceIdOfFacePair.get(pair);
    if (pieceId === undefined) throw new Error(`masterKilominxState: no edge piece match at edge ${e}: [${pair}] (reps=${reps.length})`);
    edgePerm[e] = pieceId;
    if (pieceId === e) continue;
    const bySlot = [...reps].sort((a, b) => FACES_AT_EDGE[e].indexOf(a.curFace) - FACES_AT_EDGE[e].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_EDGE[pieceId][0];
    edgeOrientDelta[e] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  return { cornerPerm, cornerOrientDelta, edgePerm, edgeOrientDelta };
}

/** MOVE_TABLE[face][0] = sign +1, MOVE_TABLE[face][1] = sign -1. */
export const MOVE_TABLE: readonly (readonly [MasterKilominxMoveTable, MasterKilominxMoveTable])[] = FACE_INDICES.map((f) => [deriveMove(f, 1), deriveMove(f, -1)] as const);

/**
 * Bridges the live rendering scene's state (DodecaState, geometry-based)
 * to this module's own abstract piece model -- same reading loop as
 * deriveMove, generalized to an arbitrary input state instead of always a
 * post-move scramble (GIGAMINX_STATE_BRIDGE_AND_ROUNDTRIP_CORRECTNESS_V1's
 * technique, applied here).
 */
export function dodecaStateToMasterKilominxState(state: DodecaState): MasterKilominxState {
  if (state.layerCount !== 4) throw new Error(`dodecaStateToMasterKilominxState: expected layerCount=4 (Master Kilominx), got ${state.layerCount}`);

  const cornerPieceIdOfFaceTriple = new Map<string, number>();
  for (let v = 0; v < 20; v++) cornerPieceIdOfFaceTriple.set([...FACES_AT_VERTEX[v]].sort((a, b) => a - b).join(","), v);
  const edgePieceIdOfFacePair = new Map<string, number>();
  for (let e = 0; e < 30; e++) edgePieceIdOfFacePair.set([...FACES_AT_EDGE[e]].sort((a, b) => a - b).join(","), e);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  const byEdge: { homeFace: number; curFace: number; nearV: number }[][] = Array.from({ length: 30 }, () => []);

  for (const st of state.stickers) {
    if (st.pieceType === "corner") {
      if (!isRealCornerSticker(st.corners[1])) continue; // inner wedge -- not tracked
      const v = nearestVertexIndex(st.corners[1]);
      const curFace = nearestFaceIndex(centroid(st.corners));
      byVertex[v].push({ homeFace: st.homeFaceIndex, curFace });
    } else if (st.pieceType === "edge") {
      const c = centroid(st.corners);
      const e = nearestEdgeIndex(c);
      const curFace = nearestFaceIndex(c);
      const nearV = VERTICES[EDGES[e][0]].distanceToSquared(c) < VERTICES[EDGES[e][1]].distanceToSquared(c) ? EDGES[e][0] : EDGES[e][1];
      byEdge[e].push({ homeFace: st.homeFaceIndex, curFace, nearV });
    }
  }

  const cornerPerm = new Int8Array(20).fill(-1);
  const cornerOrient = new Int8Array(20);
  for (let v = 0; v < 20; v++) {
    const triple = byVertex[v]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = cornerPieceIdOfFaceTriple.get(triple);
    if (pieceId === undefined) throw new Error(`dodecaStateToMasterKilominxState: no corner piece match at vertex ${v}: [${triple}]`);
    cornerPerm[v] = pieceId;
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    cornerOrient[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  const edgePerm = new Int8Array(30).fill(-1);
  const edgeOrient = new Int8Array(30);
  for (let e = 0; e < 30; e++) {
    const reps = byEdge[e].filter((x) => x.nearV === EDGES[e][0]);
    const pair = reps
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = edgePieceIdOfFacePair.get(pair);
    if (pieceId === undefined) throw new Error(`dodecaStateToMasterKilominxState: no edge piece match at edge ${e}: [${pair}] (reps=${reps.length})`);
    edgePerm[e] = pieceId;
    const bySlot = [...reps].sort((a, b) => FACES_AT_EDGE[e].indexOf(a.curFace) - FACES_AT_EDGE[e].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_EDGE[pieceId][0];
    edgeOrient[e] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  return { cornerPerm, cornerOrient, edgePerm, edgeOrient };
}

export function masterKilominxTurnToRawTurn(turn: MasterKilominxTurn): RawDodecaTurn {
  return { faceIndex: turn.face, depth: 1, sign: turn.sign };
}

export function solvedMasterKilominxState(): MasterKilominxState {
  return {
    cornerPerm: Int8Array.from({ length: 20 }, (_, i) => i),
    cornerOrient: new Int8Array(20),
    edgePerm: Int8Array.from({ length: 30 }, (_, i) => i),
    edgeOrient: new Int8Array(30),
  };
}

export function isMasterKilominxSolved(state: MasterKilominxState): boolean {
  return state.cornerPerm.every((p, i) => p === i) && state.cornerOrient.every((o) => o === 0) && state.edgePerm.every((p, i) => p === i) && state.edgeOrient.every((o) => o === 0);
}

/** Applies one move to `state`, returning a NEW state (state is never mutated). */
export function applyMasterKilominxMove(state: MasterKilominxState, face: FaceIndex, sign: 1 | -1): MasterKilominxState {
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

export interface MasterKilominxTurn {
  face: FaceIndex;
  sign: 1 | -1;
}

export function randomMasterKilominxScramble(length = 40, rng: Rng = Math.random): MasterKilominxTurn[] {
  const turns: MasterKilominxTurn[] = [];
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

export function applyMasterKilominxScramble(state: MasterKilominxState, turns: readonly MasterKilominxTurn[]): MasterKilominxState {
  let s = state;
  for (const t of turns) s = applyMasterKilominxMove(s, t.face, t.sign);
  return s;
}
