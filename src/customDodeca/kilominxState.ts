import * as THREE from "three";
import { buildSolvedDodeca, applyRawFifthTurn } from "./dodecaState";
import { VERTICES, FACE_VERTEX_INDICES, FACE_NORMALS, FACE_INDICES, nearestFaceIndex, type FaceIndex } from "./dodecaMath";
import type { Rng } from "./dodecaState";

/**
 * Abstract (permutation + orientation) model of the N=2 Kilominx's 20
 * corner pieces -- separate from dodecaState.ts's own live 3D Sticker/
 * DodecaState model, which tracks geometry, not piece identity. A solver
 * needs a cheap, purely combinatorial state to search over; this module
 * derives that state's move tables directly from the SAME verified
 * geometric engine (buildSolvedDodeca + applyRawFifthTurn) rather than
 * hand-deriving them, matching this codebase's own established rule: a
 * 20-vertex/12-face structure's move tables are too easy to get subtly
 * wrong by hand (see dodecaMath.ts's own FACE_VERTEX_INDICES comment for
 * the same reasoning applied to the base geometry).
 *
 * A "position" is a dodecahedron vertex index 0..19 (matching dodecaMath's
 * VERTICES). A "piece" is identified by the position it started at when
 * solved (piece ids are also 0..19, matching their home position). Each
 * piece has 3 stickers, one per face touching its vertex; orientation is
 * mod 3, tracked as which of the piece's 3 "slots" (that vertex's 3
 * touching faces, sorted ascending by face index) currently shows the
 * piece's own "slot 0" sticker (canonically: the sticker whose home face
 * is the smallest of the piece's 3 home faces).
 */
export interface KilominxState {
  /** perm[pos] = the piece id currently sitting at position `pos`. */
  perm: number[];
  /** orient[pos] = 0..2, the orientation of whichever piece is at `pos`. */
  orient: number[];
}

export interface KilominxMoveTable {
  /** Full 20-length permutation for this move (identity outside the 5 affected positions). */
  perm: number[];
  /** Full 20-length orientation delta for this move (0 outside the 5 affected positions). */
  orientDelta: number[];
}

function faceCenter(faceIndex: FaceIndex): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const i of FACE_VERTEX_INDICES[faceIndex]) sum.add(VERTICES[i]);
  return sum.divideScalar(5);
}

/**
 * The 3 face indices touching each vertex, in true geometric CCW order
 * (viewed from outside the solid, looking toward the origin) -- NOT sorted
 * by face index, which has no geometric meaning and isn't a consistent
 * rotational order from one vertex to the next (confirmed the hard way: an
 * earlier version of this file sorted by face index instead, which passed
 * every single-move sanity check but failed "move then its own inverse
 * returns to solved" for face 1 -- ascending-index order happened to be
 * CCW at some vertices and CW at others, so orientation composition,
 * which needs the SAME rotational sense everywhere to stay additive mod 3,
 * came out inconsistent). Computed the same way dodecaMath.ts's own
 * assertGeometry() checks face winding: cross product of two edge-ish
 * vectors against the reference axis.
 */
const FACES_AT_VERTEX: readonly (readonly [number, number, number])[] = (() => {
  const touching: number[][] = Array.from({ length: 20 }, () => []);
  for (const f of FACE_INDICES) {
    for (const v of FACE_VERTEX_INDICES[f]) touching[v].push(f);
  }
  return touching.map((faces, v) => {
    const vertex = VERTICES[v];
    const axis = vertex.clone().normalize(); // outward direction at this vertex
    // Direction from the vertex toward each touching face's center, projected
    // flat onto the plane perpendicular to axis (so angles between them are
    // measured purely around the vertex, ignoring how "tilted" each face is).
    const dirs = new Map<FaceIndex, THREE.Vector3>();
    for (const f of faces) {
      const toFace = faceCenter(f).sub(vertex);
      dirs.set(f, toFace.sub(axis.clone().multiplyScalar(toFace.dot(axis))).normalize());
    }
    const refDir = dirs.get(faces[0])!;
    const angleFromRef = (f: FaceIndex): number => {
      const dir = dirs.get(f)!;
      const sin = refDir.clone().cross(dir).dot(axis);
      const cos = refDir.dot(dir);
      return Math.atan2(sin, cos);
    };
    const sorted = [...faces].sort((a, b) => angleFromRef(a) - angleFromRef(b));
    return sorted as readonly [number, number, number];
  });
})();

