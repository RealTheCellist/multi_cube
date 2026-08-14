import * as THREE from "three";
import { FACE_COLORS, mulberry32, type Rng } from "../customCube/cubeState";
import { depthFromVertex, FACE_VERTEX_INDICES, nearestFaceIndex, thirdTurnQuaternion, VERTEX_INDICES, VERTICES, type VertexIndex } from "./tetraMath";

export { mulberry32, type Rng };

// Same 4 colors the existing NxNxN cube uses (imported, not re-declared) --
// deliberate brand consistency, not coincidence. Face `f` here means "the
// face opposite vertex f" (see tetraMath.ts's FACE_VERTEX_INDICES).
export const TETRA_FACE_COLORS: readonly [string, string, string, string] = [
  FACE_COLORS.D, // face opposite vertex 0 (the apex) -- the base, never touched by any turn
  FACE_COLORS.F,
  FACE_COLORS.R,
  FACE_COLORS.B,
];

export type PieceType = "tip" | "edge" | "center" | "axial";

export interface Sticker {
  id: number;
  homeFaceIndex: VertexIndex;
  pieceType: PieceType;
  color: string;
  // Live, world-space triangle corners (un-inset -- CustomTetraScene applies
  // the visual inset/gap treatment; this is the puzzle-logic-true geometry,
  // same spirit as cubeState's Cubie.position/orientation being the exact
  // grid transform with no rendering bevel baked in).
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

export interface TetraState {
  layerCount: number;
  stickers: Sticker[];
}

function centroidOf(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
  return corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
}

/**
 * Builds a solved N-layer tetrahedron's stickers. Each face is subdivided
 * into layerCount^2 small triangles via a standard barycentric grid
 * (grid(i,j) = A*(1-i/N-j/N) + B*(i/N) + C*(j/N)); "up" cells are always
 * turnable stickers. "down" cells (the inverted triangles between them) are
 * labeled "axial" here, but that's a construction-time shape label, not a
 * promise that they never turn -- see stickersForTurn's comment for why only
 * one down-cell per face (the true fixed-core piece) is actually immovable
 * once N>=4, and why the depth check there (not this label) is what decides
 * turn membership.
 */
export function buildSolvedTetra(layerCount: number): TetraState {
  const N = layerCount;
  const stickers: Sticker[] = [];
  let id = 0;

  for (const f of VERTEX_INDICES) {
    const [ia, ib, ic] = FACE_VERTEX_INDICES[f];
    const A = VERTICES[ia];
    const B = VERTICES[ib];
    const C = VERTICES[ic];

    const grid: THREE.Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
      grid[i] = [];
      for (let j = 0; j <= N - i; j++) {
        grid[i][j] = new THREE.Vector3()
          .addScaledVector(A, 1 - i / N - j / N)
          .addScaledVector(B, i / N)
          .addScaledVector(C, j / N);
      }
    }

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N - i; j++) {
        // UP cell -- always a real, potentially-turnable sticker.
        const isTip = (i === 0 && j === 0) || (i === N - 1 && j === 0) || (i === 0 && j === N - 1);
        const isEdge = !isTip && (i === 0 || j === 0 || i + j === N - 1);
        const pieceType: PieceType = isTip ? "tip" : isEdge ? "edge" : "center";
        stickers.push({
          id: id++,
          homeFaceIndex: f,
          pieceType,
          color: TETRA_FACE_COLORS[f],
          corners: [grid[i][j].clone(), grid[i + 1][j].clone(), grid[i][j + 1].clone()],
        });

        // DOWN cell -- always axial (fixed to the core, never a turn member).
        if (i + j <= N - 2) {
          stickers.push({
            id: id++,
            homeFaceIndex: f,
            pieceType: "axial",
            color: TETRA_FACE_COLORS[f],
            corners: [grid[i + 1][j].clone(), grid[i][j + 1].clone(), grid[i + 1][j + 1].clone()],
          });
        }
      }
    }
  }

  const expected = 4 * N * N;
  if (stickers.length !== expected) {
    throw new Error(`buildSolvedTetra(${N}): expected ${expected} stickers (4*N^2), got ${stickers.length}`);
  }

  return { layerCount: N, stickers };
}

/**
 * A sticker's depth from `vertexIndex` is the MIN of its 3 corners' depths,
 * not its centroid's depth. At construction, an "up" cell (i,j)'s corners
 * are grid(i,j)/grid(i+1,j)/grid(i,j+1) -- grid(i,j) itself (the cell's own
 * address) is always the shallowest of the three, so this reduces exactly
 * to the plan's original i+j depth formula. The centroid is NOT equivalent:
 * averaging first and taking barycentric depth of that average systematically
 * reads one layer too deep for a tip sticker (verified empirically -- see
 * tetra_verify.mjs's initial failing run before this fix), since a tip
 * sticker's other two corners are already one full layer away from the
 * vertex even though the sticker itself is correctly "layer 0".
 */
