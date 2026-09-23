import { applyMegaminxMove, EDGES, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { uploadLibraryWasm, findSafeApplicationWasm, findFinishingApplicationWasm, solveCrossWasm } from "./megaminxSearchWasm";
import { FACE_VERTEX_INDICES, FACE_INDICES, FACE_NORMALS, type FaceIndex } from "./dodecaMath";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOLVED_STATE: MegaminxState = {
  cornerPerm: Int8Array.from({ length: 20 }, (_, i) => i),
  cornerOrient: new Int8Array(20),
  edgePerm: Int8Array.from({ length: 30 }, (_, i) => i),
  edgeOrient: new Int8Array(30),
};

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
function invertSeq(seq: readonly MegaminxTurn[]): MegaminxTurn[] {
  return [...seq].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1 }));
}

/**
 * Jointly tracks a set of specific CORNER piece ids and specific EDGE
 * piece ids -- where each one is (position + orientation), nothing else.
 * A sound projection for search purposes, same reasoning as
 * kilominxSolver.ts's own pieceKeyFor: applyMegaminxMove moves each piece
 * as a function of its own current position only, so a piece's whole
 * trajectory under any move sequence is independent of every other piece,
 * corner or edge alike.
 */
function pieceKeyFor(cornerPieces: readonly number[], edgePieces: readonly number[]): (s: MegaminxState) => string {
  const sortedCorners = [...cornerPieces].sort((a, b) => a - b);
  const sortedEdges = [...edgePieces].sort((a, b) => a - b);
  return (s: MegaminxState) => {
    const cornerLoc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) cornerLoc[s.cornerPerm[pos]] = pos;
    const edgeLoc = new Array<number>(30);
    for (let pos = 0; pos < 30; pos++) edgeLoc[s.edgePerm[pos]] = pos;
    const cornerPart = sortedCorners.map((piece) => `c${cornerLoc[piece]}:${s.cornerOrient[cornerLoc[piece]]}`).join(",");
    const edgePart = sortedEdges.map((piece) => `e${edgeLoc[piece]}:${s.edgeOrient[edgeLoc[piece]]}`).join(",");
    return `${cornerPart}|${edgePart}`;
  };
}

/**
 * Numeric counterpart to pieceKeyFor, scoped to EDGES only (the only case
 * this module ever threads through a hot search loop -- see crossKey
 * below): packs each tracked edge's (position, orientation) into one
 * base-60 digit of a single safe-integer key instead of building a
 * string. Safe for any piece count this module actually uses (60^n stays
 * far under Number.MAX_SAFE_INTEGER through n=5, crossKey's own size);
 * NOT safe to reuse for a joint corner+edge key at pieceKeyFor's own
 * scale (10 pieces) without overflowing, which is why pieceKeyFor itself
 * is left as a string -- its own callers are one-off equality checks, not
 * bidirectionalSearch's own per-state hot path. Zero-allocation per call:
 * `positions` is a closure-captured scratch buffer, safe to reuse because
 * a single keyFn instance is only ever called synchronously, never
 * reentrantly.
 */
function edgeStateKeyFor(edgePieces: readonly number[]): (s: MegaminxState) => number {
  const sorted = [...edgePieces].sort((a, b) => a - b);
  const n = sorted.length;
  const positions = new Array<number>(n);
  return (s: MegaminxState) => {
    let remaining = n;
    for (let pos = 0; pos < 30 && remaining > 0; pos++) {
      const piece = s.edgePerm[pos];
      for (let i = 0; i < n; i++) {
        if (sorted[i] === piece) {
          positions[i] = pos;
          remaining--;
          break;
        }
      }
    }
    let key = 0;
    for (let i = 0; i < n; i++) key = key * 60 + positions[i] * 2 + s.edgeOrient[positions[i]];
    return key;
  };
}

function edgeIndexOf(a: number, b: number): number {
  const i = EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (i < 0) throw new Error(`megaminxSolver: no edge between vertices ${a} and ${b}`);
  return i;
}

/** Exported for MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_OPTIMIZATION_V1's own bench harness -- see that Sprint's own dev notes there for why (needs to replicate solveMiddleLayer's own equatorial-edge step with a candidate library, not modify this function). Pure visibility change, no behavior change. */
export const FIRST_LAYER_CORNER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[0];
const FIRST_LAYER_EDGE_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[0].map((v, j) => edgeIndexOf(v, FACE_VERTEX_INDICES[0][(j + 1) % 5]));

/**
 * Face 0's antipodal face (the "bottom") and its 5 own vertices/edges --
 * same technique as kilominxSolver.ts's own LAST_LAYER_FACE (dot-product
 * against face 0's normal), corner geometry being identical between the
 * two puzzles. Every other face is either "upper" (adjacent to face 0) or
 * "lower" (adjacent to the bottom face) -- computed via shared edges, not
 * assumed, and verified (see this module's own dev notes) to partition
 * the remaining 10 faces exactly 5/5.
 */
const BOTTOM_FACE: FaceIndex = FACE_INDICES.reduce((best, f) => (FACE_NORMALS[f].dot(FACE_NORMALS[0]) < FACE_NORMALS[best].dot(FACE_NORMALS[0]) ? f : best), FACE_INDICES[1]);

function facesAtEdgeIndices(a: number, b: number): FaceIndex[] {
  const faces: FaceIndex[] = [];
  for (const f of FACE_INDICES) {
    const verts = FACE_VERTEX_INDICES[f];
    for (let j = 0; j < 5; j++) {
      const x = verts[j];
      const y = verts[(j + 1) % 5];
      if ((x === a && y === b) || (x === b && y === a)) faces.push(f);
    }
  }
  return faces;
}

const UPPER_RING_FACES: readonly FaceIndex[] = (() => {
  const adj = new Set<FaceIndex>();
  for (const [a, b] of EDGES) {
    const faces = facesAtEdgeIndices(a, b);
    if (faces.includes(0)) for (const f of faces) if (f !== 0) adj.add(f);
  }
  return [...adj];
})();
const LOWER_RING_FACES: readonly FaceIndex[] = (() => {
  const adj = new Set<FaceIndex>();
  for (const [a, b] of EDGES) {
    const faces = facesAtEdgeIndices(a, b);
    if (faces.includes(BOTTOM_FACE)) for (const f of faces) if (f !== BOTTOM_FACE) adj.add(f);
  }
  return [...adj];
})();

function faceBand(f: FaceIndex): "top" | "upper" | "lower" | "bottom" {
  if (f === 0) return "top";
  if (f === BOTTOM_FACE) return "bottom";
  if (UPPER_RING_FACES.includes(f)) return "upper";
  return "lower";
}

