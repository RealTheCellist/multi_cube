import * as THREE from "three";
import { nearestFaceIndex, VERTEX_INDICES, type VertexIndex } from "./tetraMath";
import { applyRawThirdTurn, buildSolvedTetra, isSolved, type PieceType, type TetraState } from "./tetraState";
import type { CustomTetraScene } from "./CustomTetraScene";

export interface TetraMove {
  vertexIndex: VertexIndex;
  depth: number;
  sign: 1 | -1;
}

function centroidOf(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
  return corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
}

function moveKey(m: TetraMove): string {
  return `${m.vertexIndex}_${m.depth}_${m.sign}`;
}

function invertMove(m: TetraMove): TetraMove {
  return { vertexIndex: m.vertexIndex, depth: m.depth, sign: (-m.sign) as 1 | -1 };
}

function cloneState(state: TetraState): TetraState {
  return {
    layerCount: state.layerCount,
    stickers: state.stickers.map((s) => ({
      ...s,
      corners: [s.corners[0].clone(), s.corners[1].clone(), s.corners[2].clone()] as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    })),
  };
}

interface PrecomputedMoves {
  ns: number;
  layerCount: number;
  pieceTypes: PieceType[];
  referenceCentroids: THREE.Vector3[];
  permByMove: Map<string, number[]>;
  allMoves: TetraMove[];
}

const precomputedCache = new Map<number, PrecomputedMoves>();

/**
 * Every primitive move's net effect as a slot permutation ("newPieces[i] =
 * oldPieces[permutation[i]]" -- the same pull convention cubing/kpuzzle
 * itself uses, verified empirically during this feature's investigation),
 * derived once per layerCount and cached: build a fresh solved state, apply
 * ONE raw turn, then match each sticker's new centroid back to its nearest
 * solved-state reference position. Every solver phase below reuses this
 * instead of re-deriving permutations from live 3D geometry per candidate.
 */
function precompute(layerCount: number): PrecomputedMoves {
  const cached = precomputedCache.get(layerCount);
  if (cached) return cached;

  const solved = buildSolvedTetra(layerCount);
  const ns = solved.stickers.length;
  const referenceCentroids = solved.stickers.map((s) => centroidOf(s.corners));
  const pieceTypes = solved.stickers.map((s) => s.pieceType);

  const allMoves: TetraMove[] = [];
  for (const vertexIndex of VERTEX_INDICES) {
    for (let depth = 1; depth <= layerCount - 1; depth++) {
      for (const sign of [1, -1] as const) allMoves.push({ vertexIndex, depth, sign });
    }
  }

  const permByMove = new Map<string, number[]>();
  for (const move of allMoves) {
    const fresh = buildSolvedTetra(layerCount);
    applyRawThirdTurn(fresh, move.vertexIndex, move.depth, move.sign);
    const movedTo = new Array<number>(ns);
    for (let id = 0; id < ns; id++) {
      const c = centroidOf(fresh.stickers[id].corners);
      let bestSlot = -1;
      let bestDist = Infinity;
      for (let slot = 0; slot < ns; slot++) {
        const dist = c.distanceToSquared(referenceCentroids[slot]);
        if (dist < bestDist) {
          bestDist = dist;
          bestSlot = slot;
        }
      }
      movedTo[id] = bestSlot;
    }
    const permutation = new Array<number>(ns);
    for (let id = 0; id < ns; id++) permutation[movedTo[id]] = id;
    permByMove.set(moveKey(move), permutation);
  }

  const result: PrecomputedMoves = { ns, layerCount, pieceTypes, referenceCentroids, permByMove, allMoves };
  precomputedCache.set(layerCount, result);
  return result;
}

function applyPerm(pieces: readonly number[], perm: readonly number[]): number[] {
  const out = new Array<number>(pieces.length);
  for (let i = 0; i < pieces.length; i++) out[i] = pieces[perm[i]];
  return out;
}

