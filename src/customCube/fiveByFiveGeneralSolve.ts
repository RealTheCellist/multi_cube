import { KPattern, type KPatternData } from "cubing/kpuzzle";
import { puzzles } from "cubing/puzzles";
import { experimentalSolveTwsearch } from "cubing/search";
import type { Axis } from "./cubeMath";
import { applyRawQuarterTurn, buildSolvedCube, type Cubie, type Face, roundedComponent } from "./cubeState";

// --- Slot layout for the "5x5x5" KPuzzle from cubing/puzzles ------------
// Reverse-engineered (not documented anywhere): applied each single face
// turn to the puzzle's own default (solved) pattern and diffed the
// resulting CORNERS/EDGES2/EDGES piece arrays against the known set of
// physical edges/corners that turn touches, to recover which numeric slot
// index corresponds to which physical position. CORNERS turned out to be
// byte-for-byte identical to cube3x3x3's own CORNERS orbit (confirmed by
// diffing both puzzles' patterns after the same move), so it's reused
// directly. EDGES2 (12 true edges) and EDGES (24 wings) are NOT shared with
// cube3x3x3 and were derived independently the same way.
const CORNER_SLOTS: readonly string[] = ["URF", "UBR", "ULB", "UFL", "DRF", "DFL", "DBL", "DRB"];
const CORNER_ORIENTATION_NEEDS_SWAP: readonly boolean[] = [true, true, true, true, false, false, true, true];

const EDGES2_SLOTS: readonly string[] = ["DF", "FL", "DR", "DB", "FR", "DL", "UR", "BR", "UL", "UB", "BL", "UF"];

interface WingSlotDef {
  edge: string;
  axis: Axis;
  sign: 1 | -1;
}
// Each of the 24 wing slots: which named edge it belongs to, and which side
// of that edge's free axis it sits on (+1/-1). Derived by applying the
// inner-layer tokens (2R/2U/2F, which touch exactly the "+1" layer along
// their axis) and checking which of each edge's 2 wing-slot candidates got
// touched.
const WING_SLOTS: readonly WingSlotDef[] = [
  { edge: "UB", axis: "x", sign: -1 }, // 0
  { edge: "UR", axis: "z", sign: -1 }, // 1
  { edge: "UF", axis: "x", sign: 1 }, // 2
  { edge: "UL", axis: "z", sign: 1 }, // 3
  { edge: "UL", axis: "z", sign: -1 }, // 4
  { edge: "FL", axis: "y", sign: 1 }, // 5
  { edge: "DL", axis: "z", sign: 1 }, // 6
  { edge: "BL", axis: "y", sign: -1 }, // 7
  { edge: "UF", axis: "x", sign: -1 }, // 8
  { edge: "FR", axis: "y", sign: 1 }, // 9
  { edge: "DF", axis: "x", sign: 1 }, // 10
  { edge: "FL", axis: "y", sign: -1 }, // 11
  { edge: "UR", axis: "z", sign: 1 }, // 12
  { edge: "BR", axis: "y", sign: 1 }, // 13
  { edge: "DR", axis: "z", sign: -1 }, // 14
  { edge: "FR", axis: "y", sign: -1 }, // 15
  { edge: "UB", axis: "x", sign: 1 }, // 16
  { edge: "BL", axis: "y", sign: 1 }, // 17
  { edge: "DB", axis: "x", sign: -1 }, // 18
  { edge: "BR", axis: "y", sign: -1 }, // 19
  { edge: "DF", axis: "x", sign: -1 }, // 20
  { edge: "DR", axis: "z", sign: 1 }, // 21
  { edge: "DB", axis: "x", sign: 1 }, // 22
  { edge: "DL", axis: "z", sign: -1 }, // 23
];

const FACE_AXIS_SIGN: Record<Face, { axis: Axis; sign: 1 | -1 }> = {
  R: { axis: "x", sign: 1 },
  L: { axis: "x", sign: -1 },
  U: { axis: "y", sign: 1 },
  D: { axis: "y", sign: -1 },
  F: { axis: "z", sign: 1 },
  B: { axis: "z", sign: -1 },
};