function nearestVertexIndex(p: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 20; i++) {
    const d = p.distanceToSquared(VERTICES[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function centroid(pts: readonly THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const p of pts) sum.add(p);
  return sum.divideScalar(pts.length);
}

/**
 * Derives one move's (perm, orientDelta) pair by actually applying it to a
 * fresh solved geometric state and reading back where every piece and
 * orientation landed -- see this module's own top comment for why.
 */
function deriveMove(face: FaceIndex, sign: 1 | -1): KilominxMoveTable {
  const scrambled = buildSolvedDodeca(2);
  applyRawFifthTurn(scrambled, face, 1, sign);

  // In the solved state, piece v's own 3 stickers' home faces are exactly
  // FACES_AT_VERTEX[v] (piece identity == starting position) -- so this map
  // recovers "which piece" a face-triple belongs to without needing to
  // build a second solved DodecaState just to read it back. Keyed by the
  // ASCENDING-sorted triple (order-independent identity lookup) -- distinct
  // from FACES_AT_VERTEX's own CCW order, which is for orientation, not
  // identity.
  const pieceIdOfFaceTriple = new Map<string, number>();
  for (let v = 0; v < 20; v++) pieceIdOfFaceTriple.set([...FACES_AT_VERTEX[v]].sort((a, b) => a - b).join(","), v);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  for (const st of scrambled.stickers) {
    const v = nearestVertexIndex(st.corners[1]);
    const curFace = nearestFaceIndex(centroid(st.corners));
    byVertex[v].push({ homeFace: st.homeFaceIndex, curFace });
  }

  const perm: number[] = new Array(20).fill(-1);
  const orientDelta: number[] = new Array(20).fill(0);
  for (let v = 0; v < 20; v++) {
    const triple = byVertex[v]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = pieceIdOfFaceTriple.get(triple);
    if (pieceId === undefined) throw new Error(`kilominxState: no piece match at vertex ${v}: [${triple}]`);
    perm[v] = pieceId;
    if (pieceId === v) continue; // unmoved position: orientDelta stays 0
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    orientDelta[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }
  return { perm, orientDelta };
}

/** MOVE_TABLE[face][0] = sign +1, MOVE_TABLE[face][1] = sign -1. */
export const MOVE_TABLE: readonly (readonly [KilominxMoveTable, KilominxMoveTable])[] = FACE_INDICES.map((f) => [deriveMove(f, 1), deriveMove(f, -1)] as const);

export function solvedKilominxState(): KilominxState {
  return { perm: Array.from({ length: 20 }, (_, i) => i), orient: new Array(20).fill(0) };
}

export function isKilominxSolved(state: KilominxState): boolean {
  return state.perm.every((p, i) => p === i) && state.orient.every((o) => o === 0);
}

/** Applies one move to `state`, returning a NEW state (state is never mutated). */
export function applyKilominxMove(state: KilominxState, face: FaceIndex, sign: 1 | -1): KilominxState {
  const move = MOVE_TABLE[face][sign === 1 ? 0 : 1];
  const perm = new Array(20);
  const orient = new Array(20);
  for (let pos = 0; pos < 20; pos++) {
    // Position `pos` now holds whatever piece was at move.perm[pos] before this move.
    const from = move.perm[pos];
    perm[pos] = state.perm[from];
    orient[pos] = (state.orient[from] + move.orientDelta[pos]) % 3;
  }
  return { perm, orient };
}

export interface KilominxTurn {
  face: FaceIndex;
  sign: 1 | -1;
}

export function randomKilominxScramble(length = 20, rng: Rng = Math.random): KilominxTurn[] {
  const turns: KilominxTurn[] = [];
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

export function applyKilominxScramble(state: KilominxState, turns: readonly KilominxTurn[]): KilominxState {
  let s = state;
  for (const t of turns) s = applyKilominxMove(s, t.face, t.sign);
  return s;
}
