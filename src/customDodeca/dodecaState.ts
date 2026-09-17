import * as THREE from "three";
import { FACE_COLORS, mulberry32, type Rng } from "../customCube/cubeState";
import { depthFromFace, fifthTurnQuaternion, nearestFaceIndex, FACE_INDICES, FACE_VERTEX_INDICES, VERTICES, type FaceIndex } from "./dodecaMath";

export { mulberry32, type Rng };

// 12 faces need 12 distinct colors -- the existing 6 cube face colors plus 6
// more, chosen for visual distinctness (not an official Megaminx palette,
// since this puzzle family isn't standardized on one -- most real Megaminx
// sets use pastel/muted colors for the 6 "extra" faces beyond a cube's 6).
export const DODECA_FACE_COLORS: readonly string[] = [
  FACE_COLORS.D,
  FACE_COLORS.F,
  FACE_COLORS.R,
  FACE_COLORS.B,
  FACE_COLORS.L,
  FACE_COLORS.U,
  "#8e44ad", // purple
  "#16a085", // teal
  "#e67e22", // orange
  "#c0392b", // brick red
  "#2c3e50", // slate
  "#f1c40f", // yellow
];

export type PieceType = "corner" | "edge" | "center";

export interface Sticker {
  id: number;
  homeFaceIndex: FaceIndex;
  pieceType: PieceType;
  color: string;
  // Variable-length polygon (4 corners for an edge/wedge piece, 5 for a
  // corner "house" piece or a center pentagon) -- unlike customTetra's fixed
  // 3-corner triangles, a pentagon face's natural piece shapes aren't all
  // triangles. Live, world-space, un-inset (same spirit as tetraState.ts's
  // Sticker.corners).
  corners: THREE.Vector3[];
}

export interface DodecaState {
  layerCount: number;
  stickers: Sticker[];
}

function faceCenter(faceIndex: FaceIndex): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const i of FACE_VERTEX_INDICES[faceIndex]) sum.add(VERTICES[i]);
  return sum.divideScalar(5);
}

