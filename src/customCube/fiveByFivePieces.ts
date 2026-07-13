import type * as THREE from "three";
import type { Axis } from "./cubeMath";
import { type Cubie, type Face, roundedComponent } from "./cubeState";

// --- Piece classification -------------------------------------------------
// A 5x5x5 (odd) has genuinely different piece types than a 4x4x4 (even):
// each face has a single fixed true center (like a 3x3x3's center -- it
// never needs solving independently, only 3x3x3-style reduction cares about
// whichever face has which color) plus 8 movable "region" pieces around it
// (4 X-centers, diagonal from the true center, and 4 T-centers/obliques,
// orthogonal from it) that DO need solving to match the true center's
// color. Each edge line similarly has a single fixed true edge (a normal
// 3x3x3-style 2-sticker piece, only needs permuting/flipping into place,
// no pairing) plus 2 movable wing pieces that need pairing to match it.
// Verified against buildSolvedCube(5): 8 corners, 12 true edges + 24 wing
// edges (36 total), 6 true centers + 24 X-centers + 24 T-centers (54
// total) = 98, matching a real 5x5x5's visible-piece count exactly.

const BOUNDARY = 2; // (gridSize-1)/2 for gridSize=5
const AXES: Axis[] = ["x", "y", "z"];

export type PieceType5 = "corner" | "trueEdge" | "wingEdge" | "trueCenter" | "xCenter" | "tCenter";

export function pieceType5(cubie: Cubie): PieceType5 {
  const vals = AXES.map((a) => roundedComponent(cubie.position, a));
  const boundaryCount = vals.filter((v) => Math.abs(v) === BOUNDARY).length;
  if (boundaryCount === 3) return "corner";
  if (boundaryCount === 2) {
    const free = vals.find((v) => Math.abs(v) !== BOUNDARY)!;
    return free === 0 ? "trueEdge" : "wingEdge";
  }
  // boundaryCount === 1: some form of center.
  const others = vals.filter((v) => Math.abs(v) !== BOUNDARY);
  const zeroCount = others.filter((v) => v === 0).length;
  if (zeroCount === 2) return "trueCenter";
  if (zeroCount === 0) return "xCenter";
  return "tCenter";
}

const FACE_AXIS_SIGN: Record<Face, { axis: Axis; sign: 1 | -1 }> = {
  R: { axis: "x", sign: 1 },
  L: { axis: "x", sign: -1 },
  U: { axis: "y", sign: 1 },
  D: { axis: "y", sign: -1 },
  F: { axis: "z", sign: 1 },
  B: { axis: "z", sign: -1 },
};
const ALL_FACES: Face[] = ["U", "D", "L", "R", "F", "B"];

/** Which face a corner/edge/center piece currently sits on (its boundary axis). */
export function faceOfPosition(cubie: Cubie): Face {
  for (const face of ALL_FACES) {
    const { axis, sign } = FACE_AXIS_SIGN[face];
    if (roundedComponent(cubie.position, axis) === sign * BOUNDARY) return face;
  }
  throw new Error("position is not on a face boundary");
}

const DIRECTION_TO_FACE: Record<string, Face> = {
  "1,0,0": "R",
  "-1,0,0": "L",
  "0,1,0": "U",
  "0,-1,0": "D",
  "0,0,1": "F",
  "0,0,-1": "B",
};

/** Which face-color a sticker is CURRENTLY facing, given the cubie's live orientation. */
export function currentFacingColor(cubie: Cubie, stickerDirection: THREE.Vector3): Face {
  const d = stickerDirection.clone().applyQuaternion(cubie.orientation).round();
  return DIRECTION_TO_FACE[`${d.x},${d.y},${d.z}`];
}
