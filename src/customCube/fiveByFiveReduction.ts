import { Alg } from "cubing/alg";
import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import type { Axis } from "./cubeMath";
import { applyMoveToken, type Cubie, type Face, FACE_TURNS, outerLayerCoordinate, roundedComponent } from "./cubeState";

// --- Slot layout, matching cubing/kpuzzle's own internal 3x3x3 corner/edge
// orbit ordering -- same names/derivation as fourByFourReduction.ts (a
// cube's corner/edge orbit naming is a property of cubing/kpuzzle, not of
// gridSize, so this is copied verbatim rather than re-derived).
const CORNER_SLOTS: readonly string[] = ["URF", "UBR", "ULB", "UFL", "DRF", "DFL", "DBL", "DRB"];
const EDGE_SLOTS: readonly string[] = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];
const CORNER_ORIENTATION_NEEDS_SWAP: readonly boolean[] = [true, true, true, true, false, false, true, true];

const FACE_AXIS_SIGN: Record<Face, { axis: Axis; sign: 1 | -1 }> = {
  R: { axis: "x", sign: 1 },
  L: { axis: "x", sign: -1 },
  U: { axis: "y", sign: 1 },
  D: { axis: "y", sign: -1 },
  F: { axis: "z", sign: 1 },
  B: { axis: "z", sign: -1 },
};

function positionFor(name: string, boundary: number): { x: number; y: number; z: number } {
  const pos = { x: 0, y: 0, z: 0 };
  for (const face of name) {
    const { axis, sign } = FACE_AXIS_SIGN[face as Face];
    pos[axis] = sign * boundary;
  }
  return pos;
}
function findCubieAt(cubies: Cubie[], pos: { x: number; y: number; z: number }): Cubie | undefined {
  return cubies.find(
    (c) => roundedComponent(c.position, "x") === pos.x && roundedComponent(c.position, "y") === pos.y && roundedComponent(c.position, "z") === pos.z,
  );
}
function colorFacing(cubie: Cubie, axis: Axis, sign: 1 | -1): Face {
  const sticker = cubie.stickers.find((s) => {
    const d = s.direction.clone().applyQuaternion(cubie.orientation).round();
    return Math.abs(d[axis] - sign) < 0.01 && d.length() > 0.5;
  });
  if (!sticker) throw new Error("no sticker facing the requested direction");
  return sticker.color;
}
function colorsAtSlot(cubies: Cubie[], name: string, boundary: number): Face[] {
  const pos = positionFor(name, boundary);
  const cubie = findCubieAt(cubies, pos);
  if (!cubie) throw new Error(`no cubie at slot ${name}`);
  return name.split("").map((face) => {
    const { axis, sign } = FACE_AXIS_SIGN[face as Face];
    return colorFacing(cubie, axis, sign);
  });
}

function rotations3<T>(list: readonly T[]): T[][] {
  return [
    [list[0], list[1], list[2]],
    [list[1], list[2], list[0]],
    [list[2], list[0], list[1]],
  ];
}

interface CornerHome {
  colors: Face[];
}
let cornerHomeCache: CornerHome[] | null = null;
function cornerHomes(): CornerHome[] {
  if (cornerHomeCache) return cornerHomeCache;
  cornerHomeCache = CORNER_SLOTS.map((name) => ({ colors: name.split("") as Face[] }));
  return cornerHomeCache;
}

function identifyCorner(observed: Face[]): { pieceIdx: number; orientation: number } | null {
  for (const [pieceIdx, home] of cornerHomes().entries()) {
    const fwd = rotations3(home.colors);
    for (let rot = 0; rot < 3; rot++) {
      const r = fwd[rot];
      if (r[0] === observed[0] && r[1] === observed[1] && r[2] === observed[2]) {
        const needsSwap = CORNER_ORIENTATION_NEEDS_SWAP[pieceIdx];
        return { pieceIdx, orientation: needsSwap ? (3 - rot) % 3 : rot };
      }
    }
    const rev = [home.colors[0], home.colors[2], home.colors[1]];
    const revRots = rotations3(rev);
    for (let rot = 0; rot < 3; rot++) {
      const r = revRots[rot];
      if (r[0] === observed[0] && r[1] === observed[1] && r[2] === observed[2]) {
        const needsSwap = CORNER_ORIENTATION_NEEDS_SWAP[pieceIdx];
        return { pieceIdx, orientation: needsSwap ? rot : (3 - rot) % 3 };
      }
    }
  }
  return null;
}
function identifyEdge(observed: Face[]): { pieceIdx: number; orientation: number } | null {
  for (const [pieceIdx, name] of EDGE_SLOTS.entries()) {
    const home = name.split("") as Face[];
    if (home[0] === observed[0] && home[1] === observed[1]) return { pieceIdx, orientation: 0 };
    if (home[0] === observed[1] && home[1] === observed[0]) return { pieceIdx, orientation: 1 };
  }
  return null;
}

