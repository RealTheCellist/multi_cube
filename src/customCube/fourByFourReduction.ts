import { Alg } from "cubing/alg";
import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import type { Axis } from "./cubeMath";
import { type Cubie, type Face, applyMoveToken, applyRawQuarterTurn, roundedComponent } from "./cubeState";
import { pieceType } from "./fourByFourCenters";

// --- Slot layout, matching cubing/kpuzzle's own internal 3x3x3 corner/edge
// orbit ordering exactly (piece index i's home is slot i). This was derived
// empirically, not from documentation: build a solved 3x3x3 KPuzzle
// pattern, apply each single face move, and diff patternData to see which
// slots move together under which face -- e.g. only R, U, F ever touch slot
// 0's occupant, and no other corner slot has exactly that set, which
// uniquely identifies it as the URF corner. See git history for the
// original derivation script.
const CORNER_SLOTS: readonly string[] = ["URF", "UBR", "ULB", "UFL", "DRF", "DFL", "DBL", "DRB"];
const EDGE_SLOTS: readonly string[] = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"];

// Corner orientation calibration: reading a corner's 3 sticker colors in the
// literal letter order of its slot name (e.g. "ULB" -> U-color, L-color,
// B-color) traces a geometrically consistent rotation direction for some
// corners but the mirror image of it for others (corners alternate
// handedness -- this is just a byproduct of which order the letters happen
// to be written in for each of the 8 names above, not a deep cube fact).
// This table says which slots need the swap; it was determined empirically
// by comparing against real KPuzzle orientation values across ~1300 sampled
// states (single moves plus 200 random short scrambles) with zero
// conflicts, not derived by hand -- get this wrong and every corner-based
// solve hint would be silently wrong.
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
function findCubiesAt(cubies: Cubie[], pos: { x: number; y: number; z: number }, freeAxis: Axis): Cubie[] {
  const boundaryAxes = (["x", "y", "z"] as Axis[]).filter((a) => a !== freeAxis);
  // Matching on just the 2 boundary axes (deliberately ignoring the free
  // axis, since both wings share these but differ there) also catches
  // corners that happen to share the same 2 boundary values -- e.g. a
  // corner at (1.5,1.5,1.5) matches the "UR" edge slot's (x=1.5,y=1.5) just
  // as well, since its z is never checked. Restricting to pieceType==="edge"
  // is what actually makes this specific to wings.
  return cubies.filter((c) => pieceType(c) === "edge" && boundaryAxes.every((a) => roundedComponent(c.position, a) === pos[a]));
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
  // The 3x3x3's own solved corners define the reference colors (a fixed
  // property of face letters, independent of gridSize).
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
 * centers, paired-edges 4x4x4: real corners map directly, and each pair of
 * paired wings stands in for one 3x3x3 edge (either wing's colors work,
 * since a correctly paired dedge has both wings showing the same 2 colors).
 * Centers are the trivial identity -- the solver never looks at them (see
 * experimentalSolve3x3x3IgnoringCenters), and they're already correct
 * anyway by the time this runs.
 */
export async function buildReducedPattern(cubies: Cubie[]): Promise<KPattern> {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const boundary = 1.5;

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
    const pos = positionFor(name, boundary);
    const freeAxis = (["x", "y", "z"] as Axis[]).find((a) => pos[a] === 0)!;
    const wings = findCubiesAt(cubies, pos, freeAxis);
    if (wings.length === 0) throw new Error(`no wing cubies at slot ${name}`);
    const observed = name.split("").map((face) => {
      const { axis, sign } = FACE_AXIS_SIGN[face as Face];
      return colorFacing(wings[0], axis, sign);
    }) as Face[];
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

export interface ReductionSolveResult {
  solved: boolean;
  movesApplied: number;
}

/**
 * Solves the "reduced" 4x4x4 (centers already solved, edges already paired)
 * like a 3x3x3, applying only single-outer-layer turns -- which is exactly
 * what keeps paired dedges paired and centers solved throughout (see
 * cubeState.ts: any outer-layer-only turn always moves a whole dedge as a
 * rigid unit). Does not attempt OLL/PLL parity: if the solver can't find a
 * solution (the "reduced" pattern turns out to be one only reachable via a
 * genuine 4x4-only move, impossible on a real 3x3x3), this reports that
 * honestly via `solved: false` rather than pretending to have fixed it.
 */
export async function solveReduced(cubies: Cubie[], gridSize: number): Promise<ReductionSolveResult> {
  const pattern = await buildReducedPattern(cubies);
  let solutionAlg: Alg;
  try {
    solutionAlg = await experimentalSolve3x3x3IgnoringCenters(pattern);
  } catch {
    return { solved: false, movesApplied: 0 };
  }
  const moves = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  for (const move of moves) applyMoveToken(cubies, move, gridSize);
  return { solved: true, movesApplied: moves.length };
}

// --- Parity recovery ---------------------------------------------------
// About half of scrambles reduce to a pattern that isn't solvable as a real
// 3x3x3 (OLL/PLL parity) -- it's only reachable via a genuine 4x4x4 move
// that has no 3x3x3 equivalent. A bare 180-degree turn of an inner slice is
// exactly such a move: it cleanly swaps 2 pairs of wing pieces between 2
// *different* edges (touching only centers besides), which is the specific
// odd, cross-edge kind of change no combination of paired-dedge-preserving
// outer turns can ever produce (see fourByFourEdges.ts for the derivation)
// -- which is exactly the shape of change parity recovery needs. Applying
// one, then re-running the already-working edge-pairing and centers
// solvers to clean up what it disturbs, gives a fresh (and often
// successfully reducible) starting point, without needing to hand-derive
// or verify a dedicated named parity algorithm.
export const PARITY_NUDGE_COUNT = 6;

export function applyParityNudge(cubies: Cubie[], variant: number): void {
  const axes: Axis[] = ["x", "y", "z"];
  const axis = axes[variant % 3];
  const layer = variant < 3 ? 0.5 : -0.5;
  applyRawQuarterTurn(cubies, axis, layer, 1);
  applyRawQuarterTurn(cubies, axis, layer, 1);
}