/**
 * The 30 edges, classified by the BAND-PAIR of their 2 touching faces --
 * computed, not guessed (see this module's own dev notes: verified counts
 * are top-upper=5 (the already-solved first-layer/cross edges),
 * upper-upper=5, lower-upper=10 (the equatorial belt), lower-lower=5,
 * bottom-lower=5 (the last layer's own edges) -- summing to 30). Each
 * later phase targets exactly one of these bands.
 */
function edgesInBand(bandA: string, bandB: string): number[] {
  const out: number[] = [];
  for (let e = 0; e < EDGES.length; e++) {
    const [a, b] = EDGES[e];
    const bands = facesAtEdgeIndices(a, b)
      .map(faceBand)
      .sort();
    if (bands.join("-") === [bandA, bandB].sort().join("-")) out.push(e);
  }
  return out;
}
const UPPER_UPPER_EDGE_POSITIONS: readonly number[] = edgesInBand("upper", "upper");
/** Exported for MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_OPTIMIZATION_V1 -- see FIRST_LAYER_CORNER_POSITIONS's own dev note above. */
export const LOWER_UPPER_EDGE_POSITIONS: readonly number[] = edgesInBand("lower", "upper");
const LOWER_LOWER_EDGE_POSITIONS: readonly number[] = edgesInBand("lower", "lower");
const BOTTOM_LOWER_EDGE_POSITIONS: readonly number[] = edgesInBand("bottom", "lower");

/** The 10 "middle band" corners (between the top and bottom layers) -- same technique as kilominxSolver.ts's own MIDDLE_LAYER_POSITIONS. */
export const MIDDLE_CORNER_POSITIONS: readonly number[] = Array.from({ length: 20 }, (_, i) => i).filter((p) => !FIRST_LAYER_CORNER_POSITIONS.includes(p) && !FACE_VERTEX_INDICES[BOTTOM_FACE].includes(p));
const LAST_LAYER_CORNER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[BOTTOM_FACE];

/**
 * Phase 1-A ("cross"): solve face 0's own 5 EDGES (position + orientation)
 * only, ignoring corners entirely -- the same shape of problem as
 * kilominxSolver.ts's own solveFirstLayer (a single 5-piece bidirectional
 * search), just for edges instead of corners. A first version of this
 * module tried to solve all 10 first-layer pieces (5 corners + 5 edges)
 * in ONE combined search -- that OOM-crashed (the joint key space collapses
 * far less per search depth than either piece type alone, confirmed by
 * measuring frontier growth: 1.66M states at depth 10 and still climbing).
 * Splitting into edges-first, corners-second (see solveFirstLayerCorners)
 * keeps each stage the same SIZE of problem N=2's own Phase 1 already
 * proved tractable.
 */
const crossKey = edgeStateKeyFor(FIRST_LAYER_EDGE_POSITIONS);

export function isCrossSolved(state: MegaminxState): boolean {
  return crossKey(state) === crossKey(SOLVED_STATE);
}

const sortedFirstLayerEdgePositions = [...FIRST_LAYER_EDGE_POSITIONS].sort((a, b) => a - b);

export function solveCross(state: MegaminxState, maxHalfDepth = 11, maxFrontierSize = 1_500_000): MegaminxTurn[] {
  if (isCrossSolved(state)) return [];
  const solution = solveCrossWasm(state, sortedFirstLayerEdgePositions, maxHalfDepth, maxFrontierSize);
  if (!solution) throw new Error(`megaminxSolver: cross not solved within half-depth ${maxHalfDepth}`);
  return solution;
}

export function isFirstLayerSolved(state: MegaminxState): boolean {
  const key = pieceKeyFor(FIRST_LAYER_CORNER_POSITIONS, FIRST_LAYER_EDGE_POSITIONS);
  return key(state) === key(SOLVED_STATE);
}

/**
 * Phase 1-B: insert face 0's 5 CORNERS (position + orientation) while
 * preserving the 5 already-solved cross edges -- the same commutator +
 * conjugation technique kilominxSolver.ts's own Phase 2 uses to solve
 * pieces without disturbing already-fixed ones (support-confined
 * commutators, applied via a setup S so S.C.S' has EXACTLY support
 * S(support(C)), never touching anything else no matter what S itself
 * does along the way -- see kilominxSolver.ts's own COMMUTATORS comment
 * for the full reasoning). Preserving edges is the ONLY invariant here:
 * nothing outside face 0's own 10 positions is solved yet at this stage,
 * so a commutator is free to scramble any OTHER corner or edge as long as
 * it leaves the 5 cross edges alone.
 */
export interface Commutator {
  seq: MegaminxTurn[];
  cornerSupport: number[];
  edgeSupport: number[];
  /**
   * The support positions the commutator's PERMUTATION actually moves
   * something away from (perm[pos] !== pos in the raw, solved-frame
   * result) -- a STRICT subset of the full support when some touched
   * positions are pure-twist-only (permutation identity, orientation
   * only). This distinction matters a lot for findSafeApplication's own
   * "route the misplaced piece to this anchor" technique: routing a
   * piece to a PURE-TWIST anchor can never relocate it. Conjugation
   * (S.C.S') at such an anchor just flips whatever piece S delivered
   * there in place, and S' (S's exact inverse) then returns that SAME
   * piece to EXACTLY where S found it -- not to its own home -- since C
   * never actually moved it away from the anchor for S' to redirect
   * elsewhere. Confirmed the hard way: an earlier version tried anchors
   * from the FULL support indiscriminately, and a support-2 pure-EDGE-
   * twist commutator was repeatedly retried (1600+ times) for a
   * genuinely misplaced edge it could structurally never fix, while the
   * genuine 3+ cycle commutators that could were never reached.
   */
  cornerMovingSupport: number[];
  edgeMovingSupport: number[];
  /**
   * `cornerDestination[piece]` = the position piece `piece` (by home id)
   * ends up at after applying this commutator FROM SOLVED (identity
   * outside support). Used by findSafeApplication's JOINT setup search
   * (see its own dev notes): to route a misplaced piece home via a
   * conjugated commutator, the setup must satisfy TWO simultaneous
   * position goals, not one -- (1) the piece lands at some anchor A, AND
   * (2) whatever CURRENTLY occupies the piece's own home ends up at
   * destination[A] (so that undoing the setup delivers it back into that
   * now-empty home) -- and this array is what lets that second goal be
   * computed for any candidate anchor.
   */
  cornerDestination: number[];
  edgeDestination: number[];
}