function lerp(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

// Shoulder fraction: where each corner/edge piece boundary meets the
// OUTER pentagon's own edges, as a fraction from each vertex toward the
// next. NOT the naive 0.25 first guessed here -- extracted by dumping the
// real Megaminx's exact sticker polygon coordinates from cubing.js
// (getPuzzleGeometryByName("megaminx").get3d(), the same puzzle-geometry
// engine WCA-style scrambles/sims use) and solving for it numerically:
// 0.3927050983... (verified reproducible, not a rounded guess).
const SHOULDER_FRACTION = 0.39270509831248435;

// Inner-pentagon radial scale (fraction of the way from face center C to a
// vertex) for the ring/center boundary. Also extracted from the same real
// Megaminx dump (0.457... for N=3's single ring -> center boundary) and
// the real Gigaminx dump (0.349... for N=5's innermost ring -> center
// boundary, see this module's own investigation history for both). N=4
// (no direct cubing.js equivalent found despite extensive testing --
// tried a wide sweep of face/vertex cut descriptors) interpolates between
// these two verified endpoints rather than reusing the old, disproven
// 1/N-per-layer split.
const RING1_INNER_SCALE = 0.45729490168751596; // N=3 (Megaminx), single ring

/**
 * Builds one face's stickers for a given layerCount, as a self-similar
 * "ring" subdivision of the pentagon -- for N=2 (Kilominx) and N=3
 * (Megaminx) this exactly reproduces real hardware's own piece boundaries
 * (N=2 verified against a real Kilominx reference photo; N=3 verified by
 * extracting cubing.js's own Megaminx sticker polygon coordinates
 * directly, see SHOULDER_FRACTION/RING1_INNER_SCALE above). N=4 has no
 * known direct equivalent (no cubing.js descriptor sweep reproduced it,
 * and the "Kilominx" family isn't in cubing.js's puzzle-name list at
 * all) so it reuses the Megaminx-derived RING1_INNER_SCALE as its own
 * single ring's boundary -- an approximation, not a verified value, and
 * the least certain of the sizes this app exposes.
 *
 * N=5 (Gigaminx) does NOT use this function -- an earlier version of this
 * code tried to extend the same single-ring formula to a second ring by
 * simple radial scaling, but the real Gigaminx's second ring is a
 * genuinely different topology (wing-split edge pieces, extra orbits
 * bridging the two rings, 6 distinct piece orbits instead of 3) -- see
 * buildGigaminxFaceStickers below, which reproduces that exact real
 * structure instead of approximating it.
 *
 * Construction per ring: a "corner" piece is a 4-point kite (apex at the
 * true outer vertex, 2 "shoulder" points at SHOULDER_FRACTION/
 * (1-SHOULDER_FRACTION) along the two adjacent outer edges, 1 inner point
 * at the corresponding vertex of the next ring boundary in). An "edge"
 * piece is a trapezoid (its 2 outer corners are the same 2 shoulder
 * points shared with the neighboring corner pieces, its 2 inner corners
 * are the next ring boundary's own 2 adjacent vertices). This is
 * genuinely different from the OLD construction (a 5-point "house" corner
 * using two separate near-vertex boundary points at BOTH the outer and
 * inner radius) -- that shape was confirmed wrong against the real
 * Megaminx data (real corners are 4-point kites, not 5-point houses).
 */
function buildFaceStickers(faceIndex: FaceIndex, layerCount: number, nextId: () => number): Sticker[] {
  const C = faceCenter(faceIndex);
  const memberIdx = FACE_VERTEX_INDICES[faceIndex];
  const outerV = memberIdx.map((i) => VERTICES[i]);
  const M = outerV.map((v, j) => lerp(v, outerV[(j + 1) % 5], 0.5));

  const color = DODECA_FACE_COLORS[faceIndex];
  const N = layerCount;
  const hasCenter = N % 2 === 1;
  const stickers: Sticker[] = [];

  if (N <= 2) {
    // No room for a separate edge piece: 5 plain vertex-to-midpoint wedges
    // (real Kilominx's shape, verified against a real reference photo),
    // closing at the center (even N=2) or leaving a small pentagon (odd
    // N=1, degenerate/unused but handled for safety).
    const tInner = hasCenter ? RING1_INNER_SCALE : 0;
    for (let j = 0; j < 5; j++) {
      const corners = hasCenter
        ? [M[(j + 4) % 5], outerV[j], M[j], lerp(C, M[j], tInner), lerp(C, M[(j + 4) % 5], tInner)]
        : [M[(j + 4) % 5], outerV[j], M[j], C.clone()];
      stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "corner", color, corners });
    }
    if (hasCenter) {
      stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "center", color, corners: outerV.map((v) => lerp(C, v, tInner)) });
    }
    return stickers;
  }

  // N=3 or N=4: exactly one ring, boundary at RING1_INNER_SCALE.
  const outerRingV = outerV;
  const innerRingV = outerV.map((v) => lerp(C, v, RING1_INNER_SCALE));
  function shoulderPoints(ringV: THREE.Vector3[]): THREE.Vector3[] {
    // shoulder[2j] = near vertex j, on edge (j-1,j); shoulder[2j+1] = near vertex j, on edge (j,j+1).
    const s: THREE.Vector3[] = [];
    for (let j = 0; j < 5; j++) {
      s[2 * j] = lerp(ringV[(j + 4) % 5], ringV[j], 1 - SHOULDER_FRACTION);
      s[2 * j + 1] = lerp(ringV[j], ringV[(j + 1) % 5], SHOULDER_FRACTION);
    }
    return s;
  }
  const outerShoulders = shoulderPoints(outerRingV);

  for (let j = 0; j < 5; j++) {
    // Corner is the real 4-point kite (apex at the outer vertex, 2
    // shoulders, 1 point at the ring boundary's corresponding vertex).
    stickers.push({
      id: nextId(),
      homeFaceIndex: faceIndex,
      pieceType: "corner",
      color,
      corners: [outerShoulders[2 * j], outerRingV[j], outerShoulders[2 * j + 1], innerRingV[j]],
    });
    // Edge is a trapezoid whose inner corners are the ring boundary's own
    // 2 adjacent vertices directly (untrimmed), since the ring's own
    // corner-kite also meets that boundary at the exact vertex, not a
    // shoulder point.
    stickers.push({
      id: nextId(),
      homeFaceIndex: faceIndex,
      pieceType: "edge",
      color,
      corners: [outerShoulders[2 * j + 1], outerShoulders[(2 * j + 2) % 10], innerRingV[(j + 1) % 5], innerRingV[j]],
    });
  }

  if (hasCenter) {
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "center", color, corners: innerRingV });
  } else {
    const closeShoulders = shoulderPoints(innerRingV);
    for (let j = 0; j < 5; j++) {
      stickers.push({
        id: nextId(),
        homeFaceIndex: faceIndex,
        pieceType: "corner",
        color,
        corners: [closeShoulders[2 * j], innerRingV[j], closeShoulders[2 * j + 1], C.clone()],
      });
      stickers.push({
        id: nextId(),
        homeFaceIndex: faceIndex,
        pieceType: "edge",
        color,
        corners: [closeShoulders[2 * j + 1], closeShoulders[(2 * j + 2) % 10], C.clone()],
      });
    }
  }
  return stickers;
}

