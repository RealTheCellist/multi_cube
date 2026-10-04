import * as THREE from "three";
import { buildSolvedDodeca, applyRawFifthTurn, type Rng } from "./dodecaState";
import { VERTICES, FACE_VERTEX_INDICES, FACE_INDICES, nearestFaceIndex, type FaceIndex } from "./dodecaMath";
import { FACES_AT_VERTEX, nearestVertexIndex, centroid } from "./kilominxState";

export { type Rng };

/**
 * Abstract (permutation [+ orientation where applicable]) model of the N=5
 * Gigaminx's 260 moving pieces across 5 orbits (its 12 face centers are
 * fixed and not tracked, same reasoning as megaminxState.ts). Move tables
 * are derived by SIMULATION against the verified real-geometry engine
 * (dodecaState.ts's buildSolvedDodeca(5)/applyRawFifthTurn), not by hand --
 * same rule as kilominxState.ts/megaminxState.ts, extended here to cover
 * depth (1..4, a real Gigaminx has 4 distinct cuttable layers per axis, not
 * just an outer-layer twist) and 3 additional orbits beyond corner/edge.
 *
 * Per-face sticker roles (see dodecaState.ts's buildGigaminxFaceStickers,
 * 6 roles x 5 rotational copies + 1 fixed center = 31 stickers/face),
 * identified here purely from each sticker's own immutable `id` (ids are
 * assigned face-by-face, 31 per face, in construction order: CORNERS,
 * wingA, wingB, CENTERS, EDGES2, CENTERS2, repeated for j=0..4, then the
 * fixed center) -- confirmed empirically (not guessed) before writing this
 * module: every role has exactly 60 stickers across all 12 faces, no
 * solved-state centroid collisions within a role, and the 3 "single
 * sticker" roles below DO migrate across faces under deep (depth 3-4) cuts
 * (so "no orientation" is a structural fact about those pieces -- a single
 * facet has nothing to twist against -- not an oversight).
 *
 * - CORNERS (role 0): the 20 outer vertex pieces, 3-fold (shares a literal
 *   vertex with its other 2 facets, exactly like kilominx/megaminx corners).
 *   -> cornerPerm[20]/cornerOrient (mod 3).
 * - wingA/wingB (roles 1/2): together form the 60 "wing" pieces -- each of
 *   the 30 real dodecahedron edges splits into 2 independent sub-pieces
 *   (one nearer each endpoint), 2-fold (like a normal edge piece).
 *   -> wingPerm[60]/wingOrient (mod 2).
 * - CENTERS (role 3): a second, inner kite near each vertex -- despite the
 *   corner-like SHAPE, this is a single-sticker (1-fold) piece: it shows on
 *   only one face at a time, though deep cuts do carry it to new faces.
 *   -> innerCornerPerm[60], no orientation.
 * - EDGES2 (role 4): a single-sticker piece bridging the outer boundary
 *   toward the inner ring. -> edgeBridgePerm[60], no orientation.
 * - CENTERS2 (role 5): a single-sticker piece bridging the inner ring
 *   toward the true center. -> centerBridgePerm[60], no orientation.
 */
export interface GigaminxState {
  cornerPerm: Int8Array; // 20
  cornerOrient: Int8Array; // 20, mod 3
  wingPerm: Int8Array; // 60
  wingOrient: Int8Array; // 60, mod 2
  innerCornerPerm: Int8Array; // 60, pure permutation, no orientation
  edgeBridgePerm: Int8Array; // 60, pure permutation, no orientation
  centerBridgePerm: Int8Array; // 60, pure permutation, no orientation
}

export type GigaminxDepth = 1 | 2 | 3 | 4;

export interface GigaminxTurn {
  face: FaceIndex;
  sign: 1 | -1;
  depth: GigaminxDepth;
}

// ---- 30 global dodecahedron edges (ascending [v1,v2] pairs), same
// construction as megaminxState.ts's own EDGES. ----
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