/**
 * pieces[slot] = which solved-reference sticker id is currently sitting
 * there -- the same "pull" convention permByMove's arrays use (see
 * precompute's own comment), so meetInMiddleSolve's applyPerm chaining can
 * treat this as a valid starting point. Must loop by REFERENCE SLOT and
 * search for the nearest CURRENT sticker id, not the other way around: for
 * any state that isn't already solved, "loop by sticker id and find its
 * nearest slot" produces the functional INVERSE of this convention (it only
 * coincides with the correct array for the identity/solved case, since an
 * identity permutation is its own inverse) -- confirmed empirically via a
 * bidirectional-BFS solve that reported success against its own internal
 * key match yet, on the real puzzle, left axial/center/edge pieces wrong
 * (production N=4 solver investigation).
 */
function patternFromState(state: TetraState, pre: PrecomputedMoves): number[] {
  const currentCentroids = state.stickers.map((s) => centroidOf(s.corners));
  const pieces = new Array<number>(pre.ns);
  for (let slot = 0; slot < pre.ns; slot++) {
    let bestId = -1;
    let bestDist = Infinity;
    for (let id = 0; id < pre.ns; id++) {
      const dist = currentCentroids[id].distanceToSquared(pre.referenceCentroids[slot]);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    pieces[slot] = bestId;
  }
  return pieces;
}

interface SearchEntry {
  pieces: number[];
  moves: TetraMove[];
}

/**
 * Bidirectional (meet-in-the-middle) BFS restricted to a subset of piece
 * types -- solves for those pieces alone, ignoring where anything else ends
 * up (a "quotient" state space: many full 64-sticker states collapse onto
 * the same key here, which is what makes this fast). Each side only needs
 * to reach half the true distance to solved, so this covers much deeper
 * effective solves than one-sided BFS at the same node-count cost.
 *
 * This exists because a single search over the WHOLE 64-sticker puzzle is
 * intractable for a Master-Pyraminx-family tetrahedron: neither a plain
 * generic solver (cubing/search's twsearch wrapper) nor a hand-built
 * commutator library (verified to work great for edges alone, 40/40
 * scrambles solved in under a second) could handle the axial+center pieces
 * -- every commutator touching them, no matter how deep the search for one,
 * turned out to move a fixed, rigid "all 4 centers + 6 more axial stickers"
 * shape, with no smaller or more varied alternative ever found. This
 * bidirectional BFS sidesteps needing any hand-derived algorithm at all,
 * and is what actually solves axial+center reliably (40/40 scrambles,
 * under a second each, 4-10 move solutions -- see the investigation this
 * grew out of).
 */
/**
 * Hard ceiling on total visited states (both search directions combined)
 * for any single meetInMiddleSolve* call. Without this, a scramble whose
 * true solution lies past maxDepthEachSide can grow the visited maps
 * without bound and crash the whole process with an unrecoverable
 * "JavaScript heap out of memory" -- confirmed to actually happen on a real
 * N=5 scramble (see N5_EDGE_REPAIR_AND_FAILURE_SAFETY_VALIDATION Sprint).
 * Calibrated empirically against real N=5 axial+center searches: successful
 * 10-move solves peaked around ~1.07M visited states, so 2,000,000 leaves
 * comfortable headroom for legitimate solves (N=4's much smaller
 * axial+center target space stays far below this) while still aborting
 * an unsolvable-within-budget case in ~30s on ordinary heap instead of
 * exhausting memory. The check runs INSIDE each expansion loop (not just
 * once per depth level) because a single depth level's own expansion can
 * itself blow past any per-depth-only check before it ever runs.
 */
const MAX_SEARCH_STATES = 2_000_000;

function meetInMiddleSolve(pre: PrecomputedMoves, startPieces: number[], targetTypes: ReadonlySet<PieceType>, maxDepthEachSide: number): TetraMove[] | null {
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (targetTypes.has(pre.pieceTypes[i])) targetSlots.push(i);

  const keyFor = (pieces: readonly number[]) => targetSlots.map((i) => pieces[i]).join(",");
  const buildPath = (fwdEntry: SearchEntry, bwdEntry: SearchEntry): TetraMove[] => [...fwdEntry.moves, ...[...bwdEntry.moves].reverse().map(invertMove)];

  const fwdVisited = new Map<string, SearchEntry>();
  const startEntry: SearchEntry = { pieces: startPieces, moves: [] };
  fwdVisited.set(keyFor(startPieces), startEntry);
  let fwdFrontier: SearchEntry[] = [startEntry];

  const solvedPieces = Array.from({ length: pre.ns }, (_, i) => i);
  const bwdVisited = new Map<string, SearchEntry>();
  const solvedEntry: SearchEntry = { pieces: solvedPieces, moves: [] };
  bwdVisited.set(keyFor(solvedPieces), solvedEntry);
  let bwdFrontier: SearchEntry[] = [solvedEntry];

  if (fwdVisited.has(keyFor(solvedPieces))) return [];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd = new Map<string, SearchEntry>();
    for (const { pieces, moves } of fwdFrontier) {
      for (const move of pre.allMoves) {
        const next = applyPerm(pieces, pre.permByMove.get(moveKey(move))!);
        const k = keyFor(next);
        if (!fwdVisited.has(k)) {
          const entry: SearchEntry = { pieces: next, moves: [...moves, move] };
          fwdVisited.set(k, entry);
          newFwd.set(k, entry);
          if (totalVisited() > MAX_SEARCH_STATES) return null;
        }
      }
    }
    fwdFrontier = [...newFwd.values()];
    for (const [k, entry] of newFwd) {
      const hit = bwdVisited.get(k);
      if (hit) return buildPath(entry, hit);
    }

    const newBwd = new Map<string, SearchEntry>();
    for (const { pieces, moves } of bwdFrontier) {
      for (const move of pre.allMoves) {
        const next = applyPerm(pieces, pre.permByMove.get(moveKey(move))!);
        const k = keyFor(next);
        if (!bwdVisited.has(k)) {
          const entry: SearchEntry = { pieces: next, moves: [...moves, move] };
          bwdVisited.set(k, entry);
          newBwd.set(k, entry);
          if (totalVisited() > MAX_SEARCH_STATES) return null;
        }
      }
    }
    bwdFrontier = [...newBwd.values()];
    for (const [k, entry] of newBwd) {
      const hit = fwdVisited.get(k);
      if (hit) return buildPath(hit, entry);
    }
  }

  return null;
}

