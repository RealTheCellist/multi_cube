import * as THREE from "three";
import { type Axis, quarterTurnQuaternion, rotateGridVector90 } from "./cubeMath";

export type Face = "U" | "D" | "L" | "R" | "F" | "B";
export type ColorName = Face;

export interface FaceTurnDef {
  axis: Axis;
  layer: 1 | -1;
  // Sign of a single clockwise (viewed from outside that face) quarter turn,
  // in the same right-hand-rule convention as cubeMath.ts. Chosen to match
  // cubing.js's own move directions -- verified empirically against the
  // existing PG3D-based cube (see verify_directions.mjs) rather than derived
  // by hand, since camera "which way is clockwise" reasoning is very easy to
  // get backwards.
  sign: 1 | -1;
}

// Face-letter notation (FACE_TURNS/MIDDLE_SLICE_TURNS/randomScramble/
// applyMoveToken/faceLetterForAxisSign) only makes sense for the 3x3x3 --
// it's tied to the solver and to a single well-defined middle slice per
// axis, neither of which a 2x2 (no middle layer at all) or 4x4 (two inner
// layers per axis, not one) have. Those sizes drive turns and scrambles
// through the raw (axis, layer, sign) API directly (see
// randomLayerScramble) instead of ever going through a letter.
export const FACE_TURNS: Record<Face, FaceTurnDef> = {
  R: { axis: "x", layer: 1, sign: -1 },
  L: { axis: "x", layer: -1, sign: 1 },
  U: { axis: "y", layer: 1, sign: 1 },
  D: { axis: "y", layer: -1, sign: -1 },
  F: { axis: "z", layer: 1, sign: -1 },
  B: { axis: "z", layer: -1, sign: 1 },
};

export type MiddleSliceFace = "M" | "E" | "S";

// A slice move's direction always follows one particular adjacent outer
// face's direction (M follows L, E follows D, S follows F) rather than
// having an independent convention of its own.
export const MIDDLE_SLICE_TURNS: Record<MiddleSliceFace, { axis: Axis; sign: 1 | -1 }> = {
  M: { axis: "x", sign: FACE_TURNS.L.sign },
  E: { axis: "y", sign: FACE_TURNS.D.sign },
  S: { axis: "z", sign: FACE_TURNS.F.sign },
};

const AXIS_TO_MIDDLE_SLICE_FACE: Record<Axis, MiddleSliceFace> = { x: "M", y: "E", z: "S" };
export function middleSliceLetterForAxis(axis: Axis): MiddleSliceFace {
  return AXIS_TO_MIDDLE_SLICE_FACE[axis];
}

export const FACE_COLORS: Record<Face, string> = {
  U: "#ffffff",
  D: "#ffd500",
  L: "#ff8000",
  R: "#c41e3a",
  F: "#009e60",
  B: "#0051ba",
};

export interface Sticker {
  direction: THREE.Vector3;
  color: Face;
}

export interface Cubie {
  id: number;
  originalPosition: THREE.Vector3;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
  stickers: Sticker[];
}

/**
 * Builds a solved NxN cube's cubies. Grid indices run 0..gridSize-1 per
 * axis, converted to a centered coordinate (index - (gridSize-1)/2) so the
 * cube is centered on the origin regardless of size -- for odd sizes this
 * lands on integers (e.g. -1,0,1 for 3x3), for even sizes on half-integers
 * (e.g. -1.5,-0.5,0.5,1.5 for 4x4), both of which cubeMath's rotation
 * formulas handle identically since they never assume integer inputs.
 * A cubie exists unless *every* axis is strictly interior (not the first or
 * last layer) -- for gridSize<=2 that's never true, so every position is
 * kept (2x2 is all corners); for gridSize 3 it excludes only the single
 * true center; for 4 it excludes the hidden inner 2x2x2 block (8 cubies),
 * matching a real 4x4x4's 56 visible pieces.
 */
export function buildSolvedCube(gridSize: number): Cubie[] {
  const cubies: Cubie[] = [];
  let id = 0;
  const offset = (gridSize - 1) / 2;
  const isBoundary = (i: number) => i === 0 || i === gridSize - 1;
  for (let xi = 0; xi < gridSize; xi++) {
    for (let yi = 0; yi < gridSize; yi++) {
      for (let zi = 0; zi < gridSize; zi++) {
        if (!isBoundary(xi) && !isBoundary(yi) && !isBoundary(zi)) continue;
        const position = new THREE.Vector3(xi - offset, yi - offset, zi - offset);
        const stickers: Sticker[] = [];
        if (xi === gridSize - 1) stickers.push({ direction: new THREE.Vector3(1, 0, 0), color: "R" });
        if (xi === 0) stickers.push({ direction: new THREE.Vector3(-1, 0, 0), color: "L" });
        if (yi === gridSize - 1) stickers.push({ direction: new THREE.Vector3(0, 1, 0), color: "U" });
        if (yi === 0) stickers.push({ direction: new THREE.Vector3(0, -1, 0), color: "D" });
        if (zi === gridSize - 1) stickers.push({ direction: new THREE.Vector3(0, 0, 1), color: "F" });
        if (zi === 0) stickers.push({ direction: new THREE.Vector3(0, 0, -1), color: "B" });
        cubies.push({
          id: id++,
          originalPosition: position.clone(),
          position: position.clone(),
          orientation: new THREE.Quaternion(),
          stickers,
        });
      }
    }
  }
  return cubies;
}

