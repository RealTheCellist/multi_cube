import * as THREE from "three";
import { type Axis, rotateGridVector90 } from "./cubeMath";
import { type Cubie, type Face, applyRawQuarterTurn, buildSolvedCube, cloneCubies, roundedComponent } from "./cubeState";

// --- Piece classification -------------------------------------------------

const BOUNDARY = 1.5; // (gridSize-1)/2 for gridSize=4

export type PieceType = "corner" | "edge" | "center";

export function pieceType(cubie: Cubie): PieceType {
  const boundaryCount = (["x", "y", "z"] as Axis[]).filter((a) => Math.abs(roundedComponent(cubie.position, a)) === BOUNDARY).length;
  if (boundaryCount === 3) return "corner";
  if (boundaryCount === 2) return "edge";
  return "center";
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
const OPPOSITE_FACE: Record<Face, Face> = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };

function faceOfCenterPosition(pos: THREE.Vector3): Face {
  for (const face of ALL_FACES) {
    const { axis, sign } = FACE_AXIS_SIGN[face];
    if (roundedComponent(pos, axis) === sign * BOUNDARY) return face;
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
function currentFacingColor(cubie: Cubie, stickerDirection: THREE.Vector3): Face {
  const d = stickerDirection.clone().applyQuaternion(cubie.orientation).round();
  return DIRECTION_TO_FACE[`${d.x},${d.y},${d.z}`];
}

export function wrongCenterCount(cubies: Cubie[]): number {
  let wrong = 0;
  for (const c of cubies) {
    if (pieceType(c) !== "center") continue;
    for (const s of c.stickers) if (currentFacingColor(c, s.direction) !== s.color) wrong++;
  }
  return wrong;
}

// --- Commutator derivation -------------------------------------------------
// A B A' B' using two different inner-slice (layer=+-0.5) quarter turns
// always produces exactly two disjoint 3-cycles among 6 center pieces and
// nothing else (verified empirically -- see the session notes/PR for the
// derivation). Deriving this by simulating on a solved cube at module load
// (rather than hand-transcribing the 96 axis/layer/sign combinations) means
// there's no chance of a transcription bug: whatever the simulation says a
// given commutator does is, by construction, exactly what it does.
type Move = readonly [Axis, number, 1 | -1];

interface CommutatorInfo {
  seq: Move[];
  edges: { fromFace: Face; fromPos: THREE.Vector3; toFace: Face; toPos: THREE.Vector3 }[];
}

function applySeq(cubies: Cubie[], seq: readonly Move[]): void {
  for (const [axis, layer, sign] of seq) applyRawQuarterTurn(cubies, axis, layer, sign);
}

function invertSeq(seq: readonly Move[]): Move[] {
  return [...seq].reverse().map(([axis, layer, sign]) => [axis, layer, (-sign) as 1 | -1]);
}

function movedIds(before: Cubie[], after: Cubie[]): number[] {
  const ids: number[] = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i].position.distanceToSquared(after[i].position) > 1e-9 || before[i].orientation.angleTo(after[i].orientation) > 1e-6) {
      ids.push(before[i].id);
    }
  }
  return ids;
}

function deriveCommutators(): CommutatorInfo[] {
  const infos: CommutatorInfo[] = [];
  const axes: Axis[] = ["x", "y", "z"];
  for (const l1 of [0.5, -0.5] as const) {
    for (const l2 of [0.5, -0.5] as const) {
      for (const a1 of axes) {
        for (const a2 of axes) {
          if (a1 === a2) continue;
          for (const s1 of [1, -1] as const) {
            for (const s2 of [1, -1] as const) {
              const A: Move[] = [[a1, l1, s1]];
              const B: Move[] = [[a2, l2, s2]];
              const seq: Move[] = [...A, ...B, ...invertSeq(A), ...invertSeq(B)];
              const solved = buildSolvedCube(4);
              const before = cloneCubies(solved);
              applySeq(solved, seq);
              const ids = movedIds(before, solved);
              if (ids.length !== 6) continue;
              const byId = new Map(solved.map((c) => [c.id, c] as const));
              const beforeById = new Map(before.map((c) => [c.id, c] as const));
              if (!ids.every((id) => pieceType(byId.get(id)!) === "center")) continue;
              const edges = ids.map((id) => {
                const b = beforeById.get(id)!;
                const a = byId.get(id)!;
                return { fromFace: faceOfCenterPosition(b.position), fromPos: b.position.clone(), toFace: faceOfCenterPosition(a.position), toPos: a.position.clone() };
              });
              infos.push({ seq, edges });
            }
          }
        }
      }
    }
  }
  return infos;
}