// --- Gigaminx (N=5) exact real-structure constants ---
// The single-ring formula above only matches reality for ONE ring; real
// Gigaminx's outer boundary (where its second ring begins) and its true
// center pentagon are both genuinely different radii from Megaminx's own
// single ring, and its edge pieces split into 2 "wing" sub-pieces each.
// All 5 values below were extracted directly from cubing.js's real
// Gigaminx sticker polygon data (getPuzzleGeometryByName("gigaminx").
// get3d()) by finding this puzzle's exact 5-fold-rotation + mirror
// symmetric point catalog (only 6 distinct point roles exist per face)
// and solving each one as an exact lerp fraction along a known edge --
// reproducible from that dump, none guessed or interpolated.
const GIGA_RING1_SCALE = 0.6743769410125094; // C -> ring-0/ring-1 boundary vertex, as a fraction of C -> outer vertex
const GIGA_RING2_SCALE = 0.34875388202501884; // C -> true center pentagon vertex, same fraction basis
const GIGA_CORNER_SHOULDER = 0.2356230589874901; // outer-edge lerp fraction for a CORNERS kite's shoulder
const GIGA_WING_SHOULDER = 0.4712461179749812; // outer-edge lerp fraction for a wing EDGES piece's far outer point
const GIGA_RING1_SHOULDER = 0.3493937064836854; // ring-1-pentagon-edge lerp fraction for a CENTERS kite's shoulder

/**
 * Builds one face's 31 real Gigaminx stickers, matching cubing.js's own
 * Gigaminx geometry (unlike the single-ring formula above, radially
 * rescaled for a second ring, which this project used before -- that
 * approximation both under-counted the real sticker orbits (21 vs the
 * real 31) and, before a since-fixed bug, overlapped pieces at the
 * boundary between its 2 uniform rings).
 *
 * Real orbit structure per face (5-fold rotational + mirror symmetric,
 * indices below are mod 5):
 * - CORNERS (5): a 4-point kite at each outer vertex V[j] -- same shape
 *   family as N=3's own kite corner but shallower (apex V[j], inner point
 *   P3[j], shoulders P1L[j]/P1R[j] on the outer pentagon edge).
 * - EDGES (10): each of the 5 real "edge" positions is split into 2
 *   mirror "wing" quads -- the one place a real Megaminx-family puzzle's
 *   edge sticker isn't a single piece. Each wing is bounded by P1/P2
 *   (both on the outer pentagon edge) and P3/P4 (the ring-1 pentagon's
 *   own vertex and edge-lerp point).
 * - CENTERS (5): a second, smaller kite one ring in (apex P3[j], inner
 *   point P5[j], shoulders P4L[j]/P4R[j] on the ring-1 pentagon's own
 *   edge) -- same shape family as CORNERS, just scaled down.
 * - EDGES2 (5): a quad bridging 2 adjacent CENTERS kites' shoulders (P4)
 *   out to the same narrow gap on the outer pentagon edge that the 2
 *   EDGES wings leave between them (P2) -- the one piece that reaches
 *   from the second ring all the way out to the outer boundary.
 * - CENTERS2 (5): a quad bridging 2 adjacent CENTERS kites' shoulders
 *   (P4) to 2 adjacent true-center-pentagon vertices (P5).
 * - CENTERS3 (1): the true fixed center pentagon (P5 x5).
 */