/**
 * Builds a 3x3x3 KPattern representing the "reduced" state of a solved-
 * centers, paired-wings 5x5x5. Corners map directly, same as
 * fourByFourReduction.ts. Edges are simpler here than on a 4x4x4: a
 * 5x5x5's true edge is already a single, unambiguous 2-sticker piece
 * (like a real 3x3x3 edge, see fiveByFivePieces.ts), so its identity is
 * read the same direct way as a corner's -- no need to pick "either wing"
 * the way 4x4x4 does, since there's no ambiguity to resolve. The paired
 * wings aren't consulted at all here; they're along for the ride (an
 * outer-turn-only solve always moves a slot's wings + true edge together
 * as a rigid group, see cubeState.ts), and were already made to match
 * their own true edge during wing pairing.
 */
export async function buildReducedPattern(cubies: Cubie[]): Promise<KPattern> {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const boundary = 2;

  const cornerPieces: number[] = [];
  const cornerOrientation: number[] = [];
  for (const name of CORNER_SLOTS) {
    const observed = colorsAtSlot(cubies, name, boundary);
    const result = identifyCorner(observed);
    if (!result) throw new Error(`could not identify corner at slot ${name}`);
    cornerPieces.push(result.pieceIdx);
    cornerOrientation.push(result.orientation);
  }

  const edgePieces: number[] = [];
  const edgeOrientation: number[] = [];
  for (const name of EDGE_SLOTS) {
    const observed = colorsAtSlot(cubies, name, boundary);
    const result = identifyEdge(observed);
    if (!result) throw new Error(`could not identify edge at slot ${name}`);
    edgePieces.push(result.pieceIdx);
    edgeOrientation.push(result.orientation);
  }

  const patternData: KPatternData = {
    CORNERS: { pieces: cornerPieces, orientation: cornerOrientation },
    EDGES: { pieces: edgePieces, orientation: edgeOrientation },
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0] },
  };
  return new KPattern(kpuzzle, patternData);
}

type Move = readonly [Axis, number, 1 | -1];

function tokenToMoves(token: string): Move[] {
  const face = token[0] as Face;
  const suffix = token.slice(1);
  const { axis, sign: canonicalSign } = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, 5);
  if (suffix === "2") return [[axis, layer, canonicalSign] as Move, [axis, layer, canonicalSign] as Move];
  const sign = (suffix === "'" ? -canonicalSign : canonicalSign) as 1 | -1;
  return [[axis, layer, sign]];
}

export interface ReductionSolveResult {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

async function tryReduce(cubies: Cubie[], gridSize: number): Promise<ReductionSolveResult> {
  const pattern = await buildReducedPattern(cubies);
  let solutionAlg: Alg;
  try {
    solutionAlg = await experimentalSolve3x3x3IgnoringCenters(pattern);
  } catch {
    return { solved: false, movesApplied: 0, moves: [] };
  }
  const tokens = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  const moves: Move[] = [];
  for (const token of tokens) {
    applyMoveToken(cubies, token, gridSize);
    moves.push(...tokenToMoves(token));
  }
  return { solved: true, movesApplied: moves.length, moves };
}

/**
 * Solves the "reduced" 5x5x5 (centers already solved, wings already
 * paired) like a 3x3x3, applying only single-outer-layer turns -- exactly
 * what keeps paired wings paired and centers solved throughout (any
 * outer-layer-only turn always moves a whole edge-slot group, or a whole
 * center-region piece staying on the same face, as a rigid unit).
 */
export async function solveReduced5(cubies: Cubie[], gridSize: number): Promise<ReductionSolveResult> {
  return tryReduce(cubies, gridSize);
}