let commutatorInfosCache: CommutatorInfo[] | null = null;
function getCommutators(): CommutatorInfo[] {
  if (!commutatorInfosCache) commutatorInfosCache = deriveCommutators();
  return commutatorInfosCache;
}

interface PairOption {
  commInfo: CommutatorInfo;
  edge: CommutatorInfo["edges"][number];
}

let pairLookupCache: Map<string, PairOption[]> | null = null;
function getPairLookup(): Map<string, PairOption[]> {
  if (pairLookupCache) return pairLookupCache;
  const map = new Map<string, PairOption[]>();
  for (const info of getCommutators()) {
    for (const edge of info.edges) {
      const key = `${edge.fromFace}->${edge.toFace}`;
      const list = map.get(key) ?? [];
      list.push({ commInfo: info, edge });
      map.set(key, list);
    }
  }
  pairLookupCache = map;
  return map;
}

function adjacentFaces(face: Face): Face[] {
  return ALL_FACES.filter((f) => f !== face && f !== OPPOSITE_FACE[face]);
}

// How many +90-degree turns of `face` map fromPos to targetPos (0-3).
function turnsToAlign(face: Face, fromPos: THREE.Vector3, targetPos: THREE.Vector3): number {
  const { axis } = FACE_AXIS_SIGN[face];
  let pos = fromPos.clone();
  for (let k = 0; k < 4; k++) {
    if (pos.distanceToSquared(targetPos) < 1e-6) return k;
    pos = rotateGridVector90(pos, axis, 1);
  }
  throw new Error("unreachable: face turns always cycle through all 4 quadrants");
}

interface Candidate {
  moves: Move[];
  landingPos: THREE.Vector3;
}

function candidateMovesFor(fromPos: THREE.Vector3, sourceFace: Face, targetFace: Face): Candidate[] {
  const opts = getPairLookup().get(`${sourceFace}->${targetFace}`) ?? [];
  const { axis, sign } = FACE_AXIS_SIGN[sourceFace];
  return opts.map((opt) => {
    const turns = turnsToAlign(sourceFace, fromPos, opt.edge.fromPos);
    const moves: Move[] = [];
    for (let k = 0; k < turns; k++) moves.push([axis, sign * BOUNDARY, 1]);
    moves.push(...opt.commInfo.seq);
    return { moves, landingPos: opt.edge.toPos };
  });
}

// All candidate move sequences that move `wrongCubie` from its current
// (wrong) face to its correct-color face, either directly (adjacent faces)
// or via one adjacent intermediate (opposite faces, which have no direct
// commutator connecting them -- see the pairLookup coverage notes).
function candidatesForPiece(wrongCubie: Cubie): Move[][] {
  const sourceFace = faceOfCenterPosition(wrongCubie.position);
  const targetFace = wrongCubie.stickers[0].color;
  if (sourceFace === targetFace) return [];
  const direct = candidateMovesFor(wrongCubie.position, sourceFace, targetFace);
  if (direct.length) return direct.map((d) => d.moves);
  const mid = adjacentFaces(sourceFace)[0];
  const combos: Move[][] = [];
  for (const first of candidateMovesFor(wrongCubie.position, sourceFace, mid)) {
    for (const second of candidateMovesFor(first.landingPos, mid, targetFace)) {
      combos.push([...first.moves, ...second.moves]);
    }
  }
  return combos;
}

function bestFixForPiece(cubies: Cubie[], wrongCubie: Cubie): Move[] | null {
  let best: Move[] | null = null;
  let bestScore = wrongCenterCount(cubies);
  for (const moves of candidatesForPiece(wrongCubie)) {
    const clone = cloneCubies(cubies);
    applySeq(clone, moves);
    const score = wrongCenterCount(clone);
    if (score < bestScore) {
      bestScore = score;
      best = moves;
    }
  }
  return best;
}

function wrongCenters(cubies: Cubie[]): Cubie[] {
  return cubies.filter((c) => pieceType(c) === "center" && currentFacingColor(c, c.stickers[0].direction) !== c.stickers[0].color);
}