function makeCommutator(a: MegaminxTurn[], b: MegaminxTurn[]): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(SOLVED_STATE, seq);
  const cornerSupport: number[] = [];
  const cornerMovingSupport: number[] = [];
  const cornerDestination: number[] = new Array(20);
  for (let pos = 0; pos < 20; pos++) cornerDestination[result.cornerPerm[pos]] = pos;
  for (let i = 0; i < 20; i++) {
    if (result.cornerPerm[i] === i && result.cornerOrient[i] === 0) continue;
    cornerSupport.push(i);
    if (result.cornerPerm[i] !== i) cornerMovingSupport.push(i);
  }
  const edgeSupport: number[] = [];
  const edgeMovingSupport: number[] = [];
  const edgeDestination: number[] = new Array(30);
  for (let pos = 0; pos < 30; pos++) edgeDestination[result.edgePerm[pos]] = pos;
  for (let i = 0; i < 30; i++) {
    if (result.edgePerm[i] === i && result.edgeOrient[i] === 0) continue;
    edgeSupport.push(i);
    if (result.edgePerm[i] !== i) edgeMovingSupport.push(i);
  }
  return { seq, cornerSupport, edgeSupport, cornerMovingSupport, edgeMovingSupport, cornerDestination, edgeDestination };
}

/** Every move sequence of length 1..maxDepth over `singles`, never repeating the same face twice in a row (matches this module's original generator shape). */
function buildSequencesUpToDepth(singles: readonly MegaminxTurn[], maxDepth: number): MegaminxTurn[][] {
  let all: MegaminxTurn[][] = singles.map((t) => [t]);
  let prevDepth = all;
  for (let d = 2; d <= maxDepth; d++) {
    const next = prevDepth.flatMap((seq) => singles.filter((t) => t.face !== seq[seq.length - 1].face).map((t) => [...seq, t]));
    all = [...all, ...next];
    prevDepth = next;
  }
  return all;
}

/**
 * An (A, B) generator pool restricted to `faces` (instead of all 12) --
 * used for the last-layer phases below, where the generic 12-face pool
 * turned out (confirmed empirically, exhaustively) to contain NO
 * commutator at all whose corner support avoids all 20 corners: a
 * commutator's raw support is essentially never confined to a small
 * region unless the moves themselves are drawn from that region, so
 * restricting the alphabet to just the bottom + lower-ring faces both
 * shrinks the (A,B) space enough to search deeper (A/B up to 3/4 moves,
 * instead of 2/3) AND biases every candidate toward a small support in
 * the first place.
 */
function buildCommutatorPool(faces: readonly FaceIndex[], aDepth: number, bDepth: number): { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] } {
  const singles: MegaminxTurn[] = [];
  for (const face of faces) for (const sign of [1, -1] as const) singles.push({ face, sign });
  return { As: buildSequencesUpToDepth(singles, aDepth), Bs: buildSequencesUpToDepth(singles, bDepth) };
}

/**
 * Every (A, B) generator pair this module's commutator libraries are
 * built from -- same shape as kilominxSolver.ts's own COMMUTATORS search
 * (A: 1-2 moves, B: 1-3 moves, ~1.5M pairs, same 24-move space: 12 faces *
 * 2 signs), just computed ONCE and shared across every phase's own
 * library build below instead of redone per phase.
 */
const { As: COMMUTATOR_As, Bs: COMMUTATOR_Bs } = buildCommutatorPool(FACE_INDICES, 2, 3);

/** Which array a "kind" of piece lives in, and its orientation modulus -- lets the insertion machinery below (setup search, exact/greedy finishers) stay ONE generic implementation instead of a separate copy for corners and for edges. */
export interface PieceKind {
  name: string;
  count: number;
  mod: number;
  perm(s: MegaminxState): Int8Array;
  orient(s: MegaminxState): Int8Array;
  support(c: Commutator): number[];
  /** See Commutator's own cornerMovingSupport/edgeMovingSupport comment -- the subset of support that findSafeApplication's anchor routing can actually use. */
  movingSupport(c: Commutator): number[];
  /** See Commutator's own cornerDestination/edgeDestination comment. */
  destination(c: Commutator): readonly number[];
}
export const CORNER_KIND: PieceKind = { name: "corner", count: 20, mod: 3, perm: (s) => s.cornerPerm, orient: (s) => s.cornerOrient, support: (c) => c.cornerSupport, movingSupport: (c) => c.cornerMovingSupport, destination: (c) => c.cornerDestination };
export const EDGE_KIND: PieceKind = { name: "edge", count: 30, mod: 2, perm: (s) => s.edgePerm, orient: (s) => s.edgeOrient, support: (c) => c.edgeSupport, movingSupport: (c) => c.edgeMovingSupport, destination: (c) => c.edgeDestination };

/**
 * Computed library of commutators useful for inserting `targetKind`
 * pieces: kept only if they touch NONE of `fixedCorners`/`fixedEdges`
 * (whatever this phase has already solved and must preserve) and have a
 * nonempty, reasonably small `targetKind` support -- bucketed by that
 * support size so callers can look up an exact-size match cheaply. Same
 * reasoning as kilominxSolver.ts's own COMMUTATORS/TWIST_COMMUTATORS: a
 * setup S never needs to search under a "preserve everything fixed"
 * constraint, because conjugation (S.C.S') guarantees the combined
 * sequence's support is EXACTLY S(support(C)) regardless of what S itself
 * does along the way -- so filtering candidate C's own raw support here
 * is enough, correctness of the full S.C.S' is still verified by the
 * caller afterward.
 */
/**
 * On-disk cache for buildCommutatorLibrary's own results: each phase's
 * library depends only on its own (targetKind, fixed sets, size/budget
 * params, pool) -- not on the scramble being solved -- so once built it
 * can be built ONCE EVER (per machine) and reused across every later
 * process run, not just within one process's own `lazy()` cache. This is
 * what actually matters for iteration speed: measured directly, rebuilding
 * every process start cost 20-25 minutes total across the 7 phases, every
 * single time this module loaded. Filed alongside this project's own
 * "raw-dataset-*.json" convention (see .gitignore) -- large, regenerable
 * on demand, and deliberately NOT auto-deleted.
 *
 * Node-only (uses node:fs) -- safe today because this module is exercised
 * only from tests (Node/vitest), never bundled into the browser app; if
 * that ever changes, this caching layer needs to become conditional on
 * environment rather than assumed.
 */
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");

function libraryFingerprint(fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>, maxSupport: number, perSizeCap: number, maxPairsExamined: number, pool: { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] }): string {
  const fc = [...fixedCorners].sort((a, b) => a - b).join(",");
  const fe = [...fixedEdges].sort((a, b) => a - b).join(",");
  return `${fc}|${fe}|${maxSupport}|${perSizeCap}|${maxPairsExamined}|${pool.As.length}x${pool.Bs.length}`;
}

function cacheFilePath(cacheKey: string): string {
  return join(CACHE_DIR, `raw-dataset-megaminx-${cacheKey}.json`);
}

function loadCachedLibrary(cacheKey: string, fingerprint: string): Commutator[] | null {
  try {
    const raw = readFileSync(cacheFilePath(cacheKey), "utf8");
    const data = JSON.parse(raw) as { fingerprint: string; commutators: Commutator[] };
    return data.fingerprint === fingerprint ? data.commutators : null;
  } catch {
    return null;
  }
}

