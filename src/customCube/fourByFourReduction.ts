import { Alg } from "cubing/alg";
import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { cube3x3x3 } from "cubing/puzzles";
import { experimentalSolve3x3x3IgnoringCenters } from "cubing/search";
import type { Axis } from "./cubeMath";
import {
  applyMoveToken,
  applyRawQuarterTurn,
  cloneCubies,
  type Cubie,
  type Face,
  FACE_TURNS,
  outerLayerCoordinate,
  roundedComponent,
} from "./cubeState";
import { pieceType, solveCenters } from "./fourByFourCenters";

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

type Move = readonly [Axis, number, 1 | -1];

function faceTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, 4);
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const out: Move[] = [];
  for (let i = 0; i < Math.abs(times); i++) out.push([def.axis, layer, sign]);
  return out;
}
function wideTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const outerLayer = outerLayerCoordinate(face, 4);
  const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const out: Move[] = [];
  for (let i = 0; i < Math.abs(times); i++) {
    out.push([def.axis, outerLayer, sign]);
    out.push([def.axis, innerLayer, sign]);
  }
  return out;
}
function bareInnerTurn(face: Face, times: number): Move[] {
  const def = FACE_TURNS[face];
  const outerLayer = outerLayerCoordinate(face, 4);
  const innerLayer = outerLayer > 0 ? 0.5 : -0.5;
  const sign = (times < 0 ? -def.sign : def.sign) as 1 | -1;
  const out: Move[] = [];
  for (let i = 0; i < Math.abs(times); i++) out.push([def.axis, innerLayer, sign]);
  return out;
}

// Two verified, independent 4x4-only parity-fix algorithms. This purely-
// even-permutation edge-pairing scheduler (fourByFourEdges.ts) can never
// produce an odd wing permutation or a flipped dedge orientation on its own
// (every library entry is a 3-cycle, which never changes either), so a real
// 4x4-only move is required whenever the "reduced" 3x3x3-equivalent pattern
// isn't actually reachable on a real 3x3x3 -- which happens in two distinct,
// independent ways (a scramble can hit either, both, or neither):
//
//  - PLL parity: the reduced pattern's corner and edge permutation parities
//    don't match (always equal on a real 3x3x3).
//  - OLL parity: the reduced pattern's edge orientations sum to odd (always
//    even on a real 3x3x3).
//
// Both algorithms below were confirmed by direct simulation against a
// solved cube (see git history for the derivation/verification scripts),
// not typed from memory: PLL_PARITY_FIX_ALG (r2 U2 r2 Uw2 r2 u2, standard
// WCA notation) swaps exactly 2 dedges -- flipping edge permutation parity
// by exactly one without breaking any pairing -- and leaves corners
// completely untouched (its two U2-equivalent components exactly cancel).
// OLL_PARITY_FIX_ALG (r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2) flips
// exactly one dedge's orientation and leaves every position (corners,
// edges, pairing) completely unchanged. Both disturb centers, which is
// harmless since solveCenters always runs again afterward.
const PLL_PARITY_FIX_ALG: Move[] = [
  ...bareInnerTurn("R", 2),
  ...faceTurn("U", 2),
  ...bareInnerTurn("R", 2),
  ...wideTurn("U", 2),
  ...bareInnerTurn("R", 2),
  ...bareInnerTurn("U", 2),
];
const OLL_PARITY_FIX_ALG: Move[] = [
  ...bareInnerTurn("R", 2),
  ...faceTurn("B", 2),
  ...faceTurn("U", 2),
  ...bareInnerTurn("L", 1),
  ...faceTurn("U", 2),
  ...bareInnerTurn("R", -1),
  ...faceTurn("U", 2),
  ...bareInnerTurn("R", 1),
  ...faceTurn("U", 2),
  ...faceTurn("F", 2),
  ...bareInnerTurn("R", 1),
  ...faceTurn("F", 2),
  ...bareInnerTurn("L", -1),
  ...faceTurn("B", 2),
  ...bareInnerTurn("R", 2),
];

function applyMoves(cubies: Cubie[], moves: readonly Move[]): void {
  for (const [axis, layer, sign] of moves) applyRawQuarterTurn(cubies, axis, layer, sign);
}

// Converts a single-outer-layer-turn letter token (as returned by
// experimentalSolve3x3x3IgnoringCenters -- this phase never emits anything
// else, see solveReduced's docstring) into its raw quarter-turn(s), for
// step-by-step replay (see customSolvePlayback.ts). A "2" suffix becomes two
// same-direction quarter turns rather than one 180-degree one, since nothing
// else in this codebase commits a turn as anything but a single quarter turn
// (see CustomCubeScene.endTurn) -- direction doesn't matter for a 2, since
// either one reaches the same 180-degree result.
function tokenToMoves(token: string): Move[] {
  const face = token[0] as Face;
  const suffix = token.slice(1);
  const { axis, sign: canonicalSign } = FACE_TURNS[face];
  const layer = outerLayerCoordinate(face, 4);
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
 * Solves the "reduced" 4x4x4 (centers already solved, edges already paired)
 * like a 3x3x3, applying only single-outer-layer turns -- which is exactly
 * what keeps paired dedges paired and centers solved throughout (see
 * cubeState.ts: any outer-layer-only turn always moves a whole dedge as a
 * rigid unit). If a first attempt fails, retries on clones with each
 * combination of the two parity-fix algorithms above (PLL alone, OLL alone,
 * both together) plus a center re-solve, since which combination (if any)
 * is needed depends on the specific scramble and isn't worth hand-decoding
 * from the KPattern's permutation/orientation arrays when just trying all
 * 3 small, cheap combinations directly is simpler and equally fast. Commits
 * the winning attempt's state back into `cubies` in place; on total
 * failure, `cubies` is left untouched and this reports `solved: false`
 * honestly rather than pretending to have fixed it (this can happen if
 * solveCenters itself fails to re-converge after a fix, though that
 * hasn't been observed in testing).
 */
export async function solveReduced(cubies: Cubie[], gridSize: number): Promise<ReductionSolveResult> {
  const first = await tryReduce(cubies, gridSize);
  if (first.solved || gridSize !== 4) return first;

  const fixCombos: (readonly Move[])[][] = [[PLL_PARITY_FIX_ALG], [OLL_PARITY_FIX_ALG], [PLL_PARITY_FIX_ALG, OLL_PARITY_FIX_ALG]];
  for (const combo of fixCombos) {
    const attempt = cloneCubies(cubies);
    const comboMoves: Move[] = [];
    for (const alg of combo) {
      applyMoves(attempt, alg);
      comboMoves.push(...alg);
    }
    const centerResult = solveCenters(attempt, 15000);
    if (!centerResult.solved) continue;
    const result = await tryReduce(attempt, gridSize);
    if (result.solved) {
      for (let i = 0; i < cubies.length; i++) {
        cubies[i].position.copy(attempt[i].position);
        cubies[i].orientation.copy(attempt[i].orientation);
      }
      return {
        solved: true,
        movesApplied: comboMoves.length + centerResult.moves.length + result.moves.length,
        moves: [...comboMoves, ...centerResult.moves, ...result.moves],
      };
    }
  }
  return { solved: false, movesApplied: 0, moves: [] };
}