/**
 * 16 hand-discovered commutators (setup-move length <=2, so [A,B]=ABA'B' is
 * 8 primitives each), each verified -- by composing purely from the identity
 * permutation, independent of any live state -- to touch ONLY "edge" slots:
 * zero net effect on axial/center/tip. Together they touch all 24 edge
 * slots at least 4x over (found via a greedy set-cover search).
 *
 * These exist because meetInMiddleSolve's raw-primitive search, run with a
 * target set cumulative with the prior phase (["axial","center","edge"], to
 * keep that phase's already-fixed pieces from being re-disturbed), is
 * combinatorially unworkable: the key space covers all 52 axial+center+edge
 * slots, and even maxDepthEachSide=7 exhausts the browser tab's memory
 * before finding a match (maxDepthEachSide=6 sometimes fails outright,
 * taking up to a minute to give up). Since every one of these commutators
 * is ALREADY a no-op on axial/center by construction, composing them needs
 * no such protection: the search space collapses back down to edge-only (24
 * slots, matching the "edges alone" case that was always fast), while every
 * move in it is safe by construction rather than by hope.
 */
const EDGE_SAFE_GENERATORS: readonly (readonly TetraMove[])[] = [
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
];

/**
 * EDGE_SAFE_GENERATORS' 16 sequences were hand-derived for N=4's geometry
 * (24 edges, depths 1-3) and are literal no-ops on N=5 (36 edges, depths
 * 1-4): reusing the same (vertexIndex, depth, sign) tuples against N=5's
 * different depth-to-layer mapping composes back to the identity permutation
 * every time (verified computationally: all 16/16 are identity on N=5 --
 * see N5_EDGE_REPAIR_AND_FAILURE_SAFETY_VALIDATION Sprint's Gate 0). This is
 * N=5's own edge-safe generator library, derived the same way but from N=5's
 * actual primitives.
 *
 * Simpler shape than EDGE_SAFE_GENERATORS: each is a plain 4-move commutator
 * [S, M, S^-1, M^-1] where S and M are single primitives on two different
 * vertices at "complementary" depths (depth 2 paired with depth 4, or depth
 * 3 paired with depth 3 -- these are exactly the depth pairs whose
 * axial+center displacement cancels out algebraically; every other pairing
 * leaves axial+center residue and was excluded). Found via exhaustive search
 * over all (S, M) primitive pairs, filtered to axial+center-identity AND
 * edge-non-identity, then deduplicated by net edge effect: 144 distinct
 * survive out of the 1,024 primitive pairs tried.
 *
 * All 144 (not a smaller coverage-optimized subset) are kept deliberately: a
 * smaller ~24-generator subset chosen to touch every edge slot at least 4x
 * over (the same "coverage" heuristic that worked for EDGE_SAFE_GENERATORS)
 * was tried first and generates a group of only 729 elements under which
 * NONE of the real scrambled edge states tested were reachable. The full
 * 144-generator set was verified to actually solve real post-Phase-1 N=5
 * edge states (2 of 3 control seeds solved within meetInMiddleSolveEdges's
 * existing maxDepthEachSide=6 and the MAX_SEARCH_STATES budget below; the
 * third exhausted the budget without a definitive answer either way, not a
 * proof of impossibility).
 */
