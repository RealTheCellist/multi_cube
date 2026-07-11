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

export function buildSolvedCube(): Cubie[] {
  const cubies: Cubie[] = [];
  let id = 0;
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const position = new THREE.Vector3(x, y, z);
        const stickers: Sticker[] = [];
        if (x === 1) stickers.push({ direction: new THREE.Vector3(1, 0, 0), color: "R" });
        if (x === -1) stickers.push({ direction: new THREE.Vector3(-1, 0, 0), color: "L" });
        if (y === 1) stickers.push({ direction: new THREE.Vector3(0, 1, 0), color: "U" });
        if (y === -1) stickers.push({ direction: new THREE.Vector3(0, -1, 0), color: "D" });
        if (z === 1) stickers.push({ direction: new THREE.Vector3(0, 0, 1), color: "F" });
        if (z === -1) stickers.push({ direction: new THREE.Vector3(0, 0, -1), color: "B" });
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

function roundedComponent(v: THREE.Vector3, axis: Axis): number {
  return Math.round(v[axis]);
}

export function cubiesInLayer(cubies: Cubie[], axis: Axis, layer: number): Cubie[] {
  return cubies.filter((c) => roundedComponent(c.position, axis) === layer);
}

/**
 * Applies one raw +/-90-degree turn of the layer at `axis`=`layer` in plain
 * right-hand-rule terms (sign +1 == +90 degrees around the world axis),
 * independent of any face-letter naming. This is what the live drag gesture
 * drives directly; applyMoveToken (below) is a thin face-letter-token
 * convenience wrapper around it for scrambles/algs.
 */
export function applyRawQuarterTurn(cubies: Cubie[], axis: Axis, layer: -1 | 0 | 1, sign: 1 | -1): void {
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

/** Applies a single move token like "R", "R'", "R2", "M", "M'", "M2" to the cube state in place. */
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

export function applyAlgString(cubies: Cubie[], alg: string): void {
  for (const token of alg.trim().split(/\s+/).filter(Boolean)) {
    applyMoveToken(cubies, token);
  }
}

const IDENTITY_QUAT = new THREE.Quaternion();

export function isSolved(cubies: Cubie[]): boolean {
  return cubies.every(
    (c) => c.position.distanceToSquared(c.originalPosition) < 1e-6 && c.orientation.angleTo(IDENTITY_QUAT) < 1e-3,
  );
}

const SCRAMBLE_FACES: Face[] = ["U", "D", "L", "R", "F", "B"];
const OPPOSITE_AXIS: Record<Face, Axis> = { U: "y", D: "y", L: "x", R: "x", F: "z", B: "z" };

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

export function cloneCubies(cubies: Cubie[]): Cubie[] {
  return cubies.map((c) => ({
    id: c.id,
    originalPosition: c.originalPosition.clone(),
    position: c.position.clone(),
    orientation: c.orientation.clone(),
    stickers: c.stickers,
  }));
}

export function currentStickerWorldDirection(cubie: Cubie, sticker: Sticker): THREE.Vector3 {
  return sticker.direction.clone().applyQuaternion(cubie.orientation).round();
}

export function faceLetterForAxisSign(axis: Axis, sign: 1 | -1): Face {
  for (const face of Object.keys(FACE_TURNS) as Face[]) {
    const def = FACE_TURNS[face];
    if (def.axis === axis && Math.sign(def.layer) === sign) return face;
  }
  throw new Error("unreachable");
}