function buildGigaminxFaceStickers(faceIndex: FaceIndex, nextId: () => number): Sticker[] {
  const C = faceCenter(faceIndex);
  const memberIdx = FACE_VERTEX_INDICES[faceIndex];
  const V = memberIdx.map((i) => VERTICES[i]);
  const color = DODECA_FACE_COLORS[faceIndex];

  const P3 = V.map((v) => lerp(C, v, GIGA_RING1_SCALE));
  const P5 = V.map((v) => lerp(C, v, GIGA_RING2_SCALE));
  const P1L = V.map((v, j) => lerp(v, V[(j + 4) % 5], GIGA_CORNER_SHOULDER));
  const P1R = V.map((v, j) => lerp(v, V[(j + 1) % 5], GIGA_CORNER_SHOULDER));
  const P2L = V.map((v, j) => lerp(v, V[(j + 4) % 5], GIGA_WING_SHOULDER));
  const P2R = V.map((v, j) => lerp(v, V[(j + 1) % 5], GIGA_WING_SHOULDER));
  const P4L = P3.map((p, j) => lerp(p, P3[(j + 4) % 5], GIGA_RING1_SHOULDER));
  const P4R = P3.map((p, j) => lerp(p, P3[(j + 1) % 5], GIGA_RING1_SHOULDER));

  const stickers: Sticker[] = [];
  for (let j = 0; j < 5; j++) {
    const jn = (j + 1) % 5;
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "corner", color, corners: [P1L[j], V[j], P1R[j], P3[j]] });
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "edge", color, corners: [P1R[j], P2R[j], P4R[j], P3[j]] });
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "edge", color, corners: [P3[j], P4L[j], P2L[j], P1L[j]] });
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "corner", color, corners: [P4L[j], P3[j], P4R[j], P5[j]] });
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "edge", color, corners: [P2R[j], P2L[jn], P4L[jn], P4R[j]] });
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "edge", color, corners: [P4R[j], P4L[jn], P5[jn], P5[j]] });
  }
  stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "center", color, corners: P5 });
  return stickers;
}

export function buildSolvedDodeca(layerCount: number): DodecaState {
  let id = 0;
  const nextId = () => id++;
  const stickers: Sticker[] = [];
  for (const f of FACE_INDICES) {
    stickers.push(...(layerCount === 5 ? buildGigaminxFaceStickers(f, nextId) : buildFaceStickers(f, layerCount, nextId)));
  }
  return { layerCount, stickers };
}