function minDepthFromVertex(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3], vertexIndex: VertexIndex, layerCount: number): number {
  return Math.min(...corners.map((c) => depthFromVertex(c, vertexIndex, layerCount)));
}

/**
 * Stickers that belong to a turn about `vertexIndex`'s axis at cutoff depth
 * `depth` (1..layerCount-1 -- 1 is the shallowest/tip-only turn, layerCount-1
 * is the deepest). Judged purely by LIVE depth (works after any number of
 * prior turns, not just at the solved state), matching cubiesInLayer's
 * live-position-based filtering in cubeState.ts.
 *
 * "axial" (down-cell) stickers are NOT blanket-excluded here, even though
 * most of them are labeled "axial" at construction time. For N=3 that label
 * happens to coincide with "never turns" (there's exactly one down-cell per
 * face, and it really is the fixed core piece). For N>=4 it doesn't: only
 * the innermost down-cell per face is genuinely fixed to the core, and the
 * rest are down-cell facets of edge/center pieces that DO move with the
 * appropriate turn. Excluding all of them by pieceType (an earlier version
 * of this function did) leaves those live-adjacent down-cells behind when
 * their up-cell neighbors turn, tearing a hole in the tetrahedron's surface
 * (visible gaps + exposed backing plastic) at exactly the shared boundary --
 * confirmed by an edge-adjacency tiling check (every triangle edge must be
 * shared by exactly 2 stickers; the old code produced dozens of unshared
 * edges after a single deep turn, even for N=3). The depth check alone
 * already correctly leaves the true fixed-core piece behind: it sits at
 * maximum depth from every vertex whose turns could reach its face, so
 * minDepthFromVertex is never less than any valid cutoff.
 */
export function stickersForTurn(state: TetraState, vertexIndex: VertexIndex, depth: number): Sticker[] {
  return state.stickers.filter((s) => minDepthFromVertex(s.corners, vertexIndex, state.layerCount) < depth);
}

/** Applies one raw +/-120-degree turn about `vertexIndex`'s axis at cutoff `depth`, in place. */
export function applyRawThirdTurn(state: TetraState, vertexIndex: VertexIndex, depth: number, sign: 1 | -1): void {
  const quat = thirdTurnQuaternion(vertexIndex, sign);
  for (const sticker of stickersForTurn(state, vertexIndex, depth)) {
    sticker.corners = [sticker.corners[0].applyQuaternion(quat), sticker.corners[1].applyQuaternion(quat), sticker.corners[2].applyQuaternion(quat)];
  }
}

/**
 * A sticker is correctly placed when it currently sits on the face whose
 * color it shows -- checked by which face its live centroid is nearest to,
 * not by exact original-cell identity, same spirit as cubeState.isSolved
 * (color-vs-facing-direction, not per-piece identity) since same-face
 * same-color stickers are visually interchangeable. Checked for every
 * sticker, including "axial"-labeled ones: for N>=4 most of those actually
 * move with turns now (see stickersForTurn), so they need the same check as
 * everything else -- only the true fixed-core piece is exempt in practice,
 * and it trivially passes since it never leaves home.
 */
export function isSolved(state: TetraState): boolean {
  return state.stickers.every((s) => nearestFaceIndex(centroidOf(s.corners)) === s.homeFaceIndex);
}

export interface RawTetraTurn {
  vertexIndex: VertexIndex;
  depth: number;
  sign: 1 | -1;
}

/** Random (vertex, depth, sign) turns, avoiding immediate repeats of the same (vertex, depth) pair. */
export function generateRandomThirdTurns(layerCount: number, length = 20, rng: Rng = Math.random): RawTetraTurn[] {
  const depths: number[] = [];
  for (let d = 1; d <= layerCount - 1; d++) depths.push(d);

  const turns: RawTetraTurn[] = [];
  let lastKey = "";
  for (let i = 0; i < length; i++) {
    let vertexIndex: VertexIndex;
    let depth: number;
    let key: string;
    do {
      vertexIndex = VERTEX_INDICES[Math.floor(rng() * VERTEX_INDICES.length)];
      depth = depths[Math.floor(rng() * depths.length)];
      key = `${vertexIndex}:${depth}`;
    } while (key === lastKey);
    lastKey = key;
    const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;
    turns.push({ vertexIndex, depth, sign });
  }
  return turns;
}

export function randomTetraScramble(state: TetraState, length = 20, rng: Rng = Math.random): void {
  for (const { vertexIndex, depth, sign } of generateRandomThirdTurns(state.layerCount, length, rng)) {
    applyRawThirdTurn(state, vertexIndex, depth, sign);
  }
}