// Snaps to the nearest half-integer rather than the nearest integer: valid
// grid coordinates are exact integers for odd gridSizes and exact
// half-integers for even ones, and this one formula lands correctly on
// either (e.g. round(1.48*2)/2 = 1.5, round(0.97*2)/2 = 1) without needing
// to know which parity is in play.
function roundedComponent(v: THREE.Vector3, axis: Axis): number {
  return Math.round(v[axis] * 2) / 2;
}

export function cubiesInLayer(cubies: Cubie[], axis: Axis, layer: number): Cubie[] {
  return cubies.filter((c) => roundedComponent(c.position, axis) === layer);
}

/**
 * Applies one raw +/-90-degree turn of the layer at `axis`=`layer` in plain
 * right-hand-rule terms (sign +1 == +90 degrees around the world axis),
 * independent of any face-letter naming. This is what the live drag gesture
 * drives directly; applyMoveToken (below) is a thin face-letter-token
 * convenience wrapper around it for 3x3x3 scrambles/algs.
 */
export function applyRawQuarterTurn(cubies: Cubie[], axis: Axis, layer: number, sign: 1 | -1): void {
  const quat = quarterTurnQuaternion(axis, sign);
  for (const cubie of cubiesInLayer(cubies, axis, layer)) {
    cubie.position = rotateGridVector90(cubie.position, axis, sign);
    cubie.orientation = quat.clone().multiply(cubie.orientation);
  }
}

function applyQuarterTurnOnce(cubies: Cubie[], face: Face): void {
  const { axis, layer, sign } = FACE_TURNS[face];
  applyRawQuarterTurn(cubies, axis, layer, sign);
}

/** Applies a single move token like "R", "R'", "R2", "M", "M'", "M2" to a 3x3x3's cube state in place. */
export function applyMoveToken(cubies: Cubie[], token: string): void {
  const face = token[0] as Face | "M" | "E" | "S";
  const suffix = token.slice(1);
  const times = suffix === "2" ? 2 : suffix === "'" ? 3 : 1;
  if (face === "M" || face === "E" || face === "S") {
    const { axis, sign } = MIDDLE_SLICE_TURNS[face];
    for (let i = 0; i < times; i++) applyRawQuarterTurn(cubies, axis, 0, sign);
    return;
  }
  for (let i = 0; i < times; i++) applyQuarterTurnOnce(cubies, face);
}

const IDENTITY_QUAT = new THREE.Quaternion();

export function isSolved(cubies: Cubie[]): boolean {
  return cubies.every(
    (c) => c.position.distanceToSquared(c.originalPosition) < 1e-6 && c.orientation.angleTo(IDENTITY_QUAT) < 1e-3,
  );
}

const SCRAMBLE_FACES: Face[] = ["U", "D", "L", "R", "F", "B"];
const OPPOSITE_AXIS: Record<Face, Axis> = { U: "y", D: "y", L: "x", R: "x", F: "z", B: "z" };

/** Letter-notation scramble for the 3x3x3 -- also feeds the solver's move history. */
export function randomScramble(length = 20): string[] {
  const moves: string[] = [];
  let lastAxis: Axis | null = null;
  while (moves.length < length) {
    const face = SCRAMBLE_FACES[Math.floor(Math.random() * SCRAMBLE_FACES.length)];
    const axis = OPPOSITE_AXIS[face];
    if (axis === lastAxis) continue;
    lastAxis = axis;
    const suffix = ["", "'", "2"][Math.floor(Math.random() * 3)];
    moves.push(face + suffix);
  }
  return moves;
}

const ALL_AXES: Axis[] = ["x", "y", "z"];

/**
 * Scrambles a cube of any size by applying raw (axis, layer, sign) turns
 * directly, with no letter notation involved -- the only option for sizes
 * without a single well-defined face-letter scheme (2x2 has no fixed layer
 * at all per axis to call "the" R layer by convention; 4x4 has two inner
 * layers per axis instead of one center). Avoids immediately repeating the
 * same (axis, layer) pair back-to-back so consecutive scramble turns don't
 * trivially cancel out.
 */
export function randomLayerScramble(cubies: Cubie[], gridSize: number, length = 25): void {
  const offset = (gridSize - 1) / 2;
  const layers: number[] = [];
  for (let i = 0; i < gridSize; i++) layers.push(i - offset);

  let lastKey = "";
  for (let i = 0; i < length; i++) {
    let axis: Axis;
    let layer: number;
    let key: string;
    do {
      axis = ALL_AXES[Math.floor(Math.random() * ALL_AXES.length)];
      layer = layers[Math.floor(Math.random() * layers.length)];
      key = `${axis}:${layer}`;
    } while (key === lastKey);
    lastKey = key;
    const sign = Math.random() < 0.5 ? 1 : -1;
    applyRawQuarterTurn(cubies, axis, layer, sign);
  }
}

export function faceLetterForAxisSign(axis: Axis, sign: 1 | -1): Face {
  for (const face of Object.keys(FACE_TURNS) as Face[]) {
    const def = FACE_TURNS[face];
    if (def.axis === axis && Math.sign(def.layer) === sign) return face;
  }
  throw new Error("unreachable");
}