const EDGE_INDEX_OF = new Map<string, number>();
EDGES.forEach(([a, b], i) => EDGE_INDEX_OF.set(`${a},${b}`, i));
function edgeIndexOf(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const idx = EDGE_INDEX_OF.get(`${lo},${hi}`);
  if (idx === undefined) throw new Error(`gigaminxState: no edge for vertices ${a},${b}`);
  return idx;
}

/** The 2 faces touching each edge, ascending by face index (same role as megaminxState.ts's FACES_AT_EDGE). */
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
  if (faces.length !== 2) throw new Error(`gigaminxState: edge [${a},${b}] touched by ${faces.length} faces, expected 2`);
  return faces.sort((p, q) => p - q) as readonly [number, number];
});

/** Wing piece identity: edgeIndex*2 + (0 if nearVertex is EDGES[edgeIndex][0], else 1). 60 total. */
function wingIdOf(vA: number, vB: number, nearVertex: number): number {
  const e = edgeIndexOf(vA, vB);
  return e * 2 + (nearVertex === EDGES[e][0] ? 0 : 1);
}

/** The 2 faces touching a given wing id -- identical to its underlying edge's own 2 faces. */
const WING_FACES: readonly (readonly [number, number])[] = Array.from({ length: 60 }, (_, w) => FACES_AT_EDGE[Math.floor(w / 2)]);

const ROLE_CORNERS = 0;
const ROLE_WING_A = 1;
const ROLE_WING_B = 2;
const ROLE_CENTERS = 3;
const ROLE_EDGES2 = 4;
const ROLE_CENTERS2 = 5;

function stickerRole(id: number): number {
  const localId = id % 31;
  return localId === 30 ? -1 : localId % 6;
}
function stickerLocalJ(id: number): number {
  return Math.floor((id % 31) / 6);
}

interface StaticInfo {
  role: number;
  pieceId: number;
}

function computeStaticInfo(homeFaceOf: Map<number, FaceIndex>): Map<number, StaticInfo> {
  const map = new Map<number, StaticInfo>();
  for (const [id, f] of homeFaceOf) {
    const role = stickerRole(id);
    if (role < 0) continue;
    const j = stickerLocalJ(id);
    let pieceId: number;
    if (role === ROLE_CORNERS) {
      pieceId = FACE_VERTEX_INDICES[f][j];
    } else if (role === ROLE_WING_A) {
      const vA = FACE_VERTEX_INDICES[f][j];
      const vB = FACE_VERTEX_INDICES[f][(j + 1) % 5];
      pieceId = wingIdOf(vA, vB, vA);
    } else if (role === ROLE_WING_B) {
      const vA = FACE_VERTEX_INDICES[f][(j + 4) % 5];
      const vB = FACE_VERTEX_INDICES[f][j];
      pieceId = wingIdOf(vA, vB, vB);
    } else {
      pieceId = f * 5 + j; // CENTERS / EDGES2 / CENTERS2: single-sticker, home (face,j) IS the identity.
    }
    map.set(id, { role, pieceId });
  }
  return map;
}

interface GigaminxMoveTable {
  cornerPerm: number[];
  cornerOrientDelta: number[];
  wingPerm: number[];
  wingOrientDelta: number[];
  innerCornerPerm: number[];
  edgeBridgePerm: number[];
  centerBridgePerm: number[];
}

/**
 * Derives one move's full move table by actually applying it to a fresh
 * solved geometric state and reading back where every piece landed -- see
 * this module's own top comment for why. MAX_MATCH_DIST_SQ guards against a
 * silent mismatch (a real rigid rotation should always land a sticker
 * EXACTLY on another valid slot's original position, up to floating point);
 * anything farther is a bug, not an ambiguous match to paper over.
 */
const MAX_MATCH_DIST_SQ = 1e-6;