/**
 * A sticker's depth from `faceIndex`, via its CENTROID (not its individual
 * corners). Two adjacent dodecahedron faces share an actual edge (2
 * vertices) -- exactly like adjacent faces of a cube share physical corner/
 * edge pieces, a real Megaminx-family turn genuinely carries some of a
 * NEIGHBORING face's own stickers along with it (the other facets of the
 * same rigid corner/edge piece), same as turning a Rubik's cube's U face
 * visibly drags red/green/etc. side-facets of the U-layer corners along
 * with the white ones -- this is not a bug to design around, it's the
 * actual mechanic.
 *
 * Taking the MIN depth over a sticker's own corners (the tetraState.ts
 * convention this was first copied from) turned out to mis-classify this
 * for a pentagon-based puzzle: a corner-type wedge's OWN apex sits exactly
 * at a shared vertex, but tracing depth from just ONE nearby (not
 * coincident) corner of an unrelated wedge could ALSO round down to 0,
 * sweeping in far more of a neighbor face than the single genuinely-shared
 * corner piece (confirmed empirically: for N=2, MIN-based depth swept in
 * all 5 of each neighbor's stickers -- 25 total -- instead of the correct
 * 15 = this face's own 5 plus exactly 2 per neighbor, the ones whose own
 * apex vertex IS one of the 2 vertices shared with `faceIndex`). The
 * CENTROID -- averaging every corner instead of taking any single one --
 * doesn't have that single-point sensitivity and classifies correctly
 * (verified against the same N=2 case: exactly the 2 per-neighbor wedges
 * whose apex is a shared vertex read as depth 0, the other 3 read as 1).
 */
function stickerDepthFromFace(corners: readonly THREE.Vector3[], faceIndex: FaceIndex, layerCount: number): number {
  return depthFromFace(stickerCentroid(corners), faceIndex, layerCount);
}

/** Stickers that belong to a turn about `faceIndex`'s axis at cutoff depth `depth` (1..layerCount-1). */
export function stickersForTurn(state: DodecaState, faceIndex: FaceIndex, depth: number): Sticker[] {
  return state.stickers.filter((s) => stickerDepthFromFace(s.corners, faceIndex, state.layerCount) < depth);
}

/** Applies one raw turn about `faceIndex`'s axis at cutoff `depth`, in place. */
export function applyRawFifthTurn(state: DodecaState, faceIndex: FaceIndex, depth: number, sign: 1 | -1): void {
  const quat = fifthTurnQuaternion(faceIndex, sign);
  for (const sticker of stickersForTurn(state, faceIndex, depth)) {
    sticker.corners = sticker.corners.map((c) => c.clone().applyQuaternion(quat));
  }
}

function stickerCentroid(corners: readonly THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const c of corners) sum.add(c);
  return sum.divideScalar(corners.length);
}

/** A sticker is correctly placed when its live centroid is nearest the face whose color it shows (same spirit as tetraState.ts's isSolved). */
export function isSolved(state: DodecaState): boolean {
  return state.stickers.every((s) => nearestFaceIndex(stickerCentroid(s.corners)) === s.homeFaceIndex);
}

export interface RawDodecaTurn {
  faceIndex: FaceIndex;
  depth: number;
  sign: 1 | -1;
}

/** Random (face, depth, sign) turns, avoiding immediate repeats of the same (face, depth) pair. */
export function generateRandomFifthTurns(layerCount: number, length = 20, rng: Rng = Math.random): RawDodecaTurn[] {
  const depths: number[] = [];
  for (let d = 1; d <= layerCount - 1; d++) depths.push(d);

  const turns: RawDodecaTurn[] = [];
  let lastKey = "";
  for (let i = 0; i < length; i++) {
    let faceIndex: FaceIndex;
    let depth: number;
    let key: string;
    do {
      faceIndex = FACE_INDICES[Math.floor(rng() * FACE_INDICES.length)];
      depth = depths[Math.floor(rng() * depths.length)];
      key = `${faceIndex}:${depth}`;
    } while (key === lastKey);
    lastKey = key;
    const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;
    turns.push({ faceIndex, depth, sign });
  }
  return turns;
}

export function randomDodecaScramble(state: DodecaState, length = 20, rng: Rng = Math.random): void {
  for (const { faceIndex, depth, sign } of generateRandomFifthTurns(state.layerCount, length, rng)) {
    applyRawFifthTurn(state, faceIndex, depth, sign);
  }
}