function saveCachedLibrary(cacheKey: string, fingerprint: string, commutators: Commutator[]): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFilePath(cacheKey), JSON.stringify({ fingerprint, commutators }));
  } catch {
    // Best-effort: an unwritable cache dir just means every run pays the
    // build cost, same as before this feature existed -- not fatal.
  }
}

export function buildCommutatorLibrary(targetKind: PieceKind, fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>, maxSupport = 6, perSizeCap = 80, maxPairsExamined = 1_500_000, pool: { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] } = { As: COMMUTATOR_As, Bs: COMMUTATOR_Bs }, cacheKey?: string): Commutator[] {
  const fingerprint = cacheKey ? libraryFingerprint(fixedCorners, fixedEdges, maxSupport, perSizeCap, maxPairsExamined, pool) : undefined;
  if (cacheKey && fingerprint) {
    const cached = loadCachedLibrary(cacheKey, fingerprint);
    if (cached) return cached;
  }

  const buckets = new Map<number, Commutator[]>();
  for (let n = 1; n <= maxSupport; n++) buckets.set(n, []);
  const seen = new Set<string>();
  let examined = 0;

  outer: for (const A of pool.As) {
    for (const B of pool.Bs) {
      if (examined++ >= maxPairsExamined) break outer;
      const c = makeCommutator(A, B);
      const targetSupport = targetKind.support(c);
      if (targetSupport.length === 0 || targetSupport.length > maxSupport) continue;
      if (c.cornerSupport.some((p) => fixedCorners.has(p))) continue;
      if (c.edgeSupport.some((p) => fixedEdges.has(p))) continue;
      const key = `${c.cornerSupport.join(",")}|${c.edgeSupport.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(targetSupport.length)!;
      if (bucket.length >= perSizeCap) continue;
      bucket.push(c);
      if ([...buckets.values()].every((b) => b.length >= perSizeCap)) break outer;
    }
  }
  const out: Commutator[] = [];
  for (let n = 1; n <= maxSupport; n++) out.push(...buckets.get(n)!);
  if (cacheKey && fingerprint) saveCachedLibrary(cacheKey, fingerprint, out);
  return out;
}

function countWrongKind(kind: PieceKind, state: MegaminxState, positions: readonly number[]): number {
  const perm = kind.perm(state);
  const orient = kind.orient(state);
  let n = 0;
  for (const p of positions) if (perm[p] !== p || orient[p] !== 0) n++;
  return n;
}

/**
 * findSafeApplication's own algorithm -- now implemented in Rust (see
 * wasm-search/src/lib.rs's own find_safe_application, and this file's own
 * findSafeApplication below, the thin wrapper that calls it) -- but kept
 * here since this is where the design was originally worked out and
 * proven; the Rust port mirrors this reasoning byte-for-byte, not just
 * the final algorithm.
 *
 * Same single-anchor setup search as kilominxSolver.ts's own
 * findSafeApplication, generalized over piece kind, with two additions
 * kilominx never needed:
 *
 * 1. Anchors are drawn from `movingSupport`, not the full `support` (see
 *    Commutator's own cornerMovingSupport/edgeMovingSupport comment): a
 *    pure-twist anchor can never relocate a misplaced piece. Kilominx's
 *    own COMMUTATORS library never produced a pure-twist entry below
 *    support 3, so this never mattered there; it does here because edges
 *    readily produce pure support-2 twists.
 *
 * 2. Only commutators with support >= 3 are usable at all. Reasoning
 *    (confirmed empirically: a genuinely misplaced edge left EVERY one of
 *    1440 (commutator, anchor) attempts at exactly the same wrong count,
 *    never fewer): a 2-element commutator (a transposition, or a pure
 *    twist) has no "spare" element to absorb the setup's own un-doing.
 *    Conjugating it (S.C.S') to route our piece to `anchor` sends
 *    whatever ends up at anchor's PARTNER position back through S' to
 *    wherever our piece started -- not to `target`'s home. A 3+-element
 *    cycle has a genuine spare: routing our piece to one slot and letting
 *    the other (>= 2) slots cycle between themselves is what lets S'
 *    deliver our piece home while the others land wherever S itself
 *    would have put them anyway (fixedOk/wrongAfter still verify the real
 *    outcome either way -- this is a targeting restriction, not an
 *    unverified assumption).
 *
 * When `target` and `displaced` differ, single-anchor routing alone is
 * insufficient -- proven the hard way: it only guarantees the piece
 * reaches `anchor` BEFORE the commutator acts, saying nothing about where
 * it ends up AFTER C moves it away and S' maps things back (a genuinely
 * misplaced edge left EVERY ONE of 1440 tried pairs at exactly the same
 * wrong count). The correct condition needs a JOINT (2-condition) setup
 * search instead: piece `target` ends up at HOME (= `target` itself,
 * since piece ids equal home positions) if and only if the setup S
 * satisfies TWO things at once:
 *   1. s.perm[anchor] === target        (piece target sits at anchor)
 *   2. s.perm[C.destination[anchor]] === displaced   (whatever currently
 *      occupies target's own home ends up at C's own image of anchor)
 * where `displaced` is whatever piece is CURRENTLY at position `target`
 * in `current` (the piece that needs to be swapped OUT to make room).
 * Condition 2 exists because conjugation acts on POSITIONS uniformly (C
 * sends anchor's occupant, whoever it is, to C.destination[anchor]
 * regardless of who that occupant is) -- so undoing S only delivers our
 * piece back to `target` if `displaced` is ALSO exactly where S's own
 * inverse expects it, at C.destination[anchor], when S' runs. Both are
 * position-only conditions on 2 specific pieces, so this is really the
 * SAME joint machinery as findFinishingApplication (a sound, position-
 * only key, verified by full replay) -- just with a goal PREDICATE
 * instead of a precomputed reach table, since here there's only one
 * (target, displaced) pair to search for per anchor, not many candidate
 * assignments to look up.
 */
/**
 * Uploads `library` to the Wasm module ONCE per distinct array (cached
 * by the array's own identity -- each phase's own library, built via
 * `lazy()`, is a stable reference reused across every findSafeApplication/
 * findFinishingApplication call for that phase) instead of re-serializing
 * it on every call. See findSafeApplication's own dev notes for why the
 * whole function moved to Wasm, not just its own reachable-map BFS.
 */
const libraryHandleCache = new WeakMap<readonly Commutator[], number>();
function getLibraryHandle(kind: PieceKind, library: readonly Commutator[]): number {
  const cached = libraryHandleCache.get(library);
  if (cached !== undefined) return cached;
  const kindByte = kind.name === "corner" ? 0 : 1;
  const entries = library.map((c) => ({ seq: c.seq, support: kind.support(c), movingSupport: kind.movingSupport(c), destination: kind.destination(c) }));
  const handle = uploadLibraryWasm(kindByte, entries);
  libraryHandleCache.set(library, handle);
  return handle;
}

/**
 * Profiled directly: after findFinishingApplication's own cap tuning
 * (see its own dev notes above) cut that function's cost down,
 * findSafeApplication's OWN JS-side matching loop -- library iteration,
 * applySeq, fixedOk, countWrongKind, for every (commutator, anchor) pair,
 * potentially hundreds per call -- had grown to ~49% of a full solve's
 * own time (same absolute cost as before, just a bigger share of a much
 * smaller total). Moved the whole function (not just its own reachable-
 * map BFS) into Wasm: wasm-search/src/lib.rs's own find_safe_application
 * mirrors this function's two branches (single-anchor vs joint
 * target+displaced routing) exactly, byte-for-byte against the JS version
 * this replaced. findFinishingApplication's own matching loop later got
 * the same treatment (find_finishing_application, see its own dev notes
 * below) once profiling showed it was a comparably-sized JS-side cost.
 */
function findSafeApplication(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, fixedCorners: readonly number[], fixedEdges: readonly number[], targetPositions: readonly number[], target: number, wrongBefore: number, requireImprovement: boolean): { state: MegaminxState; seq: MegaminxTurn[] } | null {
  const displaced = kind.perm(current)[target];
  const handle = getLibraryHandle(kind, library);
  return findSafeApplicationWasm(handle, current, kind.name === "corner" ? 0 : 1, target, displaced, fixedCorners, fixedEdges, targetPositions, wrongBefore, requireImprovement);
}

/**
 * Tiers the cap DOWN as `n` (wrongPositions.length) grows, instead of one
 * fixed cap for every size 2..8 -- larger n is BOTH more expensive per
 * reachable node (more permutations to check against it in the matching
 * loop below) and combinatorially less likely to land an exact-finish
 * match at all, so it gets the smallest budget.
 *
 * Cut to ~1/4 of their post-Wasm-port values (Task #38/#39) after
 * findFinishingApplication's own ~91% miss rate (see its own dev notes
 * below) made clear that most of even the CHEAP Wasm search was still
 * being paid on attempts that were going to fail anyway --
 * findFinishingApplication always has a safe fallback (findSafeApplication,
 * called next by solveTargetPositions on a miss), unlike findSafeApplication
 * itself, which has none and was NOT touched here (an earlier session
 * round found reducing ITS OWN depth caused real regressions -- see this
 * module's own git history). Swept empirically (20 seeds, well past the
 * 10 used elsewhere in this file) to find the safety cliff before picking
 * a value: full pipeline solves stay 20/20 correct all the way down to
 * roughly half these numbers again, but disabling the search entirely
 * (maxDepth=0) collapses to 9/20 -- confirming this function is genuinely
 * load-bearing, not just slow. This tier keeps real margin before that
 * cliff rather than sitting right on top of it.
 */
function finishingSearchCap(n: number): { maxDepth: number; maxReachable: number } {
  if (n <= 3) return { maxDepth: 4, maxReachable: 2_000 };
  if (n === 4) return { maxDepth: 3, maxReachable: 1_000 };
  if (n === 5) return { maxDepth: 2, maxReachable: 400 };
  if (n === 6) return { maxDepth: 2, maxReachable: 200 };
  return { maxDepth: 1, maxReachable: 100 }; // n=7,8
}

/**
 * The joint (all-at-once) finisher, same technique as kilominxSolver.ts's
 * own tryExactFinish, generalized over piece kind. Cost is O(wrongPieces!)
 * times however many library entries share that exact support size, so
 * callers should keep wrongPositions small (solveTargetPositions caps it
 * at 6); this guard is a defense-in-depth backstop, not the primary
 * control.
 *
 * Profiled directly (see this module's own dev notes on the Wasm search
 * port): findFinishingApplication's own buildReachableMapWasm call was
 * ~75% of a full solve's own time (3-seed sample), and its own JS-side
 * matching loop (library iteration, permutations(wrongPieces), applySeq,
 * fixedOk, per-piece solved check) a further ~21% (5-seed sample, after
 * findSafeApplication's own Wasm port shrank everything else) -- both now
 * moved into Wasm (see wasm-search/src/lib.rs's own
 * find_finishing_application), same technique and same reasoning as
 * findSafeApplication's own full-function port. This function's own root
 * cause for its low hit rate remains: it tracks up to 8 pieces jointly,
 * whose base-30 key space (up to 30^8) is effectively unbounded next to
 * maxReachable, so for wrongPositions.length >= 4 the search reliably
 * hits the reachable-count cap rather than exhausting its own key space
 * early the way the <=3-piece case does (900 or 27,000 possible keys,
 * both well under even a much smaller cap) -- and it MISSES (no exact-
 * finish match found, falling back to findSafeApplication) ~91% of the
 * time, meaning most of its cost pays for a full-depth search that was
 * going to fail anyway; that miss rate is unchanged by this Wasm port
 * (confirmed empirically, same algorithm) -- only its own per-call cost
 * (paid on both hits and misses) is now much cheaper.
 */
function findFinishingApplication(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, fixedCorners: readonly number[], fixedEdges: readonly number[], wrongPositions: readonly number[]): { state: MegaminxState; seq: MegaminxTurn[] } | null {
  if (wrongPositions.length > 8) return null;
  const { maxDepth, maxReachable } = finishingSearchCap(wrongPositions.length);
  const handle = getLibraryHandle(kind, library);
  return findFinishingApplicationWasm(handle, current, kind.name === "corner" ? 0 : 1, wrongPositions, fixedCorners, fixedEdges, maxDepth, maxReachable);
}

/** Computes `compute()` once, on first call, and returns the same value on every later call -- each phase's own commutator library is expensive (~1.5M-pair search) but depends only on that PHASE's fixed set, not on the scramble being solved, so it must be built once per phase and reused across every solve call, not rebuilt per scramble (confirmed the hard way: rebuilding it inside solveTargetPositions made a 10-scramble test time out that used to finish in well under a minute). */
function lazy<T>(compute: () => T): () => T {
  let value: T | undefined;
  let computed = false;
  return () => {
    if (!computed) {
      value = compute();
      computed = true;
    }
    return value as T;
  };
}

/**
 * Generic "insert these target positions, preserving everything already
 * fixed" solver -- the same greedy (exact finish -> single-piece
 * improving move -> single-piece lateral move) loop as
 * kilominxSolver.ts's own solveTargetPositions, generalized over piece
 * kind and over an arbitrary (corner, edge) fixed set instead of one
 * hardcoded invariant. Takes an already-built library (see `lazy` above
 * for why it's never built inside this function).
 */
function solveTargetPositions(kind: PieceKind, library: readonly Commutator[], state: MegaminxState, targetPositions: readonly number[], fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>, maxAttempts = 400): MegaminxTurn[] {
  const maxSupport = Math.max(...library.map((c) => kind.support(c).length), 0);
  // fixedCorners/fixedEdges never change across this whole call, but
  // findSafeApplication needs them as arrays (for the Wasm scratch-buffer
  // write) -- spreading the Sets once here instead of on every one of the
  // (potentially dozens of) findSafeApplication calls below avoids
  // redundant Set-iteration + array allocation per call (found via direct
  // profiling of this loop: ~90% of its own time was already inside Wasm
  // calls, so the remaining JS-side win available here is this repeated
  // allocation, not the loop's own control flow).
  const fixedCornersArr = [...fixedCorners];
  const fixedEdgesArr = [...fixedEdges];

  let current = state;
  const solution: MegaminxTurn[] = [];
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;

  while (targetPositions.some((p) => kind.perm(current)[p] !== p || kind.orient(current)[p] !== 0)) {
    attempts++;
    if (attempts > maxAttempts) throw new Error(`megaminxSolver: solveTargetPositions exceeded ${maxAttempts} attempts`);

    const perm = kind.perm(current);
    const orient = kind.orient(current);
    const wrongPositions = targetPositions.filter((p) => perm[p] !== p || orient[p] !== 0);
    const wrongBefore = wrongPositions.length;

    // findFinishingApplication's exact-match search is O(wrongPieces!) --
    // permutations(wrongPieces) -- times however many same-size library
    // entries exist, so it's only attempted up to MAX_FINISH_SIZE
    // regardless of the library's own (much larger) maxSupport: 6! * ~80
    // entries is a safe ~57,600 iterations, but 10! * ~80 is ~290 MILLION
    // (confirmed the hard way -- this factorial blowup, not the setup
    // search, is what made a 3-seed test balloon from under a minute to
    // multiple HOURS once a later phase's library grew to maxSupport=10).
    // Below this size, single-piece routing (findSafeApplication, now O(1)
    // per candidate via buildReachableMap) still finds progress just fine.
    const MAX_FINISH_SIZE = 6;
    let found = wrongBefore >= 2 && wrongBefore <= Math.min(maxSupport, MAX_FINISH_SIZE) ? findFinishingApplication(kind, library, current, fixedCornersArr, fixedEdgesArr, wrongPositions) : null;
    if (found) {
      consecutiveLateral = 0;
    } else {
      // Try EVERY wrong piece as the routing target, not just the first --
      // a piece that happens to be unreachable via any (commutator,anchor)
      // combo right now (its specific displacement just isn't covered by
      // this library) doesn't mean no OTHER wrong piece is routable this
      // round; bailing out after only ever trying wrongPositions[0] was
      // throwing away perfectly good progress on the rest of the target
      // set (confirmed empirically: a scramble that stalled at "10 pieces
      // still wrong, no safe application found at all" on the very first
      // attempt -- meaning target=wrongPositions[0] specifically had none
      // -- while other wrong pieces very plausibly did).
      for (const target of wrongPositions) {
        found = findSafeApplication(kind, library, current, fixedCornersArr, fixedEdgesArr, targetPositions, target, wrongBefore, true);
        if (found) break;
      }
      if (found) {
        consecutiveLateral = 0;
      } else {
        if (consecutiveLateral >= maxConsecutiveLateral) {
          throw new Error(`megaminxSolver: solveTargetPositions stuck (${countWrongKind(kind, current, targetPositions)} pieces still wrong, ${maxConsecutiveLateral} lateral moves in a row without progress)`);
        }
        for (const target of wrongPositions) {
          found = findSafeApplication(kind, library, current, fixedCornersArr, fixedEdgesArr, targetPositions, target, wrongBefore, false);
          if (found) break;
        }
        if (!found) {
          throw new Error(`megaminxSolver: solveTargetPositions stuck (${countWrongKind(kind, current, targetPositions)} pieces still wrong, no safe commutator application found at all)`);
        }
        consecutiveLateral++;
      }
    }

    current = found.state;
    solution.push(...found.seq);
  }
  return solution;
}

const firstLayerCornerLibrary = lazy(() => buildCommutatorLibrary(CORNER_KIND, new Set(), new Set(FIRST_LAYER_EDGE_POSITIONS), undefined, undefined, undefined, undefined, "firstLayerCorner"));

export function solveFirstLayerCorners(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(CORNER_KIND, firstLayerCornerLibrary(), state, FIRST_LAYER_CORNER_POSITIONS, new Set(), new Set(FIRST_LAYER_EDGE_POSITIONS), maxAttempts);
}

/** Full Phase 1: cross (edges), then corners. */
export function solveFirstLayer(state: MegaminxState): MegaminxTurn[] {
  const crossSolution = solveCross(state);
  const afterCross = applySeq(state, crossSolution);
  const cornerSolution = solveFirstLayerCorners(afterCross);
  return [...crossSolution, ...cornerSolution];
}

/**
 * Phase 2a: the 5 "upper-upper" edges -- each sitting between 2 upper-
 * ring faces, directly adjacent to the first layer (see this module's own
 * edgesInBand comment for the computed band structure) -- inserted while
 * preserving the full first layer (5 corners + 5 edges).
 */
const upperEdgeLibrary = lazy(() => buildCommutatorLibrary(EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), new Set(FIRST_LAYER_EDGE_POSITIONS), undefined, undefined, undefined, undefined, "upperEdge"));

export function isUpperEdgesSolved(state: MegaminxState): boolean {
  return UPPER_UPPER_EDGE_POSITIONS.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

export function solveUpperEdges(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(EDGE_KIND, upperEdgeLibrary(), state, UPPER_UPPER_EDGE_POSITIONS, new Set(FIRST_LAYER_CORNER_POSITIONS), new Set(FIRST_LAYER_EDGE_POSITIONS), maxAttempts);
}

/**
 * Phase 2b: the 10 "middle band" corners -- inserted while preserving the
 * first layer (5 corners + 5 edges) AND the 5 upper-upper edges from
 * Phase 2a.
 */
export const MIDDLE_CORNER_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS]);
export const middleCornerLibrary = lazy(() => buildCommutatorLibrary(CORNER_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), MIDDLE_CORNER_FIXED_EDGES, undefined, undefined, undefined, undefined, "middleCorner"));

export function isMiddleCornersSolved(state: MegaminxState): boolean {
  return MIDDLE_CORNER_POSITIONS.every((p) => state.cornerPerm[p] === p && state.cornerOrient[p] === 0);
}

const TOP_AND_MIDDLE_CORNERS = new Set([...FIRST_LAYER_CORNER_POSITIONS, ...MIDDLE_CORNER_POSITIONS]);

/**
 * A generator pool restricted to the bottom face + its 5 lower-ring
 * neighbors (6 of the 12 faces), searched deeper (A/B up to 3 moves
 * instead of 2/3) -- see buildCommutatorPool's own dev notes for why: the
 * generic 12-face pool is essentially never confined to a small corner
 * region, so any phase fixing TOP_AND_MIDDLE_CORNERS (the bottom 5 are
 * its only free corners) needs moves drawn from a small region in the
 * first place, not just a bigger budget on the same pool. Shared by every
 * phase below that fixes exactly this corner set (lower-lower edges and
 * the last layer itself).
 */
const LAST_LAYER_FACES: readonly FaceIndex[] = [BOTTOM_FACE, ...LOWER_RING_FACES];
const lastLayerPool = lazy(() => buildCommutatorPool(LAST_LAYER_FACES, 3, 3));

/**
 * Phase 2b+2c: the 10 middle-band corners AND the 10 "lower-upper"
 * equatorial-belt edges (see this module's own edgesInBand comment: the
 * biggest of the 5 edge bands) -- handled TOGETHER as one alternating
 * phase, same reasoning and technique as solveLastLayer below. Measured
 * directly: an equatorial-edge library that also fixes all 10 middle
 * corners tops out around 215 entries; freeing the middle corners (fixing
 * only the first layer) more than triples that to ~720 -- so, just like
 * the last layer's own corners/edges, middle corners and equatorial edges
 * need each other's freedom to have a rich enough library, not just a
 * bigger search budget on the fully-fixed version.
 */
export const EQUATORIAL_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS]);
/**
 * MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_PRODUCTION_INTEGRATION_V1 --
 * maxSupport lowered 10 -> 6, per that Sprint's own real-solver gates
 * (Gate A/B/C, see that Sprint's report): 100-scramble regression against
 * the real solver found 0 correctness/completeness loss at maxSupport=6
 * (including the 18/18 scrambles whose winning candidate had support=7
 * under maxSupport=10 -- solveTargetPositionsPreferring's own retry/fallback
 * across target positions absorbed every one of those losses), while
 * cutting phase2bc's own wall time ~34.8% (4,160 -> 1,440 library pairs).
 * Nothing else about this function, buildCommutatorLibrary, or any other
 * phase's library changed.
 */
export const equatorialEdgeLibrary = lazy(() => buildCommutatorLibrary(EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES, 6, 80, 8_000_000, undefined, "equatorialEdge"));

export function isEquatorialEdgesSolved(state: MegaminxState): boolean {
  return LOWER_UPPER_EDGE_POSITIONS.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

export function solveMiddleLayer(state: MegaminxState, maxRounds = 12): MegaminxTurn[] {
  const solution: MegaminxTurn[] = [];
  let current = state;
  for (let round = 0; round < maxRounds; round++) {
    if (isMiddleCornersSolved(current) && isEquatorialEdgesSolved(current)) return solution;

    if (!isMiddleCornersSolved(current)) {
      const protectedEdges = new Set([...MIDDLE_CORNER_FIXED_EDGES, ...correctPositions(LOWER_UPPER_EDGE_POSITIONS, current.edgePerm, current.edgeOrient)]);
      const seq = solveTargetPositionsPreferring(CORNER_KIND, middleCornerLibrary(), current, MIDDLE_CORNER_POSITIONS, new Set(FIRST_LAYER_CORNER_POSITIONS), protectedEdges, new Set(FIRST_LAYER_CORNER_POSITIONS), MIDDLE_CORNER_FIXED_EDGES);
      solution.push(...seq);
      current = applySeq(current, seq);
    }

    if (isMiddleCornersSolved(current) && isEquatorialEdgesSolved(current)) return solution;

    const protectedCorners = new Set([...FIRST_LAYER_CORNER_POSITIONS, ...correctPositions(MIDDLE_CORNER_POSITIONS, current.cornerPerm, current.cornerOrient)]);
    const seq = solveTargetPositionsPreferring(EDGE_KIND, equatorialEdgeLibrary(), current, LOWER_UPPER_EDGE_POSITIONS, protectedCorners, EQUATORIAL_FIXED_EDGES, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES);
    solution.push(...seq);
    current = applySeq(current, seq);
  }
  if (isMiddleCornersSolved(current) && isEquatorialEdgesSolved(current)) return solution;
  throw new Error(`megaminxSolver: solveMiddleLayer did not converge within ${maxRounds} rounds`);
}

/**
 * Phase 3a: the 5 "lower-lower" edges -- between 2 lower-ring faces,
 * directly adjacent to the bottom layer (the antipodal counterpart of
 * Phase 2a's upper-upper edges).
 */
const LOWER_LOWER_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS, ...LOWER_UPPER_EDGE_POSITIONS]);
const lowerLowerEdgeLibrary = lazy(() => buildCommutatorLibrary(EDGE_KIND, TOP_AND_MIDDLE_CORNERS, LOWER_LOWER_FIXED_EDGES, 10, 80, 8_000_000, lastLayerPool(), "lowerLowerEdge"));

export function isLowerLowerEdgesSolved(state: MegaminxState): boolean {
  return LOWER_LOWER_EDGE_POSITIONS.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

export function solveLowerLowerEdges(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(EDGE_KIND, lowerLowerEdgeLibrary(), state, LOWER_LOWER_EDGE_POSITIONS, TOP_AND_MIDDLE_CORNERS, LOWER_LOWER_FIXED_EDGES, maxAttempts);
}

/**
 * Phase 3b+3c: the bottom face's own 5 corners AND its own 5 edges -- the
 * last 10 pieces. Handled TOGETHER as one alternating phase, not as two
 * strictly sequential ones (see this module's own dev notes on
 * solveLastLayer for why: exhaustively confirmed, at this module's
 * (A: 1-2 moves, B: 1-3 moves) commutator search depth, there is NO
 * commutator at all whose support avoids all 20 corners while touching
 * only the last layer's own edges -- 0 found even at maxSupport=6..10 with
 * every one of the ~7.3M (A,B) pairs actually examined. Freeing the 5
 * bottom corners (letting a bottom-edge commutator disturb them) does
 * yield a handful, so the edge phase must run with corners UNFIXED, and
 * the corner phase must be re-run afterward to restore them -- ping-
 * ponging between the two until both hold at once.
 */
const BOTTOM_CORNER_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS, ...LOWER_UPPER_EDGE_POSITIONS, ...LOWER_LOWER_EDGE_POSITIONS]);
/**
 * A deeper pool (B up to 5 moves, not 3) shared by both last-layer
 * libraries -- measured directly: at (3,4) the corner library's search
 * space (~28M pairs) is EXHAUSTED (examined count reaches the total, not
 * just the perSizeCap ceiling) and still only yields 176 entries (80/75/21
 * across support sizes 3/4/5, nothing smaller or larger), and 2 of 10
 * scrambles still hit an unroutable 2-corner residual -- so the ceiling is
 * genuinely the move-sequence depth, not the per-bucket cap. Also applied
 * to the edge library since round 8's failure was solveLastLayer's OWN
 * ping-pong not converging in 12 rounds, not a single-application stuck
 * error -- richer options on BOTH sides reduce the chance the two phases
 * keep undoing each other.
 */
const lastLayerDeepPool = lazy(() => buildCommutatorPool(LAST_LAYER_FACES, 3, 5));
const bottomCornerLibrary = lazy(() => buildCommutatorLibrary(CORNER_KIND, TOP_AND_MIDDLE_CORNERS, BOTTOM_CORNER_FIXED_EDGES, 10, 150, 60_000_000, lastLayerDeepPool(), "bottomCorner"));

export function isBottomCornersSolved(state: MegaminxState): boolean {
  return LAST_LAYER_CORNER_POSITIONS.every((p) => state.cornerPerm[p] === p && state.cornerOrient[p] === 0);
}

/**
 * The bottom face's own 5 edges. Fixed corners: only the top+middle 15
 * (the bottom 5 are deliberately left FREE -- see solveLastLayer's own dev
 * notes above). Fixed edges: all 25 non-bottom edges.
 */
const ALL_BUT_BOTTOM_CORNERS = new Set([...TOP_AND_MIDDLE_CORNERS, ...LAST_LAYER_CORNER_POSITIONS]);
const BOTTOM_EDGE_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS, ...LOWER_UPPER_EDGE_POSITIONS, ...LOWER_LOWER_EDGE_POSITIONS]);
const bottomEdgeLibrary = lazy(() => buildCommutatorLibrary(EDGE_KIND, TOP_AND_MIDDLE_CORNERS, BOTTOM_EDGE_FIXED_EDGES, 10, 150, 60_000_000, lastLayerDeepPool(), "bottomEdge"));

export function isBottomEdgesSolved(state: MegaminxState): boolean {
  return BOTTOM_LOWER_EDGE_POSITIONS.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

export function correctPositions(positions: readonly number[], perm: Int8Array, orient: Int8Array): number[] {
  return positions.filter((p) => perm[p] === p && orient[p] === 0);
}

/**
 * Phase 3b+3c combined: alternates fixing the bottom corners and the
 * bottom edges until BOTH hold simultaneously -- necessary, not just
 * convenient, since this module's own dev notes above (bottomEdgeLibrary)
 * record an EXHAUSTIVE search finding no commutator whose support avoids
 * all 20 corners while touching only the last layer's own edges: a
 * strictly sequential "corners then edges" pass has nothing to fall back
 * on if the edge step needs to disturb a corner.
 *
 * Blind ping-pong (just alternating a corners-only solve and an edges-only
 * solve) risks a period-2 cycle: each greedy solve is deterministic, so if fixing
 * corners always scrambles edges into pattern E and fixing E always
 * scrambles corners back into the SAME pattern C this started from, it
 * repeats forever regardless of the round budget. To break that, each
 * round DYNAMICALLY protects whichever of the OTHER kind's pieces are
 * already correct right now (not just this phase's static fixed set) by
 * passing them in as extra fixed positions for that one call -- this
 * doesn't shrink what the library can reach (fixedOk is checked against
 * the search RESULT, not against how the library was built), it just
 * makes the greedy search prefer -- and, if none exists, still fall back
 * to disturbing -- whichever option actually avoids undoing progress.
 */
/** Tries the stricter (protected) fixed set first; falls back to the phase's own normal fixed set if that's over-constrained and finds nothing (see solveLastLayer's own dev notes: protection is a preference, not a requirement). */
export function solveTargetPositionsPreferring(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, targetPositions: readonly number[], strictFixedCorners: ReadonlySet<number>, strictFixedEdges: ReadonlySet<number>, looseFixedCorners: ReadonlySet<number>, looseFixedEdges: ReadonlySet<number>): MegaminxTurn[] {
  try {
    return solveTargetPositions(kind, library, current, targetPositions, strictFixedCorners, strictFixedEdges, 400);
  } catch {
    return solveTargetPositions(kind, library, current, targetPositions, looseFixedCorners, looseFixedEdges, 400);
  }
}

export function solveLastLayer(state: MegaminxState, maxRounds = 12): MegaminxTurn[] {
  const solution: MegaminxTurn[] = [];
  let current = state;
  for (let round = 0; round < maxRounds; round++) {
    if (isBottomCornersSolved(current) && isBottomEdgesSolved(current)) return solution;

    if (!isBottomCornersSolved(current)) {
      const protectedEdges = new Set([...BOTTOM_CORNER_FIXED_EDGES, ...correctPositions(BOTTOM_LOWER_EDGE_POSITIONS, current.edgePerm, current.edgeOrient)]);
      const seq = solveTargetPositionsPreferring(CORNER_KIND, bottomCornerLibrary(), current, LAST_LAYER_CORNER_POSITIONS, TOP_AND_MIDDLE_CORNERS, protectedEdges, TOP_AND_MIDDLE_CORNERS, BOTTOM_CORNER_FIXED_EDGES);
      solution.push(...seq);
      current = applySeq(current, seq);
    }

    if (isBottomCornersSolved(current) && isBottomEdgesSolved(current)) return solution;

    const protectedCorners = new Set([...TOP_AND_MIDDLE_CORNERS, ...correctPositions(LAST_LAYER_CORNER_POSITIONS, current.cornerPerm, current.cornerOrient)]);
    const seq = solveTargetPositionsPreferring(EDGE_KIND, bottomEdgeLibrary(), current, BOTTOM_LOWER_EDGE_POSITIONS, protectedCorners, BOTTOM_EDGE_FIXED_EDGES, TOP_AND_MIDDLE_CORNERS, BOTTOM_EDGE_FIXED_EDGES);
    solution.push(...seq);
    current = applySeq(current, seq);
  }
  if (isBottomCornersSolved(current) && isBottomEdgesSolved(current)) return solution;
  throw new Error(`megaminxSolver: solveLastLayer did not converge within ${maxRounds} rounds`);
}

/** Full solve: all 6 phases in sequence, top layer down to bottom layer. */
export function solveMegaminx(state: MegaminxState): MegaminxTurn[] {
  const solution: MegaminxTurn[] = [];
  let current = state;
  const phases = [solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer];
  for (const phase of phases) {
    const phaseSolution = phase(current);
    solution.push(...phaseSolution);
    current = applySeq(current, phaseSolution);
  }
  return solution;
}

export function isMegaminxFullySolved(state: MegaminxState): boolean {
  return state.cornerPerm.every((p, i) => p === i) && state.cornerOrient.every((o) => o === 0) && state.edgePerm.every((p, i) => p === i) && state.edgeOrient.every((o) => o === 0);
}
