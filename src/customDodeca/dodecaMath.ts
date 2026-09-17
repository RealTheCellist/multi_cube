import * as THREE from "three";

// Regular dodecahedron, centered on the origin. Standard construction: the
// 8 cube vertices (±1,±1,±1) plus 12 more at (0,±1/phi,±phi),
// (±1/phi,±phi,0), (±phi,0,±1/phi) -- these 20 points are a well-known
// coordinatization of a regular dodecahedron (not derived here from first
// principles, but VERIFIED below and via a standalone script before this
// file existed: 12 planar regular-pentagon faces, 30 distinct edges, every
// vertex touching exactly 3 faces, consistent outward winding -- see this
// module's own runtime assertions).
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

const VERTICES_RAW: readonly [number, number, number][] = [
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1],
  [-1, 1, 1],
  [-1, 1, -1],
  [-1, -1, 1],
  [-1, -1, -1],
  [0, INV_PHI, PHI],
  [0, INV_PHI, -PHI],
  [0, -INV_PHI, PHI],
  [0, -INV_PHI, -PHI],
  [INV_PHI, PHI, 0],
  [INV_PHI, -PHI, 0],
  [-INV_PHI, PHI, 0],
  [-INV_PHI, -PHI, 0],
  [PHI, 0, INV_PHI],
  [PHI, 0, -INV_PHI],
  [-PHI, 0, INV_PHI],
  [-PHI, 0, -INV_PHI],
];

export const VERTICES: readonly THREE.Vector3[] = VERTICES_RAW.map(([x, y, z]) => new THREE.Vector3(x, y, z));

export type VertexIndex = number; // 0..19
export type FaceIndex = number; // 0..11
export const FACE_INDICES: readonly FaceIndex[] = Array.from({ length: 12 }, (_, i) => i);

/**
 * Each face's 5 vertex indices, in outward-CCW winding order (viewed from
 * outside the solid, looking toward the origin) -- derived and verified by a
 * standalone script (union-find-free: built the vertex adjacency graph from
 * the true minimum edge length, walked each face by consistently turning
 * toward the neighbor that keeps the walk convex, then checked every face is
 * planar, every edge equal-length, exactly 30 distinct edges total, and
 * every vertex touches exactly 3 faces) before being copied here -- NOT
 * hand-derived/guessed, since a 20-vertex/12-face combinatorial structure is
 * too easy to get subtly wrong by hand. See this module's own startup
 * assertions for the same checks re-run at runtime against these literals.
 */
export const FACE_VERTEX_INDICES: readonly (readonly [VertexIndex, VertexIndex, VertexIndex, VertexIndex, VertexIndex])[] = [
  [0, 8, 10, 2, 16],
  [0, 12, 14, 4, 8],
  [0, 16, 17, 1, 12],
  [1, 9, 5, 14, 12],
  [1, 17, 3, 11, 9],
  [2, 10, 6, 15, 13],
  [2, 13, 3, 17, 16],
  [3, 13, 15, 7, 11],
  [4, 14, 5, 19, 18],
  [4, 18, 6, 10, 8],
  [5, 9, 11, 7, 19],
  [6, 18, 19, 7, 15],
];

/** Outward face-normal direction, one per face -- the turn axis for that face. */
export const FACE_NORMALS: readonly THREE.Vector3[] = FACE_VERTEX_INDICES.map((members) => {
  const sum = new THREE.Vector3();
  for (const i of members) sum.add(VERTICES[i]);
  return sum.divideScalar(5).normalize();
});

export function faceAxis(faceIndex: FaceIndex): THREE.Vector3 {
  return FACE_NORMALS[faceIndex];
}

// Every face-plane sits the same signed distance R from the origin along its
// own normal (regular solid, centered) -- computed once from real vertex
// data rather than hardcoded, same spirit as tetraMath.ts's BARY_INVERSE.
// The dodecahedron is centrally symmetric (every face has a true parallel
// antipodal face, unlike the tetrahedron's vertex/opposite-FACE pairing), so
// the opposite plane sits at exactly -R along the same axis.
const FACE_PLANE_DISTANCE = VERTICES[FACE_VERTEX_INDICES[0][0]].dot(FACE_NORMALS[0]);

/**
 * How many turn-layers deep `point` sits from face `faceIndex`, for a
 * puzzle with `layerCount` layers: 0 at that face's own plane, up to
 * layerCount approaching (but never reaching) the antipodal face's plane.
 * Same shape as tetraMath.ts's depthFromVertex, but driven by a linear
 * projection onto the face axis (dodecahedron is centrally symmetric,
 * unlike the tetrahedron) instead of a barycentric weight.
 */
export function depthFromFace(point: THREE.Vector3, faceIndex: FaceIndex, layerCount: number): number {
  const d = point.dot(FACE_NORMALS[faceIndex]);
  const t = (d + FACE_PLANE_DISTANCE) / (2 * FACE_PLANE_DISTANCE);
  return Math.round(layerCount * (1 - t));
}

/** Which face `point` currently lies nearest to (largest dot product with that face's normal). */
export function nearestFaceIndex(point: THREE.Vector3): FaceIndex {
  let best: FaceIndex = 0;
  let bestDot = -Infinity;
  for (const f of FACE_INDICES) {
    const d = point.dot(FACE_NORMALS[f]);
    if (d > bestDot) {
      bestDot = d;
      best = f;
    }
  }
  return best;
}

/** A single turn about face `faceIndex`'s axis. Pentagon symmetry -> a fifth-turn (72 degrees), not a third-turn. */
export function fifthTurnQuaternion(faceIndex: FaceIndex, sign: 1 | -1): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(faceAxis(faceIndex), sign * ((2 * Math.PI) / 5));
}

// ---- Startup self-check (cheap, runs once at module load) ----
// Re-verifies the hardcoded FACE_VERTEX_INDICES table against the actual
// VERTICES data, so a future edit to either one that breaks their
// correspondence fails loudly instead of silently rendering garbage.
function assertGeometry(): void {
  const EPS = 1e-6;
  const edgeSet = new Set<string>();
  const vertexFaceCount = new Array(20).fill(0);
  for (const [fi, members] of FACE_VERTEX_INDICES.entries()) {
    const normal = FACE_NORMALS[fi];
    const dots = members.map((i) => VERTICES[i].dot(normal));
    const spread = Math.max(...dots) - Math.min(...dots);
    if (spread > EPS) throw new Error(`dodecaMath: face ${fi} not planar (spread ${spread})`);

    const pts = members.map((i) => VERTICES[i]);
    const edgeLens = pts.map((p, i) => p.distanceTo(pts[(i + 1) % 5]));
    const edgeSpread = Math.max(...edgeLens) - Math.min(...edgeLens);
    if (edgeSpread > EPS) throw new Error(`dodecaMath: face ${fi} not a regular pentagon (edge spread ${edgeSpread})`);

    const winding = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[1])).dot(normal);
    if (winding <= 0) throw new Error(`dodecaMath: face ${fi} winding is not CCW-from-outside`);

    for (let k = 0; k < 5; k++) {
      const a = members[k],
        b = members[(k + 1) % 5];
      edgeSet.add(a < b ? `${a}-${b}` : `${b}-${a}`);
      vertexFaceCount[a]++;
    }
  }
  if (edgeSet.size !== 30) throw new Error(`dodecaMath: expected 30 distinct edges, got ${edgeSet.size}`);
  if (vertexFaceCount.some((c) => c !== 3)) throw new Error(`dodecaMath: not every vertex touches exactly 3 faces: ${vertexFaceCount}`);
}
assertGeometry();