function deriveMove(face: FaceIndex, depth: GigaminxDepth, sign: 1 | -1): GigaminxMoveTable {
  const solved = buildSolvedDodeca(5);
  const homeFaceOf = new Map<number, FaceIndex>(solved.stickers.map((s) => [s.id, s.homeFaceIndex]));
  const staticInfo = computeStaticInfo(homeFaceOf);

  const wingRefs: { pieceId: number; point: THREE.Vector3 }[] = [];
  const innerCornerRefs: { pieceId: number; point: THREE.Vector3 }[] = [];
  const edgeBridgeRefs: { pieceId: number; point: THREE.Vector3 }[] = [];
  const centerBridgeRefs: { pieceId: number; point: THREE.Vector3 }[] = [];
  for (const s of solved.stickers) {
    const info = staticInfo.get(s.id);
    if (!info) continue;
    const pt = centroid(s.corners);
    if (info.role === ROLE_WING_A || info.role === ROLE_WING_B) wingRefs.push({ pieceId: info.pieceId, point: pt });
    else if (info.role === ROLE_CENTERS) innerCornerRefs.push({ pieceId: info.pieceId, point: pt });
    else if (info.role === ROLE_EDGES2) edgeBridgeRefs.push({ pieceId: info.pieceId, point: pt });
    else if (info.role === ROLE_CENTERS2) centerBridgeRefs.push({ pieceId: info.pieceId, point: pt });
  }

  applyRawFifthTurn(solved, face, depth, sign);

  const cornerPerm = new Array<number>(20).fill(-1);
  const cornerOrientDelta = new Array<number>(20).fill(0);
  const wingPerm = new Array<number>(60).fill(-1);
  const wingOrientDelta = new Array<number>(60).fill(0);
  const innerCornerPerm = new Array<number>(60).fill(-1);
  const edgeBridgePerm = new Array<number>(60).fill(-1);
  const centerBridgePerm = new Array<number>(60).fill(-1);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  const byWing: { homeFace: number; curFace: number }[][] = Array.from({ length: 60 }, () => []);

  function nearestRef(pt: THREE.Vector3, refs: { pieceId: number; point: THREE.Vector3 }[]): number {
    let best = -1;
    let bestD = Infinity;
    for (const ref of refs) {
      const d = pt.distanceToSquared(ref.point);
      if (d < bestD) {
        bestD = d;
        best = ref.pieceId;
      }
    }
    if (bestD > MAX_MATCH_DIST_SQ) throw new Error(`gigaminxState: nearest-match distance ${Math.sqrt(bestD)} exceeds tolerance (face=${face} depth=${depth} sign=${sign})`);
    return best;
  }

  for (const s of solved.stickers) {
    const info = staticInfo.get(s.id);
    if (!info) continue;
    const curFace = nearestFaceIndex(centroid(s.corners));
    if (info.role === ROLE_CORNERS) {
      const v = nearestVertexIndex(s.corners[1]);
      cornerPerm[v] = info.pieceId;
      byVertex[v].push({ homeFace: s.homeFaceIndex, curFace });
    } else if (info.role === ROLE_WING_A || info.role === ROLE_WING_B) {
      const w = nearestRef(centroid(s.corners), wingRefs);
      wingPerm[w] = info.pieceId;
      byWing[w].push({ homeFace: s.homeFaceIndex, curFace });
    } else if (info.role === ROLE_CENTERS) {
      innerCornerPerm[nearestRef(centroid(s.corners), innerCornerRefs)] = info.pieceId;
    } else if (info.role === ROLE_EDGES2) {
      edgeBridgePerm[nearestRef(centroid(s.corners), edgeBridgeRefs)] = info.pieceId;
    } else {
      centerBridgePerm[nearestRef(centroid(s.corners), centerBridgeRefs)] = info.pieceId;
    }
  }

  for (let v = 0; v < 20; v++) {
    const pieceId = cornerPerm[v];
    if (pieceId === v) continue;
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    cornerOrientDelta[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }
  for (let w = 0; w < 60; w++) {
    const pieceId = wingPerm[w];
    if (pieceId === w) continue;
    const bySlot = [...byWing[w]].sort((a, b) => WING_FACES[w].indexOf(a.curFace) - WING_FACES[w].indexOf(b.curFace));
    const slot0HomeFace = WING_FACES[pieceId][0];
    wingOrientDelta[w] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  return { cornerPerm, cornerOrientDelta, wingPerm, wingOrientDelta, innerCornerPerm, edgeBridgePerm, centerBridgePerm };
}

function moveIndexOf(face: FaceIndex, depth: GigaminxDepth, sign: 1 | -1): number {
  return face * 8 + (depth - 1) * 2 + (sign === 1 ? 0 : 1);
}

/** MOVE_TABLE[moveIndexOf(face,depth,sign)] -- 96 entries (12 faces x 4 depths x 2 signs). */
export const MOVE_TABLE: readonly GigaminxMoveTable[] = (() => {
  const table: GigaminxMoveTable[] = new Array(96);
  for (const face of FACE_INDICES) {
    for (const depth of [1, 2, 3, 4] as const) {
      for (const sign of [1, -1] as const) {
        table[moveIndexOf(face, depth, sign)] = deriveMove(face, depth, sign);
      }
    }
  }
  return table;
})();

export function solvedGigaminxState(): GigaminxState {
  return {
    cornerPerm: Int8Array.from({ length: 20 }, (_, i) => i),
    cornerOrient: new Int8Array(20),
    wingPerm: Int8Array.from({ length: 60 }, (_, i) => i),
    wingOrient: new Int8Array(60),
    innerCornerPerm: Int8Array.from({ length: 60 }, (_, i) => i),
    edgeBridgePerm: Int8Array.from({ length: 60 }, (_, i) => i),
    centerBridgePerm: Int8Array.from({ length: 60 }, (_, i) => i),
  };
}

/** Applies one move to `state`, returning a NEW state (state is never mutated). */
export function applyGigaminxMove(state: GigaminxState, face: FaceIndex, sign: 1 | -1, depth: GigaminxDepth): GigaminxState {
  const move = MOVE_TABLE[moveIndexOf(face, depth, sign)];

  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = move.cornerPerm[pos];
    cornerPerm[pos] = state.cornerPerm[from];
    cornerOrient[pos] = (state.cornerOrient[from] + move.cornerOrientDelta[pos]) % 3;
  }

  const wingPerm = new Int8Array(60);
  const wingOrient = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) {
    const from = move.wingPerm[pos];
    wingPerm[pos] = state.wingPerm[from];
    wingOrient[pos] = (state.wingOrient[from] + move.wingOrientDelta[pos]) % 2;
  }

  const innerCornerPerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) innerCornerPerm[pos] = state.innerCornerPerm[move.innerCornerPerm[pos]];

  const edgeBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) edgeBridgePerm[pos] = state.edgeBridgePerm[move.edgeBridgePerm[pos]];

  const centerBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) centerBridgePerm[pos] = state.centerBridgePerm[move.centerBridgePerm[pos]];

  return { cornerPerm, cornerOrient, wingPerm, wingOrient, innerCornerPerm, edgeBridgePerm, centerBridgePerm };
}

export function randomGigaminxScramble(length = 30, rng: Rng = Math.random): GigaminxTurn[] {
  const turns: GigaminxTurn[] = [];
  let lastFace = -1;
  for (let i = 0; i < length; i++) {
    let face: FaceIndex;
    do {
      face = FACE_INDICES[Math.floor(rng() * FACE_INDICES.length)];
    } while (face === lastFace);
    lastFace = face;
    const depth = (1 + Math.floor(rng() * 4)) as GigaminxDepth;
    const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;
    turns.push({ face, sign, depth });
  }
  return turns;
}

export function applyGigaminxScramble(state: GigaminxState, turns: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of turns) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}
