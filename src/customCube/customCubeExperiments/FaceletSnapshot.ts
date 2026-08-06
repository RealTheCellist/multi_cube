// Cube Model Experiment Sprint v1 -- correctness oracle.
//
// Converts any resolved Cubie[] (ground truth or a candidate model's own
// output) into a representation-independent map of "physical facelet slot
// -> color", so two completely different internal state representations
// can be compared for correctness without caring how either one stores
// state internally. A facelet slot is (face letter, the two position
// components orthogonal to that face's axis) -- unique regardless of
// piece IDs, which different models are free to assign differently.
import type { Face } from "../cubeState";
import type { Cubie } from "../cubeState";

const DIRECTION_TO_FACE: Record<string, Face> = {
  "1,0,0": "R",
  "-1,0,0": "L",
  "0,1,0": "U",
  "0,-1,0": "D",
  "0,0,1": "F",
  "0,0,-1": "B",
};

const FACE_AXIS_COMPONENTS: Record<Face, ["x" | "y" | "z", "x" | "y" | "z"]> = {
  R: ["y", "z"],
  L: ["y", "z"],
  U: ["x", "z"],
  D: ["x", "z"],
  F: ["x", "y"],
  B: ["x", "y"],
};

export function computeFaceletMap(cubies: Cubie[]): Map<string, Face> {
  const map = new Map<string, Face>();
  for (const cubie of cubies) {
    for (const sticker of cubie.stickers) {
      const worldDir = sticker.direction.clone().applyQuaternion(cubie.orientation).round();
      const face = DIRECTION_TO_FACE[`${worldDir.x},${worldDir.y},${worldDir.z}`];
      if (!face) continue; // shouldn't happen for a geometrically valid orientation
      const [a, b] = FACE_AXIS_COMPONENTS[face];
      const key = `${face}:${cubie.position[a]}:${cubie.position[b]}`;
      map.set(key, sticker.color);
    }
  }
  return map;
}

export interface FaceletDiff {
  matches: boolean;
  totalSlots: number;
  mismatchedSlots: number;
  firstMismatchKey: string | null;
}

export function compareFaceletMaps(expected: Map<string, Face>, actual: Map<string, Face>): FaceletDiff {
  let mismatchedSlots = 0;
  let firstMismatchKey: string | null = null;
  for (const [key, color] of expected) {
    if (actual.get(key) !== color) {
      mismatchedSlots++;
      if (firstMismatchKey === null) firstMismatchKey = key;
    }
  }
  // Also catch slots the actual map has that expected doesn't (would mean
  // a candidate resolved a piece to a physically invalid position).
  for (const key of actual.keys()) {
    if (!expected.has(key)) {
      mismatchedSlots++;
      if (firstMismatchKey === null) firstMismatchKey = key;
    }
  }
  return {
    matches: mismatchedSlots === 0,
    totalSlots: expected.size,
    mismatchedSlots,
    firstMismatchKey,
  };
}
