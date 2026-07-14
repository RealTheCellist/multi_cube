import * as THREE from "three";
import { type Axis, rotateGridVector90 } from "./cubeMath";
import { type Cubie, type Face, applyRawQuarterTurn, buildSolvedCube, cloneCubies } from "./cubeState";
import { currentFacingColor, faceOfPosition, type PieceType5, pieceType5 } from "./fiveByFivePieces";

const BOUNDARY = 2; // (gridSize-1)/2 for gridSize=5

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

// --- Commutator derivation -------------------------------------------------
// Same idea as fourByFourCenters.ts's deriveCommutators, generalized to
// 5x5x5's 3 inner layers per axis (-1, 0, 1 -- vs 4x4x4's 2, at -0.5/0.5).
// Explored empirically (see git history for the exploration script) rather
// than assumed: A B A' B' with A, B single-layer quarter turns on two
// different axes, for every combination of layer in {-1, 0, 1} x {-1, 0, 1}
// x sign x sign, and checked what it moves net-of-cancellation. Every
// non-identity result fell cleanly into exactly one of 3 patterns, with no
// exceptions across all combinations tried:
//   - both layers in {-1, 1} (neither is the true-center-bearing middle
//     slice): exactly 2 disjoint 3-cycles among X-centers, nothing else.
//   - exactly one layer is 0: exactly 2 disjoint 3-cycles among T-centers
//     (obliques), nothing else -- notably this does NOT disturb true
//     centers even though one of the two turns passes through their layer.
//   - both layers are 0: moves true centers only (a harmless whole-slice
///    reassignment, like 3x3x3's M/E/S) -- never useful here since true
//     centers are reference points, not something to solve, so this case is
//     simply never produced as a usable commutator (the length/type filter
//     below rejects it, since it's neither pure X-centers nor pure
//     T-centers).
// Since NEITHER useful family ever touches wing edges, true edges, or
// corners, both families can share one derivation pass and one lookup,
// exactly like the 4x4x4 commutators share a single family.
type Move = readonly [Axis, number, 1 | -1];

