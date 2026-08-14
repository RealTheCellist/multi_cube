import * as THREE from "three";

// Regular tetrahedron, apex (vertex 0) pointing up toward +Y, base
// (vertices 1-3) below -- same coordinates as the validated concept render
// this file's turn math grows out of. Centroid of these 4 points is exactly
// the origin (apex y=1 cancels 3*(-1/3); base x/z cancel by 120-degree
// symmetry), which is what lets every vertex's own direction from the
// origin double as its turn axis with no separate axis table needed.
const R = Math.sqrt(8) / 3;
export const VERTICES: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(R * Math.cos(Math.PI / 2), -1 / 3, R * Math.sin(Math.PI / 2)),
  new THREE.Vector3(R * Math.cos((7 * Math.PI) / 6), -1 / 3, R * Math.sin((7 * Math.PI) / 6)),
  new THREE.Vector3(R * Math.cos((11 * Math.PI) / 6), -1 / 3, R * Math.sin((11 * Math.PI) / 6)),
];

export type VertexIndex = 0 | 1 | 2 | 3;
export const VERTEX_INDICES: readonly VertexIndex[] = [0, 1, 2, 3];

// Face `f` is the triangle opposite vertex `f`, built from the other 3
// vertices in ascending index order -- this fixed order is what the
// sticker-grid parametrization in tetraState.ts's buildSolvedTetra keys its
// (i,j) coordinates against, so it must stay stable.
export const FACE_VERTEX_INDICES: readonly (readonly VertexIndex[])[] = [
  [1, 2, 3],
  [0, 2, 3],
  [0, 1, 3],
  [0, 1, 2],
];

const AXES: readonly THREE.Vector3[] = VERTICES.map((v) => v.clone().normalize());

export function axisVector(vertexIndex: VertexIndex): THREE.Vector3 {
  return AXES[vertexIndex];
}

// Barycentric-conversion matrix, precomputed once: for any point P,
// (b1,b2,b3) = INVERSE * (P - V0), b0 = 1 - b1 - b2 - b3. Regular
// tetrahedron -> always invertible (the 3 edge vectors from V0 are linearly
// independent), so no runtime invertibility check is needed.
const BARY_BASIS = new THREE.Matrix3().set(
  VERTICES[1].x - VERTICES[0].x,
  VERTICES[2].x - VERTICES[0].x,
  VERTICES[3].x - VERTICES[0].x,
  VERTICES[1].y - VERTICES[0].y,
  VERTICES[2].y - VERTICES[0].y,
  VERTICES[3].y - VERTICES[0].y,
  VERTICES[1].z - VERTICES[0].z,
  VERTICES[2].z - VERTICES[0].z,
  VERTICES[3].z - VERTICES[0].z,
);
const BARY_INVERSE = BARY_BASIS.clone().invert();

/** Barycentric coordinates [b0,b1,b2,b3] of a point relative to VERTICES, summing to 1. */
export function barycentricOf(point: THREE.Vector3): [number, number, number, number] {
  const local = point.clone().sub(VERTICES[0]).applyMatrix3(BARY_INVERSE);
  const b1 = local.x;
  const b2 = local.y;
  const b3 = local.z;
  return [1 - b1 - b2 - b3, b1, b2, b3];
}

/**
 * How many turn-layers deep `point` sits from vertex `vertexIndex`, for a
 * puzzle with `layerCount` layers per edge: 0 at the vertex itself, up to
 * layerCount-1 approaching (but never reaching) the opposite face. Barycentric
 * weight b_vertex is 1 exactly at the vertex and 0 on the opposite face, so
 * depth = layerCount*(1 - b_vertex) runs 0..layerCount and is rounded to the
 * nearest integer -- exact for the lattice points/cell-centroids this is
 * actually evaluated at (both at construction time and after any live turn,
 * since turns are exact multiples of a 120-degree rotation about the origin).
 */
export function depthFromVertex(point: THREE.Vector3, vertexIndex: VertexIndex, layerCount: number): number {
  const bary = barycentricOf(point);
  return Math.round(layerCount * (1 - bary[vertexIndex]));
}

/** Which face (0-3, by its opposite vertex) `point` currently lies on: the vertex with the smallest barycentric weight. */
export function nearestFaceIndex(point: THREE.Vector3): VertexIndex {
  const bary = barycentricOf(point);
  let best: VertexIndex = 0;
  for (const i of VERTEX_INDICES) if (bary[i] < bary[best]) best = i;
  return best;
}

/**
 * A single 120-degree turn about vertex `vertexIndex`'s axis. Unlike the
 * cube's rotateGridVector90+quarterTurnQuaternion pair, there's no separate
 * "rotate an integer grid vector" helper -- sticker positions were never on
 * an integer lattice to begin with, so THREE.Vector3.applyQuaternion(this)
 * directly is exact and sufficient (see tetraState.ts's applyRawThirdTurn).
 */
export function thirdTurnQuaternion(vertexIndex: VertexIndex, sign: 1 | -1): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axisVector(vertexIndex), sign * ((2 * Math.PI) / 3));
}