const EDGE_SAFE_GENERATORS_N5: readonly (readonly TetraMove[])[] = [
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
];

interface EdgeGeneratorMove {
  perm: number[];
  primitives: readonly TetraMove[];
  invPrimitives: readonly TetraMove[];
}

const edgeGeneratorCache = new Map<number, EdgeGeneratorMove[]>();

function edgeGeneratorMoves(pre: PrecomputedMoves): EdgeGeneratorMove[] {
  const cached = edgeGeneratorCache.get(pre.ns);
  if (cached) return cached;
  const source = pre.layerCount === 5 ? EDGE_SAFE_GENERATORS_N5 : EDGE_SAFE_GENERATORS;
  const built = source.map((seq) => {
    let perm = Array.from({ length: pre.ns }, (_, i) => i);
    for (const m of seq) perm = applyPerm(perm, pre.permByMove.get(moveKey(m))!);
    return { perm, primitives: seq, invPrimitives: [...seq].reverse().map(invertMove) };
  });
  edgeGeneratorCache.set(pre.ns, built);
  return built;
}

interface CompoundSearchEntry {
  pieces: number[];
  moves: EdgeGeneratorMove[];
}

/**
 * Same bidirectional meet-in-the-middle shape as meetInMiddleSolve, but
 * composed from EDGE_SAFE_GENERATORS instead of raw primitives -- see that
 * constant's comment for why. Target is always edge-only since every
 * generator is already a no-op elsewhere.
 */