interface CommutatorInfo {
  seq: Move[];
  centerType: PieceType5;
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
  const layers = [1, -1, 0] as const;
  for (const l1 of layers) {
    for (const l2 of layers) {
      if (l1 === 0 && l2 === 0) continue; // only ever moves true centers -- unusable
      for (const a1 of axes) {
        for (const a2 of axes) {
          if (a1 === a2) continue;
          for (const s1 of [1, -1] as const) {
            for (const s2 of [1, -1] as const) {
              const A: Move[] = [[a1, l1, s1]];
              const B: Move[] = [[a2, l2, s2]];
              const seq: Move[] = [...A, ...B, ...invertSeq(A), ...invertSeq(B)];
              const solved = buildSolvedCube(5);
              const before = cloneCubies(solved);
              applySeq(solved, seq);
              const ids = movedIds(before, solved);
              if (ids.length !== 6) continue;
              const byId = new Map(solved.map((c) => [c.id, c] as const));
              const beforeById = new Map(before.map((c) => [c.id, c] as const));
              const types = ids.map((id) => pieceType5(byId.get(id)!));
              const centerType = types[0];
              if (centerType !== "xCenter" && centerType !== "tCenter") continue;
              if (!types.every((t) => t === centerType)) continue;
              const edges = ids.map((id) => {
                const b = beforeById.get(id)!;
                const a = byId.get(id)!;
                return { fromFace: faceOfPosition(b), fromPos: b.position.clone(), toFace: faceOfPosition(a), toPos: a.position.clone() };
              });
              infos.push({ seq, centerType, edges });
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
  return opts
    .filter((opt) => {
      // Only offer commutators whose moved-piece geometry actually matches
      // fromPos's own center subtype (an X-center can never land where a
      // T-center's commutator expects to find one, and vice versa) --
      // aligning fromPos by a face turn preserves distance-from-face-center,
      // so checking the un-aligned radii is enough without turning first.
      const r1 = fromPos.distanceTo(new THREE.Vector3(0, 0, 0).setComponent(["x", "y", "z"].indexOf(axis), sign * BOUNDARY));
      const r2 = opt.edge.fromPos.distanceTo(new THREE.Vector3(0, 0, 0).setComponent(["x", "y", "z"].indexOf(axis), sign * BOUNDARY));
      return Math.abs(r1 - r2) < 1e-6;
    })
    .map((opt) => {
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
// commutator connecting them -- same reasoning as fourByFourCenters.ts).
function candidatesForPiece(wrongCubie: Cubie): Move[][] {
  const sourceFace = faceOfPosition(wrongCubie);
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

export function wrongCenterCount(cubies: Cubie[]): number {
  let wrong = 0;
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "xCenter" && t !== "tCenter") continue;
    if (currentFacingColor(c, c.stickers[0].direction) !== c.stickers[0].color) wrong++;
  }
  return wrong;
}

function wrongCenters(cubies: Cubie[]): Cubie[] {
  return cubies.filter((c) => {
    const t = pieceType5(c);
    return (t === "xCenter" || t === "tCenter") && currentFacingColor(c, c.stickers[0].direction) !== c.stickers[0].color;
  });
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

// Multi-ply lookahead, identical structure to fourByFourCenters.ts's
// bestFixOverall: try every wrong piece's direct/2-hop fix; if none
// improves, recursively chain a bounded number of non-improving first
// steps to escape local minima a single ply can't see past.
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

// IDA*-style completeness fallback, added from the start rather than
// discovered as a follow-up fix -- fourByFourCenters.ts's own history
// (see its comments/git log) found that a capped greedy search alone
// plateaus on a small fraction of scrambles, and that a full-branching
// iteratively-deepened search over the same edge/wing-safe commutator
// vocabulary (not a different, riskier move set) closes that gap with no
// speed cost in the common case. Applying that lesson upfront here.
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

export interface SolveCenters5Result {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

/**
 * Solves all 48 X-center/T-center pieces (color-correctness only) in
 * place. Each piece is brought to its OWN declared color's fixed world
 * position regardless of where that face's true center currently sits --
 * so this never needs to reference true centers at all, and works
 * correctly whether or not solveTrueCenterPositions5 has run yet. Primary
 * greedy pass identical in structure to fourByFourCenters.ts's
 * solveCenters; falls back to idaFallback when it plateaus. See that
 * file's history for why the fallback matters and why it reuses the same
 * commutator vocabulary rather than a different one.
 */
export function solveCenters5(cubies: Cubie[], timeBudgetMs = 15000): SolveCenters5Result {
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

// --- True-center position solving -------------------------------------------
// X/T-center solving above never references true centers (each piece just
// targets its OWN declared color's fixed world position) and wing pairing
// only cares about true EDGES, not true centers -- so nothing else in this
// pipeline ever repositions a true center. A real scramble's own middle-
// slice (layer=0) turns DO relocate them across faces, though, and left
// unfixed a face's 8 X/T-centers can all correctly show one color while
// the true center sitting among them still shows another -- a single wrong
// sticker that also throws off fiveByFiveReduction.ts's corner/edge color
// reading (which assumes a world position's shown color matches the
// original solved convention). This MUST run before wing pairing: the only
// moves that can reposition a true center are middle-slice turns on the
// other two axes (the same math that makes 3x3x3's M/E/S turns move
// edges), which would break wing pairing if applied afterward.
function trueCenterPieces(cubies: Cubie[]): Cubie[] {
  return cubies.filter((c) => pieceType5(c) === "trueCenter");
}
function wrongTrueCenterCount(cubies: Cubie[]): number {
  let wrong = 0;
  for (const c of trueCenterPieces(cubies)) {
    if (currentFacingColor(c, c.stickers[0].direction) !== c.stickers[0].color) wrong++;
  }
  return wrong;
}

const MIDDLE_SLICE_MOVES: Move[] = (["x", "y", "z"] as Axis[]).flatMap((axis) => ([1, -1] as const).map((sign) => [axis, 0, sign] as Move));

export interface SolveTrueCenters5Result {
  solved: boolean;
  movesApplied: number;
  moves: Move[];
}

/**
 * Brings each of the 6 true centers to its own correct world position,
 * using only middle-slice (layer=0) turns. The state space (which of 6
 * positions each of the 6 true centers occupies) is tiny, so a plain BFS
 * is fast and complete within the depth tried -- no analytical derivation
 * needed, unlike the X/T-center commutators.
 */
export function solveTrueCenterPositions5(cubies: Cubie[], maxDepth = 8): SolveTrueCenters5Result {
  if (wrongTrueCenterCount(cubies) === 0) return { solved: true, movesApplied: 0, moves: [] };

  function stateKey(cs: Cubie[]): string {
    return trueCenterPieces(cs)
      .map((c) => `${c.id}:${Math.round(c.position.x)},${Math.round(c.position.y)},${Math.round(c.position.z)}`)
      .sort()
      .join("|");
  }

  let frontier: { cubies: Cubie[]; path: Move[] }[] = [{ cubies, path: [] }];
  const seen = new Set<string>([stateKey(cubies)]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const move of MIDDLE_SLICE_MOVES) {
        const clone = cloneCubies(node.cubies);
        applySeq(clone, [move]);
        const path = [...node.path, move];
        if (wrongTrueCenterCount(clone) === 0) {
          applySeq(cubies, path);
          return { solved: true, movesApplied: path.length, moves: path };
        }
        const key = stateKey(clone);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ cubies: clone, path });
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return { solved: false, movesApplied: 0, moves: [] };
}