function positionForEdgeName(name: string, boundary: number): { x: number; y: number; z: number } {
  const pos = { x: 0, y: 0, z: 0 };
  for (const face of name) {
    const { axis, sign } = FACE_AXIS_SIGN[face as Face];
    pos[axis] = sign * boundary;
  }
  return pos;
}
function findCubieAt(cubies: readonly Cubie[], pos: { x: number; y: number; z: number }): Cubie | undefined {
  return cubies.find(
    (c) => roundedComponent(c.position, "x") === pos.x && roundedComponent(c.position, "y") === pos.y && roundedComponent(c.position, "z") === pos.z
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
function colorsAtSlot(cubies: readonly Cubie[], name: string, boundary: number): Face[] {
  const pos = positionForEdgeName(name, boundary);
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
function identifyCorner(observed: Face[]): { pieceIdx: number; orientation: number } | null {
  for (const [pieceIdx, name] of CORNER_SLOTS.entries()) {
    const home = name.split("") as Face[];
    const fwd = rotations3(home);
    for (let rot = 0; rot < 3; rot++) {
      const r = fwd[rot];
      if (r[0] === observed[0] && r[1] === observed[1] && r[2] === observed[2]) {
        const needsSwap = CORNER_ORIENTATION_NEEDS_SWAP[pieceIdx];
        return { pieceIdx, orientation: needsSwap ? (3 - rot) % 3 : rot };
      }
    }
    const rev = [home[0], home[2], home[1]];
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
function identifyEdge2(observed: Face[]): { pieceIdx: number; orientation: number } | null {
  for (const [pieceIdx, name] of EDGES2_SLOTS.entries()) {
    const home = name.split("") as Face[];
    if (home[0] === observed[0] && home[1] === observed[1]) return { pieceIdx, orientation: 0 };
    if (home[0] === observed[1] && home[1] === observed[0]) return { pieceIdx, orientation: 1 };
  }
  return null;
}

function wingPositionOf(slotIndex: number): { x: number; y: number; z: number } {
  const { edge, axis, sign } = WING_SLOTS[slotIndex];
  const pos = positionForEdgeName(edge, 2);
  pos[axis] = sign;
  return pos;
}

// Two wings of the same edge show IDENTICAL colors (they're not
// distinguishable by color the way every corner/true-edge is), so unlike
// identifyCorner/identifyEdge2 above, color alone can't tell which of the
// 24 distinct wing pieces a given piece is -- only which EDGE it belongs to.
// Distinguishing the 2 same-edge wings requires the cube's own continuous
// piece identity (tracked via Cubie.id from a solved reference), which this
// builds once and caches.
let wingHomeCache: Map<number, number> | null = null;
function wingHomeSlotById(): Map<number, number> {
  if (wingHomeCache) return wingHomeCache;
  const solved = buildSolvedCube(5);
  const map = new Map<number, number>();
  for (let slotIndex = 0; slotIndex < WING_SLOTS.length; slotIndex++) {
    const cubie = findCubieAt(solved, wingPositionOf(slotIndex));
    if (!cubie) throw new Error(`no solved wing at slot ${slotIndex}`);
    map.set(cubie.id, slotIndex);
  }
  wingHomeCache = map;
  return wingHomeCache;
}

/**
 * Builds a full "5x5x5" KPattern (cubing/puzzles) reflecting the CURRENT
 * state of `cubies` -- corners, true edges, and wings all read as they
 * actually are (not assumed solved/paired). Centers are copied from the
 * puzzle's own solved default pattern rather than read from `cubies`: by
 * the time this runs, centers are already correctly solved by
 * fiveByFiveCenters.ts and are never touched by anything downstream, so
 * there's nothing to gain from re-deriving their state, and every
 * possible starting scramble already used to build this cube keeps them
 * fixed relative to each other in the "true center defines the face color"
 * convention every other check in this codebase relies on.
 */
export async function buildFull5x5Pattern(cubies: Cubie[]): Promise<KPattern> {
  const kpuzzle = await puzzles["5x5x5"].kpuzzle();
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

  const edge2Pieces: number[] = [];
  const edge2Orientation: number[] = [];
  for (const name of EDGES2_SLOTS) {
    const observed = colorsAtSlot(cubies, name, boundary);
    const result = identifyEdge2(observed);
    if (!result) throw new Error(`could not identify true edge at slot ${name}`);
    edge2Pieces.push(result.pieceIdx);
    edge2Orientation.push(result.orientation);
  }

  const homeById = wingHomeSlotById();
  const edgePieces: number[] = new Array(24).fill(0);
  const edgeOrientation: number[] = new Array(24).fill(0);
  for (let slotIndex = 0; slotIndex < WING_SLOTS.length; slotIndex++) {
    const cubie = findCubieAt(cubies, wingPositionOf(slotIndex));
    if (!cubie) throw new Error(`no wing at slot ${slotIndex}`);
    const homeSlot = homeById.get(cubie.id);
    if (homeSlot === undefined) throw new Error(`wing id ${cubie.id} has no home mapping`);
    edgePieces[slotIndex] = homeSlot;

    const currentEdgeName = WING_SLOTS[slotIndex].edge;
    const observed = currentEdgeName.split("").map((face) => {
      const { axis, sign } = FACE_AXIS_SIGN[face as Face];
      return colorFacing(cubie, axis, sign);
    });
    const homeEdgeLetters = WING_SLOTS[homeSlot].edge.split("") as Face[];
    if (homeEdgeLetters[0] === observed[0] && homeEdgeLetters[1] === observed[1]) {
      edgeOrientation[slotIndex] = 0;
    } else if (homeEdgeLetters[0] === observed[1] && homeEdgeLetters[1] === observed[0]) {
      edgeOrientation[slotIndex] = 1;
    } else {
      throw new Error(`wing at slot ${slotIndex} colors don't match its identified home edge`);
    }
  }

  const solvedCenters = kpuzzle.defaultPattern().patternData;
  const patternData: KPatternData = {
    CORNERS: { pieces: cornerPieces, orientation: cornerOrientation },
    EDGES2: { pieces: edge2Pieces, orientation: edge2Orientation },
    EDGES: { pieces: edgePieces, orientation: edgeOrientation },
    CENTERS: solvedCenters.CENTERS,
    CENTERS2: solvedCenters.CENTERS2,
    CENTERS3: solvedCenters.CENTERS3,
  };
  return new KPattern(kpuzzle, patternData);
}

type Move = readonly [Axis, number, 1 | -1];

// The "5x5x5" puzzle's own move vocabulary numbers layers by counting in
// from one anchor face per axis, rather than cubing's usual Rw/3Rw
// notation: L=-2,2L=-1,3L=0,2R=1,R=2 / D=-2,2D=-1,3D=0,2U=1,U=2 /
// F=2,2F=1,3F=0,2B=-1,B=-2 (confirmed directly: applying "2R"/"2U"/"2F" to
// the solved pattern touches exactly the wing pieces this codebase's own
// model puts at layer x=1/y=1/z=1 respectively). Whichever face-letter
// anchors the count is otherwise irrelevant here -- only its (axis, layer)
// meaning matters for converting a token back to this codebase's raw
// [axis, layer, sign] move format.
const TOKEN_LAYER: Record<string, { axis: Axis; layer: number; canonicalSign: 1 | -1 }> = {
  L: { axis: "x", layer: -2, canonicalSign: 1 },
  "2L": { axis: "x", layer: -1, canonicalSign: 1 },
  "3L": { axis: "x", layer: 0, canonicalSign: 1 },
  "2R": { axis: "x", layer: 1, canonicalSign: -1 },
  R: { axis: "x", layer: 2, canonicalSign: -1 },
  D: { axis: "y", layer: -2, canonicalSign: 1 },
  "2D": { axis: "y", layer: -1, canonicalSign: 1 },
  "3D": { axis: "y", layer: 0, canonicalSign: 1 },
  "2U": { axis: "y", layer: 1, canonicalSign: -1 },
  U: { axis: "y", layer: 2, canonicalSign: -1 },
  F: { axis: "z", layer: 2, canonicalSign: -1 },
  "2F": { axis: "z", layer: 1, canonicalSign: -1 },
  "3F": { axis: "z", layer: 0, canonicalSign: -1 },
  "2B": { axis: "z", layer: -1, canonicalSign: 1 },
  B: { axis: "z", layer: -2, canonicalSign: 1 },
};

function tokenToMoves(token: string): Move[] {
  const match = /^(\d*)([RLUDFB])(2|')?$/.exec(token);
  if (!match) throw new Error(`unrecognized 5x5x5 solve token: ${token}`);
  const [, prefix, face, suffix] = match;
  const key = `${prefix}${face}`;
  const def = TOKEN_LAYER[key];
  if (!def) throw new Error(`unrecognized 5x5x5 layer token: ${token}`);
  const sign = (suffix === "'" ? -def.canonicalSign : def.canonicalSign) as 1 | -1;
  const times = suffix === "2" ? 2 : 1;
  const out: Move[] = [];
  for (let i = 0; i < times; i++) out.push([def.axis, def.layer, sign]);
  return out;
}

export interface GeneralSolveResult {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

/**
 * Hands the current (mostly-solved, small residual) state off to
 * cubing/search's generic solver rather than continuing to grow this
 * codebase's own hand-built algorithm library. Only usable once the
 * residual is small: the generic solver has no puzzle-specific pruning
 * tables, so its runtime is unpredictable and can time out on a distant
 * scramble (see git history: a 10-move-distance case timed out at 15s
 * while a 12-move one solved in 2s) -- but for a state that's only a
 * handful of moves from solved, it's consistently fast.
 */
export async function solveResidualWithGeneralSolver(cubies: Cubie[], gridSize: number, timeoutMs = 15000): Promise<GeneralSolveResult> {
  if (gridSize !== 5) return { solved: false, movesApplied: 0, moves: [] };
  const pattern = await buildFull5x5Pattern(cubies);
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const solvePromise = experimentalSolveTwsearch(pattern.kpuzzle, pattern).then((alg) => alg);
  const solutionAlg = await Promise.race([solvePromise, timeoutPromise]);
  if (solutionAlg === null) return { solved: false, movesApplied: 0, moves: [] };

  const tokens = [...solutionAlg.childAlgNodes()].map((node) => node.toString());
  const moves: Move[] = [];
  for (const token of tokens) {
    const tokenMoves = tokenToMoves(token);
    for (const move of tokenMoves) applyRawQuarterTurn(cubies, move[0], move[1], move[2]);
    moves.push(...tokenMoves);
  }
  return { solved: true, movesApplied: moves.length, moves };
}