function meetInMiddleSolveEdges(pre: PrecomputedMoves, startPieces: number[], maxDepthEachSide: number): TetraMove[] | null {
  const generators = edgeGeneratorMoves(pre);
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "edge") targetSlots.push(i);

  const keyFor = (pieces: readonly number[]) => targetSlots.map((i) => pieces[i]).join(",");
  const buildPath = (fwdEntry: CompoundSearchEntry, bwdEntry: CompoundSearchEntry): TetraMove[] => [
    ...fwdEntry.moves.flatMap((gm) => gm.primitives),
    ...[...bwdEntry.moves].reverse().flatMap((gm) => gm.invPrimitives),
  ];

  const fwdVisited = new Map<string, CompoundSearchEntry>();
  const startEntry: CompoundSearchEntry = { pieces: startPieces, moves: [] };
  fwdVisited.set(keyFor(startPieces), startEntry);
  let fwdFrontier: CompoundSearchEntry[] = [startEntry];

  const solvedPieces = Array.from({ length: pre.ns }, (_, i) => i);
  const bwdVisited = new Map<string, CompoundSearchEntry>();
  const solvedEntry: CompoundSearchEntry = { pieces: solvedPieces, moves: [] };
  bwdVisited.set(keyFor(solvedPieces), solvedEntry);
  let bwdFrontier: CompoundSearchEntry[] = [solvedEntry];

  if (fwdVisited.has(keyFor(solvedPieces))) return [];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd = new Map<string, CompoundSearchEntry>();
    for (const { pieces, moves } of fwdFrontier) {
      for (const gm of generators) {
        const next = applyPerm(pieces, gm.perm);
        const k = keyFor(next);
        if (!fwdVisited.has(k)) {
          const entry: CompoundSearchEntry = { pieces: next, moves: [...moves, gm] };
          fwdVisited.set(k, entry);
          newFwd.set(k, entry);
          if (totalVisited() > MAX_SEARCH_STATES) return null;
        }
      }
    }
    fwdFrontier = [...newFwd.values()];
    for (const [k, entry] of newFwd) {
      const hit = bwdVisited.get(k);
      if (hit) return buildPath(entry, hit);
    }

    const newBwd = new Map<string, CompoundSearchEntry>();
    for (const { pieces, moves } of bwdFrontier) {
      for (const gm of generators) {
        const next = applyPerm(pieces, gm.perm);
        const k = keyFor(next);
        if (!bwdVisited.has(k)) {
          const entry: CompoundSearchEntry = { pieces: next, moves: [...moves, gm] };
          bwdVisited.set(k, entry);
          newBwd.set(k, entry);
          if (totalVisited() > MAX_SEARCH_STATES) return null;
        }
      }
    }
    bwdFrontier = [...newBwd.values()];
    for (const [k, entry] of newBwd) {
      const hit = fwdVisited.get(k);
      if (hit) return buildPath(hit, entry);
    }
  }

  return null;
}

/**
 * Tips are trivial by comparison: each vertex's 3 tip stickers only ever
 * spin among themselves via that SAME vertex's depth=1 turn (see
 * tetraMath's discovery notes), independent of every other piece -- so
 * fixing them is just "try 0, 1, or 2 applications and keep whichever
 * leaves the puzzle most correct," no search needed.
 */
function tipSolveMoves(state: TetraState): TetraMove[] {
  const working = cloneState(state);
  const moves: TetraMove[] = [];

  function totalCorrect(st: TetraState): number {
    let n = 0;
    for (const s of st.stickers) {
      if (nearestFaceIndex(centroidOf(s.corners)) === s.homeFaceIndex) n++;
    }
    return n;
  }

  for (const vertexIndex of VERTEX_INDICES) {
    let best = totalCorrect(working);
    let bestTries = 0;
    for (let tries = 1; tries <= 2; tries++) {
      applyRawThirdTurn(working, vertexIndex, 1, 1);
      const now = totalCorrect(working);
      if (now > best) {
        best = now;
        bestTries = tries;
      }
    }
    const revertCount = 2 - bestTries;
    for (let i = 0; i < revertCount; i++) applyRawThirdTurn(working, vertexIndex, 1, -1);
    for (let i = 0; i < bestTries; i++) moves.push({ vertexIndex, depth: 1, sign: 1 });
  }
  return moves;
}

export interface MasterTetraSolveResult {
  moves: TetraMove[];
  solved: boolean;
}

/**
 * Computes a full solve for a Master-Pyraminx-family tetrahedron (N>=4) in
 * 3 independent phases -- axial+center, then edges, then tips -- each
 * solved against whatever the PREVIOUS phase already fixed (so later
 * phases never undo earlier ones). See meetInMiddleSolve's own comment for
 * why a single whole-puzzle search isn't used instead.
 */