// Multi-ply lookahead built entirely from the fast analytical primitive
// above (never falls back to blind search over the full move set, which is
// what made earlier prototyping attempts too slow -- see session notes).
// At each ply, try every wrong piece's direct/2-hop fix; if none improves,
// recursively chain a bounded number of "non-improving" first steps (capped
// branching) to escape local minima that a single ply can't see past.
function bestFixOverall(cubies: Cubie[], plies: number, deadline: number): Move[] | null {
  if (Date.now() > deadline) return null;
  const baseline = wrongCenterCount(cubies);
  if (baseline === 0) return [];
  let best: Move[] | null = null;
  let bestScore = baseline;
  for (const wc of wrongCenters(cubies)) {
    const fix = bestFixForPiece(cubies, wc);
    if (!fix) continue;
    const clone = cloneCubies(cubies);
    applySeq(clone, fix);
    const score = wrongCenterCount(clone);
    if (score === 0) return fix;
    if (score < bestScore) {
      bestScore = score;
      best = fix;
    }
  }
  if (best) return best;
  if (plies <= 1) return null;

  const BRANCH_CAP = 10;
  for (const wc of wrongCenters(cubies)) {
    if (Date.now() > deadline) return null;
    for (const moves of candidatesForPiece(wc).slice(0, BRANCH_CAP)) {
      const clone = cloneCubies(cubies);
      applySeq(clone, moves);
      const rest = bestFixOverall(clone, plies - 1, deadline);
      if (rest === null) continue;
      const combined = [...moves, ...rest];
      const finalClone = cloneCubies(cubies);
      applySeq(finalClone, combined);
      if (wrongCenterCount(finalClone) < baseline) return combined;
    }
  }
  return null;
}

export interface SolveCentersResult {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

// IDA*-style completeness fallback, used only once the fast greedy pass
// (bestFixOverall) plateaus. Real-world 4x4 solving uses a "block-building"
// method (freely combine same-color centers into a face, no fixing search
// at all) that structurally can't get stuck -- but it can't be transplanted
// here: this codebase solves centers AFTER edge pairing (see
// autoSolveFourByFour), and centers must therefore leave edges untouched.
// Every commutator here is specifically an A B A' B' whose net effect
// cancels out everywhere except 6 centers (see deriveCommutators), which is
// what makes that safe -- raw free moves are not. So instead of a different
// move vocabulary, this reuses the exact same edge-safe commutators/outer
// turns as bestFixOverall, just searched *completely* (full branching, no
// BRANCH_CAP, iteratively deepened bound) instead of greedily -- this is
// different from the previously-tried-and-rejected exhaustive fallback
// (which searched raw single moves over the whole move set, not this
// analytical commutator vocabulary) and from the previously-tried shuffled
// restarts (which stayed capped/greedy, just retried with different
// ordering). Only engages on the rare plateau, so typical-case speed is
// unaffected.
const IDA_MAX_BOUND = 6;
function idaFallback(cubies: Cubie[], deadline: number, maxBound: number): Move[] | null {
  const heuristic = (cs: Cubie[]) => Math.ceil(wrongCenterCount(cs) / 6);
  let deadlineHit = false;

  function dfs(cs: Cubie[], g: number, bound: number, path: Move[]): Move[] | null {
    if (deadlineHit) return null;
    if (Date.now() > deadline) {
      deadlineHit = true;
      return null;
    }
    const h = heuristic(cs);
    if (h === 0) return path;
    if (g + h > bound) return null;
    for (const wc of wrongCenters(cs)) {
      for (const moves of candidatesForPiece(wc)) {
        const clone = cloneCubies(cs);
        applySeq(clone, moves);
        const res = dfs(clone, g + 1, bound, [...path, ...moves]);
        if (res) return res;
        if (deadlineHit) return null;
      }
    }
    return null;
  }

  for (let bound = heuristic(cubies); bound <= maxBound; bound++) {
    const res = dfs(cubies, 0, bound, []);
    if (res) return res;
    if (deadlineHit) return null;
  }
  return null;
}

/**
 * Solves all 24 center pieces (color-correctness only, per-slot identity
 * doesn't matter -- see isSolved()) in place. Primarily via the fast
 * analytical greedy fixing above (bestFixOverall); when that plateaus
 * (returns null with centers still wrong), falls back to idaFallback, a
 * complete search over the same edge-safe move vocabulary -- see its
 * comment for why this, rather than the earlier-tried alternatives (an
 * exhaustive raw-move fallback, a second commutator family, and shuffled
 * restarts -- all measured with no real improvement or a bad speed
 * tradeoff; see git history).
 */
export function solveCenters(cubies: Cubie[], timeBudgetMs = 15000): SolveCentersResult {
  const deadline = Date.now() + timeBudgetMs;
  const moves: Move[] = [];
  let guard = 0;
  while (wrongCenterCount(cubies) > 0 && guard < 60 && Date.now() < deadline) {
    guard++;
    let fix = bestFixOverall(cubies, 4, deadline);
    if (!fix || fix.length === 0) fix = idaFallback(cubies, deadline, IDA_MAX_BOUND);
    if (!fix || fix.length === 0) break;
    applySeq(cubies, fix);
    moves.push(...fix);
  }
  return { solved: wrongCenterCount(cubies) === 0, movesApplied: moves.length, moves };
}
