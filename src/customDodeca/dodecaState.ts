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
const RING2_INNER_SCALE = 0.34875906183919807; // N=5 (Gigaminx), innermost of 2 rings

/**
 * Builds one face's stickers for a given layerCount, as a self-similar
 * "ring" subdivision of the pentagon -- for N=2 (Kilominx) and N=3
 * (Megaminx) this exactly reproduces real hardware's own piece boundaries
 * (N=2 verified against a real Kilominx reference photo; N=3 verified by
 * extracting cubing.js's own Megaminx sticker polygon coordinates
 * directly, see SHOULDER_FRACTION/RING1_INNER_SCALE above). N=5 uses that
 * same extracted radial scale for its innermost ring but does NOT
 * reproduce cubing.js's real Gigaminx exactly -- the real puzzle splits
 * its outer-ring edge pieces into 2 "wing" sub-pieces each and has extra
 * corner-like pieces bridging the two rings (6 distinct piece orbits
 * total, confirmed by dumping cubing.js's real Gigaminx geometry), which
 * this uniform formula doesn't attempt to replicate. N=4 has no known
 * direct equivalent (see RING2_INNER_SCALE's own comment) and is the
 * least certain of the four sizes.
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
  const ringCount = Math.floor((N - 1) / 2);
  const hasCenter = N % 2 === 1;
  const stickers: Sticker[] = [];

  // Ring-boundary radial scale (1 = outer pentagon, shrinking inward).
  // ring 1's inner boundary uses the exact Megaminx-derived value; ring 2's
  // (only reachable for N=5, the only size with 2 rings today) uses the
  // exact Gigaminx-derived value; anything deeper interpolates the same
  // per-ring shrink ratio geometrically (untested beyond N=5, since no
  // size here goes past 2 rings).
  const perRingShrink = RING2_INNER_SCALE / RING1_INNER_SCALE;
  const ringBoundaryScale = (k: number): number => (k === 0 ? 1 : RING1_INNER_SCALE * perRingShrink ** (k - 1));

  // Vertices of the ring boundary at scale index k (0 = outer pentagon
  // itself, 1.. = successively smaller radially-scaled copies -- same
  // orientation as the outer pentagon, verified against the real Megaminx
  // dump: its inner pentagon's vertices sit in the EXACT same angular
  // directions as the outer ones, just scaled, not rotated).
  function ringVertices(k: number): THREE.Vector3[] {
    const scale = ringBoundaryScale(k);
    return outerV.map((v) => lerp(C, v, scale));
  }
  function shoulderPoints(outerRingV: THREE.Vector3[]): THREE.Vector3[] {
    // shoulder[2j] = near vertex j, on edge (j-1,j); shoulder[2j+1] = near vertex j, on edge (j,j+1).
    const s: THREE.Vector3[] = [];
    for (let j = 0; j < 5; j++) {
      s[2 * j] = lerp(outerRingV[(j + 4) % 5], outerRingV[j], 1 - SHOULDER_FRACTION);
      s[2 * j + 1] = lerp(outerRingV[j], outerRingV[(j + 1) % 5], SHOULDER_FRACTION);
    }
    return s;
  }

  if (ringCount === 0) {
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

  for (let k = 0; k < ringCount; k++) {
    const outerRingV = ringVertices(k);
    const innerRingV = ringVertices(k + 1);
    const outerShoulders = shoulderPoints(outerRingV);
    const innerShoulders = k + 1 < ringCount ? shoulderPoints(innerRingV) : null;

    for (let j = 0; j < 5; j++) {
      if (innerShoulders) {
        // Not the innermost ring: the corner is a hex piece bounded by
        // shoulder points on BOTH the outer and inner ring boundary
        // (mirroring the outer ring's own shape one layer in) -- reasonable
        // extrapolation, not derived from a real >2-ring reference (none of
        // this app's exposed sizes need it). Its adjacent edge piece's
        // INNER corners must ALSO be trimmed to the inner ring's shoulder
        // points (not the raw inner ring vertices) -- using the untrimmed
        // vertex there made the edge piece's inner boundary span the full
        // vertex-to-vertex arc while the corner hex's inner boundary only
        // spans the shoulder-trimmed near-vertex arc, so the two pieces
        // overlapped in the gap between them (confirmed: summed sticker
        // area for N=5 came out ~19.5% larger than the pentagon's true
        // area before this fix).
        stickers.push({
          id: nextId(),
          homeFaceIndex: faceIndex,
          pieceType: "corner",
          color,
          corners: [outerShoulders[2 * j], outerRingV[j], outerShoulders[2 * j + 1], innerShoulders[2 * j + 1], innerRingV[j], innerShoulders[2 * j]],
        });
        stickers.push({
          id: nextId(),
          homeFaceIndex: faceIndex,
          pieceType: "edge",
          color,
          corners: [outerShoulders[2 * j + 1], outerShoulders[(2 * j + 2) % 10], innerShoulders[(2 * j + 2) % 10], innerShoulders[2 * j + 1]],
        });
      } else {
        // Innermost ring: corner is the real 4-point kite (apex at this
        // ring's own outer vertex, 2 shoulders, 1 point at the next ring
        // boundary's corresponding vertex) -- verified shape. Its edge
        // piece is a trapezoid whose inner corners are the next ring
        // boundary's own 2 adjacent vertices directly (untrimmed), since
        // the innermost ring's corner-kite also meets that boundary at the
        // exact vertex, not a shoulder point -- verified shape.
        stickers.push({
          id: nextId(),
          homeFaceIndex: faceIndex,
          pieceType: "corner",
          color,
          corners: [outerShoulders[2 * j], outerRingV[j], outerShoulders[2 * j + 1], innerRingV[j]],
        });
        stickers.push({
          id: nextId(),
          homeFaceIndex: faceIndex,
          pieceType: "edge",
          color,
          corners: [outerShoulders[2 * j + 1], outerShoulders[(2 * j + 2) % 10], innerRingV[(j + 1) % 5], innerRingV[j]],
        });
      }
    }
  }

  if (hasCenter) {
    stickers.push({ id: nextId(), homeFaceIndex: faceIndex, pieceType: "center", color, corners: ringVertices(ringCount) });
  } else {
    const closeRingV = ringVertices(ringCount);
    const closeShoulders = shoulderPoints(closeRingV);
    for (let j = 0; j < 5; j++) {
      stickers.push({
        id: nextId(),
        homeFaceIndex: faceIndex,
        pieceType: "corner",
        color,
        corners: [closeShoulders[2 * j], closeRingV[j], closeShoulders[2 * j + 1], C.clone()],
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

export function buildSolvedDodeca(layerCount: number): DodecaState {
  let id = 0;
  const nextId = () => id++;
  const stickers: Sticker[] = [];
  for (const f of FACE_INDICES) stickers.push(...buildFaceStickers(f, layerCount, nextId));
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