export function computeMasterTetraSolveMoves(state: TetraState): MasterTetraSolveResult {
  const pre = precompute(state.layerCount);
  const working = cloneState(state);
  const moves: TetraMove[] = [];

  const applyPhase = (phaseMoves: TetraMove[] | null): boolean => {
    if (!phaseMoves) return false;
    for (const m of phaseMoves) {
      applyRawThirdTurn(working, m.vertexIndex, m.depth, m.sign);
      moves.push(m);
    }
    return true;
  };

  const axialCenterOk = applyPhase(meetInMiddleSolve(pre, patternFromState(working, pre), new Set<PieceType>(["axial", "center"]), 7));
  if (!axialCenterOk) return { moves, solved: false };

  // Edges use EDGE_SAFE_GENERATORS instead of meetInMiddleSolve's raw
  // primitives: those generators are each already a no-op on axial+center
  // by construction, so this phase can't re-disturb what the previous phase
  // just fixed without needing a cumulative (and combinatorially unworkable
  // -- see EDGE_SAFE_GENERATORS' comment) target set.
  const edgeOk = applyPhase(meetInMiddleSolveEdges(pre, patternFromState(working, pre), 6));
  if (!edgeOk) return { moves, solved: false };

  applyPhase(tipSolveMoves(working));

  return { moves, solved: isSolved(working) };
}

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomTetraScene, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      const t = Math.min((now - start) / durationMs, 1);
      scene.setTurnProgress(from + easeOutCubic(t) * (to - from));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

export interface MasterTetraSolveHint {
  move: TetraMove | null;
  movesRemaining: number;
}

/**
 * Plan-once/consume-many cache, mirroring customSolvePlayback.ts's
 * FourByFourSolverEngine: computeMasterTetraSolveMoves takes up to a second
 * or two (3 live BFS/trial phases), so it's wasteful to recompute on every
 * single hint press. The cached plan is replayed one move at a time and
 * only rebuilt when the live scene no longer matches where it should be by
 * now (scramble, reset, undo, or an off-plan move) -- tracked via the
 * scene's own undo count, same trick TetraView's reportSolveCommit uses.
 */
class MasterTetraSolverEngine {
  private plan: TetraMove[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomTetraScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  solve(scene: CustomTetraScene): void {
    const state: TetraState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
    const result = computeMasterTetraSolveMoves(state);
    this.plan = result.moves;
    this.cursor = 0;
    this.planStartUndoCount = scene.getUndoCount();
  }

  invalidate(): void {
    this.plan = null;
    this.cursor = 0;
    this.planStartUndoCount = -1;
  }

  peekNextMove(): TetraMove | null {
    if (!this.plan || this.cursor >= this.plan.length) return null;
    return this.plan[this.cursor];
  }

  advance(): void {
    this.cursor++;
  }

  remainingMoves(): number {
    return this.plan ? this.plan.length - this.cursor : 0;
  }
}

// Module-level, like fourByFourEngine in customSolvePlayback.ts -- only one
// Master-Pyraminx-family TetraView is ever mounted at a time.
const engine = new MasterTetraSolverEngine();

/**
 * Solves for the scene's current actual state and plays the next move of a
 * cached plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. Same contract as
 * tetraSolvePlayback.ts's applyNextTetraSolveMove (used for the 3-layer
 * Pyraminx instead).
 */
export async function applyNextMasterTetraSolveMove(scene: CustomTetraScene): Promise<MasterTetraSolveHint> {
  if (!engine.hasValidPlan(scene)) engine.solve(scene);

  const move = engine.peekNextMove();
  if (!move) return { move: null, movesRemaining: 0 };

  if (scene.beginTurn(move.vertexIndex, move.depth)) {
    await animateProgress(scene, 0, move.sign, MOVE_ANIMATION_MS);
    scene.endTurn(move.sign);
    engine.advance();
  }
  return { move, movesRemaining: engine.remainingMoves() };
}
