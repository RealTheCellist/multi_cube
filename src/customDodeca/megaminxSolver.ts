import { applyMegaminxMove, MOVE_TABLE, EDGES, type MegaminxState, type MegaminxTurn, type MegaminxMoveTable } from "./megaminxState";
import { FACE_VERTEX_INDICES, FACE_INDICES, FACE_NORMALS, type FaceIndex } from "./dodecaMath";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";

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

/** Like pieceKeyFor, but drops orientation -- only WHERE each corner piece sits (see kilominxSolver.ts's own positionOnlyKeyFor for why this is still sound and why it's useful for a setup search that doesn't care what orientation it arrives with). */
function cornerPositionOnlyKeyFor(cornerPieces: readonly number[]): (s: MegaminxState) => string {
  const sorted = [...cornerPieces].sort((a, b) => a - b);
  return (s: MegaminxState) => {
    const loc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) loc[s.cornerPerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

/**
 * Bidirectional (meet-in-the-middle) BFS from `state` to `target`, sound
 * only when `keyFn` is a projection the move action factors through (see
 * kilominxSolver.ts's own bidirectionalSearch for the full history of why
 * this matters -- an earlier, unsound version there returned false-
 * positive "solutions" that didn't actually solve anything). `pieceKeyFor`
 * above is exactly such a projection, so this can safely keep a single
 * representative state per key, no bucketing needed.
 */
interface Reached {
  state: MegaminxState;
  path: MegaminxTurn[];
}

function bidirectionalSearch(state: MegaminxState, target: MegaminxState, keyFn: (s: MegaminxState) => string, maxHalfDepth: number, maxFrontierSize = 1_500_000): MegaminxTurn[] | null {
  const targetKey = keyFn(target);
  let forward = new Map<string, Reached>([[keyFn(state), { state, path: [] }]]);
  let backward = new Map<string, Reached>([[targetKey, { state: target, path: [] }]]);

  const tryMeet = (): MegaminxTurn[] | null => {
    for (const [key, f] of forward) {
      const b = backward.get(key);
      if (!b) continue;
      const joined = [...f.path, ...b.path];
      if (keyFn(applySeq(state, joined)) !== targetKey) throw new Error("megaminxSolver: bidirectionalSearch keyFn is not a sound projection");
      return joined;
    }
    return null;
  };

  let meet = tryMeet();
  if (meet) return meet;

  for (let depth = 0; depth < maxHalfDepth; depth++) {
    const expandForward = forward.size <= backward.size;
    const frontier = expandForward ? forward : backward;
    const next = new Map<string, Reached>();
    for (const { state: base, path } of frontier.values()) {
      for (const face of FACE_INDICES) {
        for (const sign of [1, -1] as const) {
          const child = applyMegaminxMove(base, face, sign);
          const childKey = keyFn(child);
          if (next.has(childKey)) continue;
          if (next.size >= maxFrontierSize) return null;
          const childPath = expandForward ? [...path, { face, sign }] : [{ face, sign: (sign * -1) as 1 | -1 }, ...path];
          next.set(childKey, { state: child, path: childPath });
        }
      }
    }
    if (expandForward) forward = next;
    else backward = next;
    meet = tryMeet();
    if (meet) return meet;
  }
  return null;
}

function edgeIndexOf(a: number, b: number): number {
  const i = EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (i < 0) throw new Error(`megaminxSolver: no edge between vertices ${a} and ${b}`);
  return i;
}

const FIRST_LAYER_CORNER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[0];
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
const LOWER_UPPER_EDGE_POSITIONS: readonly number[] = edgesInBand("lower", "upper");
const LOWER_LOWER_EDGE_POSITIONS: readonly number[] = edgesInBand("lower", "lower");
const BOTTOM_LOWER_EDGE_POSITIONS: readonly number[] = edgesInBand("bottom", "lower");

/** The 10 "middle band" corners (between the top and bottom layers) -- same technique as kilominxSolver.ts's own MIDDLE_LAYER_POSITIONS. */
const MIDDLE_CORNER_POSITIONS: readonly number[] = Array.from({ length: 20 }, (_, i) => i).filter((p) => !FIRST_LAYER_CORNER_POSITIONS.includes(p) && !FACE_VERTEX_INDICES[BOTTOM_FACE].includes(p));
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
const crossKey = pieceKeyFor([], FIRST_LAYER_EDGE_POSITIONS);

export function isCrossSolved(state: MegaminxState): boolean {
  return crossKey(state) === crossKey(SOLVED_STATE);
}

export function solveCross(state: MegaminxState, maxHalfDepth = 11, maxFrontierSize = 1_500_000): MegaminxTurn[] {
  if (isCrossSolved(state)) return [];
  const solution = bidirectionalSearch(state, SOLVED_STATE, crossKey, maxHalfDepth, maxFrontierSize);
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
interface Commutator {
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
interface PieceKind {
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
const CORNER_KIND: PieceKind = { name: "corner", count: 20, mod: 3, perm: (s) => s.cornerPerm, orient: (s) => s.cornerOrient, support: (c) => c.cornerSupport, movingSupport: (c) => c.cornerMovingSupport, destination: (c) => c.cornerDestination };
const EDGE_KIND: PieceKind = { name: "edge", count: 30, mod: 2, perm: (s) => s.edgePerm, orient: (s) => s.edgeOrient, support: (c) => c.edgeSupport, movingSupport: (c) => c.edgeMovingSupport, destination: (c) => c.edgeDestination };

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

function buildCommutatorLibrary(targetKind: PieceKind, fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>, maxSupport = 6, perSizeCap = 80, maxPairsExamined = 1_500_000, pool: { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] } = { As: COMMUTATOR_As, Bs: COMMUTATOR_Bs }, cacheKey?: string): Commutator[] {
  if (cacheKey) {
    const fingerprint = libraryFingerprint(fixedCorners, fixedEdges, maxSupport, perSizeCap, maxPairsExamined, pool);
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
  if (cacheKey) saveCachedLibrary(cacheKey, libraryFingerprint(fixedCorners, fixedEdges, maxSupport, perSizeCap, maxPairsExamined, pool), out);
  return out;
}

/**
 * Parallel, cache-first library build -- spawns one worker
 * (megaminxCommutatorWorker.ts) per available core, each independently
 * searching its own slice of `pool.As` against the full `pool.Bs` (same
 * total (A,B) pair count as the sequential version, just split by A-range
 * instead of one thread walking the whole thing) -- measured directly:
 * building all 7 phases' libraries sequentially took 20-25 minutes; this
 * is the parallel counterpart, used by warmMegaminxLibraries below to
 * populate the SAME on-disk cache buildCommutatorLibrary's own sync path
 * reads from, so ordinary solve calls never need to know this exists.
 * Node's native TS support runs the worker file directly (confirmed
 * working on this project's Node 22.22, no bundling step needed) -- see
 * megaminxCommutatorWorker.ts's own dev notes for why it can't just
 * import megaminxState.ts and duplicates a small amount of logic instead.
 */
function runCommutatorWorker(input: {
  moveTable: readonly (readonly [MegaminxMoveTable, MegaminxMoveTable])[];
  asChunk: MegaminxTurn[][];
  bs: MegaminxTurn[][];
  targetKind: "corner" | "edge";
  fixedCorners: number[];
  fixedEdges: number[];
  maxSupport: number;
  perSizeCap: number;
  maxPairsExamined: number;
}): Promise<Commutator[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./megaminxCommutatorWorker.ts", import.meta.url), { workerData: input });
    worker.on("message", (result: Commutator[]) => {
      resolve(result);
      void worker.terminate();
    });
    worker.on("error", reject);
  });
}

async function buildCommutatorLibraryParallel(targetKind: PieceKind, fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>, maxSupport = 6, perSizeCap = 80, maxPairsExamined = 1_500_000, pool: { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] } = { As: COMMUTATOR_As, Bs: COMMUTATOR_Bs }, cacheKey?: string): Promise<Commutator[]> {
  const fingerprint = libraryFingerprint(fixedCorners, fixedEdges, maxSupport, perSizeCap, maxPairsExamined, pool);
  if (cacheKey) {
    const cached = loadCachedLibrary(cacheKey, fingerprint);
    if (cached) return cached;
  }

  const workerCount = Math.max(1, Math.min(availableParallelism(), 8, pool.As.length));
  const chunkSize = Math.ceil(pool.As.length / workerCount);
  const examinedPerWorker = Math.ceil(maxPairsExamined / workerCount);
  const chunks: MegaminxTurn[][][] = [];
  for (let i = 0; i < pool.As.length; i += chunkSize) chunks.push(pool.As.slice(i, i + chunkSize));

  const results = await Promise.all(
    chunks.map((asChunk) =>
      runCommutatorWorker({
        moveTable: MOVE_TABLE,
        asChunk,
        bs: pool.Bs,
        targetKind: targetKind.name as "corner" | "edge",
        fixedCorners: [...fixedCorners],
        fixedEdges: [...fixedEdges],
        maxSupport,
        perSizeCap,
        maxPairsExamined: examinedPerWorker,
      }),
    ),
  );

  const buckets = new Map<number, Commutator[]>();
  for (let n = 1; n <= maxSupport; n++) buckets.set(n, []);
  const seen = new Set<string>();
  for (const workerResult of results) {
    for (const c of workerResult) {
      const targetSupport = targetKind.support(c);
      const key = `${c.cornerSupport.join(",")}|${c.edgeSupport.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(targetSupport.length)!;
      if (bucket.length >= perSizeCap) continue;
      bucket.push(c);
    }
  }
  const out: Commutator[] = [];
  for (let n = 1; n <= maxSupport; n++) out.push(...buckets.get(n)!);
  if (cacheKey) saveCachedLibrary(cacheKey, fingerprint, out);
  return out;
}

/**
 * Pre-builds and caches every phase's commutator library in parallel,
 * ahead of any actual solve. Purely an opt-in speed optimization: every
 * `xxxLibrary()` call below still works correctly without ever calling
 * this (falling back to buildCommutatorLibrary's own synchronous,
 * single-threaded build-and-cache path on a cache miss) -- calling this
 * first just means that fallback finds a warm cache instead. Built
 * sequentially, one phase at a time (each phase already uses every
 * available core internally), rather than kicking off all 7 phases'
 * worker pools at once and oversubscribing the machine's cores.
 *
 * NOTE: each entry's params must match its corresponding `lazy()` call
 * site below exactly (same target kind, fixed sets, size/budget knobs,
 * pool, cache key) for the cache fingerprint to line up -- a mismatch
 * isn't unsafe (the sync path just rebuilds instead of reusing a stale
 * entry, per libraryFingerprint's own check), only silently loses the
 * speedup for that one phase.
 */
export async function warmMegaminxLibraries(): Promise<void> {
  const specs: [PieceKind, ReadonlySet<number>, ReadonlySet<number>, number | undefined, number | undefined, number | undefined, { As: MegaminxTurn[][]; Bs: MegaminxTurn[][] } | undefined, string][] = [
    [CORNER_KIND, new Set(), new Set(FIRST_LAYER_EDGE_POSITIONS), undefined, undefined, undefined, undefined, "firstLayerCorner"],
    [EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), new Set(FIRST_LAYER_EDGE_POSITIONS), undefined, undefined, undefined, undefined, "upperEdge"],
    [CORNER_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), MIDDLE_CORNER_FIXED_EDGES, undefined, undefined, undefined, undefined, "middleCorner"],
    [EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES, 10, 80, 8_000_000, undefined, "equatorialEdge"],
    [EDGE_KIND, TOP_AND_MIDDLE_CORNERS, LOWER_LOWER_FIXED_EDGES, 10, 80, 8_000_000, lastLayerPool(), "lowerLowerEdge"],
    [CORNER_KIND, TOP_AND_MIDDLE_CORNERS, BOTTOM_CORNER_FIXED_EDGES, 10, 150, 60_000_000, lastLayerDeepPool(), "bottomCorner"],
    [EDGE_KIND, TOP_AND_MIDDLE_CORNERS, BOTTOM_EDGE_FIXED_EDGES, 10, 150, 60_000_000, lastLayerDeepPool(), "bottomEdge"],
  ];
  for (const [kind, fc, fe, maxSupport, perSizeCap, budget, pool, cacheKey] of specs) {
    await buildCommutatorLibraryParallel(kind, fc, fe, maxSupport, perSizeCap, budget, pool, cacheKey);
  }
}

function positionOnlyKeyFor(kind: PieceKind, pieces: readonly number[]): (s: MegaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: MegaminxState) => {
    const perm = kind.perm(s);
    const loc = new Array<number>(kind.count);
    for (let pos = 0; pos < kind.count; pos++) loc[perm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

function countWrongKind(kind: PieceKind, state: MegaminxState, positions: readonly number[]): number {
  const perm = kind.perm(state);
  const orient = kind.orient(state);
  let n = 0;
  for (const p of positions) if (perm[p] !== p || orient[p] !== 0) n++;
  return n;
}

function fixedPreservedCheck(fixedCorners: ReadonlySet<number>, fixedEdges: ReadonlySet<number>): (s: MegaminxState) => boolean {
  return (s: MegaminxState) => [...fixedCorners].every((p) => s.cornerPerm[p] === p && s.cornerOrient[p] === 0) && [...fixedEdges].every((p) => s.edgePerm[p] === p && s.edgeOrient[p] === 0);
}

/**
 * Same single-anchor setup search as kilominxSolver.ts's own
 * findSafeApplication, generalized over piece kind -- with ONE addition
 * kilominx never needed: anchors are drawn from `movingSupport`, not the
 * full `support` (see Commutator's own cornerMovingSupport/
 * edgeMovingSupport comment for why a pure-twist anchor can never
 * relocate a misplaced piece here). Kilominx's own main COMMUTATORS
 * library never produced a pure-twist entry below support 3 in the first
 * place (confirmed by its own dev notes), so this distinction never
 * mattered there; it does here because edges readily produce pure
 * support-2 twists.
 */
/**
 * Same single-anchor setup search as kilominxSolver.ts's own
 * findSafeApplication, generalized over piece kind, PLUS one more
 * restriction kilominx never needed: only commutators with support >= 3
 * are usable here at all. Reasoning (confirmed empirically: a genuinely
 * misplaced edge left EVERY one of 1440 (commutator, anchor) attempts at
 * exactly the same wrong count, never fewer): a 2-element commutator
 * (a transposition -- swap anchor and its one other support position, or
 * a pure twist) has no "spare" element to absorb the setup's own
 * un-doing. Conjugating it (S.C.S') to route OUR piece to `anchor` sends
 * whatever ends up at anchor's PARTNER position back through S' to
 * wherever OUR piece started -- not to `target`'s home -- so it can only
 * ever "fix" a piece that's already home (nothing to relocate) or get
 * lucky in a way no example of this ever showed. A 3+-element cycle has
 * a genuine spare: routing our piece to one slot and letting the OTHER
 * (>= 2) slots cycle between themselves is what actually lets S' deliver
 * our piece home while the others land wherever S itself would have put
 * them anyway (fixedOk/wrongAfter still verify the real outcome either
 * way -- this is a performance/targeting restriction, not a new
 * unverified assumption).
 */
/**
 * Routes a genuinely misplaced piece home via a conjugated commutator,
 * using a JOINT (2-condition) setup search -- not the single-condition
 * "route piece to anchor" search this replaced. Proven insufficient the
 * hard way: single-anchor routing only guarantees the piece reaches
 * `anchor` BEFORE the commutator acts; it says nothing about where it
 * ends up AFTER C moves it away from anchor and S' maps things back, so
 * success was pure coincidence -- confirmed empirically (a genuinely
 * misplaced edge left EVERY ONE of 1440 tried (commutator, anchor) pairs
 * at exactly the same wrong count, never fewer, regardless of commutator
 * support size).
 *
 * The correct condition: piece `target` ends up at HOME (= `target`
 * itself, since piece ids equal home positions) if and only if the setup
 * S satisfies TWO things at once:
 *   1. s.perm[anchor] === target        (piece target sits at anchor)
 *   2. s.perm[C.destination[anchor]] === displaced   (whatever currently
 *      occupies target's own home ends up at C's own image of anchor)
 * where `displaced` is whatever piece is CURRENTLY at position `target`
 * in `current` (the piece that needs to be swapped OUT to make room).
 * Condition 2 exists because conjugation acts on POSITIONS uniformly
 * (C sends anchor's occupant, whoever it is, to C.destination[anchor]
 * regardless of who that occupant is) -- so undoing S only delivers our
 * piece back to `target` if `displaced` is ALSO exactly where S's own
 * inverse expects it, at C.destination[anchor], when S' runs.
 *
 * Both are position-only conditions on 2 specific pieces, so this is
 * really the SAME joint machinery as findFinishingApplication (a sound,
 * position-only key, verified by full replay) -- just with a goal
 * PREDICATE instead of a precomputed reach table, since here there's
 * only one (target, displaced) pair to search for per anchor, not many
 * candidate assignments to look up.
 */
/**
 * Explores forward from `state` by BFS, recording the FIRST (shortest)
 * path reaching every distinct value of `keyFn` -- same technique
 * findFinishingApplication already used inline (build ONE reachability
 * table, then do O(1) lookups for every candidate) factored out so
 * findSafeApplication can use it too. This replaced a version of
 * findSafeApplication that called forwardSearchUntil -- a FRESH BFS --
 * once per (commutator, anchor) pair: with a 700+-entry library that's
 * hundreds of redundant traversals of the exact same reachable space for
 * a single findSafeApplication call, confirmed the hard way (a 3-seed
 * test that used to take under a minute per seed ballooned to 80+
 * minutes once the equatorial-edge library grew to ~720 entries). The
 * setup key only depends on (target, displaced), not on which commutator
 * or anchor is being tried, so one shared table serves the whole library.
 */
function buildReachableMap(state: MegaminxState, keyFn: (s: MegaminxState) => string, maxDepth: number, maxReachable = 300_000): Map<string, MegaminxTurn[]> {
  const reachable = new Map<string, MegaminxTurn[]>([[keyFn(state), []]]);
  let frontier: { state: MegaminxState; path: MegaminxTurn[] }[] = [{ state, path: [] }];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && reachable.size < maxReachable; depth++) {
    const next: { state: MegaminxState; path: MegaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const face of FACE_INDICES) {
        for (const sign of [1, -1] as const) {
          const child = applyMegaminxMove(base, face, sign);
          const key = keyFn(child);
          if (reachable.has(key)) continue;
          if (reachable.size >= maxReachable) break;
          const childPath = [...path, { face, sign }];
          reachable.set(key, childPath);
          next.push({ state: child, path: childPath });
        }
      }
    }
    frontier = next;
  }
  return reachable;
}

/** Builds the SAME key format positionOnlyKeyFor(kind, [a, b]) would report for a state where piece a sits at position posA and piece b sits at position posB (sorted by piece id, matching positionOnlyKeyFor's own sort). */
function jointPositionKey(a: number, posA: number, b: number, posB: number): string {
  return a <= b ? `${posA},${posB}` : `${posB},${posA}`;
}

function findSafeApplication(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, fixedOk: (s: MegaminxState) => boolean, targetPositions: readonly number[], target: number, wrongBefore: number, requireImprovement: boolean): { state: MegaminxState; seq: MegaminxTurn[] } | null {
  const displaced = kind.perm(current)[target];

  if (displaced === target) {
    // Already at home, just mis-oriented: no relocation needed, so the
    // old single-condition routing is fine here (nothing to "swap out").
    const setupKeyFn = positionOnlyKeyFor(kind, [target]);
    const reachable = buildReachableMap(current, setupKeyFn, 9);
    for (const C of library) {
      for (const anchor of kind.movingSupport(C)) {
        const S = reachable.get(String(anchor));
        if (!S) continue;
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);

        if (!fixedOk(resultState)) continue;
        const wrongAfter = countWrongKind(kind, resultState, targetPositions);
        if (requireImprovement ? wrongAfter >= wrongBefore : wrongAfter > wrongBefore) continue;

        return { state: resultState, seq: fullSeq };
      }
    }
    return null;
  }

  const setupKeyFn = positionOnlyKeyFor(kind, [target, displaced]);
  const reachable = buildReachableMap(current, setupKeyFn, 11);
  for (const C of library) {
    const destination = kind.destination(C);
    for (const anchor of kind.movingSupport(C)) {
      const dest = destination[anchor];
      if (dest === anchor) continue; // no genuine relocation to exploit
      const S = reachable.get(jointPositionKey(target, anchor, displaced, dest));
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);

      if (!fixedOk(resultState)) continue;
      const wrongAfter = countWrongKind(kind, resultState, targetPositions);
      if (requireImprovement ? wrongAfter >= wrongBefore : wrongAfter > wrongBefore) continue;

      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([items[i], ...p]);
  }
  return out;
}

/**
 * The joint (all-at-once) finisher, same technique as kilominxSolver.ts's
 * own tryExactFinish, generalized over piece kind. Cost is O(wrongPieces!)
 * -- permutations(wrongPieces) -- times however many library entries
 * share that exact support size, so callers should keep wrongPositions
 * small (solveTargetPositions caps it at 6); this guard is a defense-in-
 * depth backstop, not the primary control.
 */
function findFinishingApplication(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, fixedOk: (s: MegaminxState) => boolean, wrongPositions: readonly number[]): { state: MegaminxState; seq: MegaminxTurn[] } | null {
  if (wrongPositions.length > 8) return null;
  const perm = kind.perm(current);
  const wrongPieces = wrongPositions.map((p) => perm[p]);
  const sortedPieces = [...wrongPieces].sort((a, b) => a - b);
  const posKeyFn = positionOnlyKeyFor(kind, wrongPieces);
  const reachable = buildReachableMap(current, posKeyFn, 10);

  for (const C of library) {
    const support = kind.support(C);
    if (support.length !== wrongPieces.length) continue;
    for (const assignment of permutations(wrongPieces)) {
      const pieceToPos = new Map<number, number>();
      assignment.forEach((piece, i) => pieceToPos.set(piece, support[i]));
      const key = sortedPieces.map((piece) => pieceToPos.get(piece)).join(",");
      const S = reachable.get(key);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);

      if (!fixedOk(resultState)) continue;
      const resultPerm = kind.perm(resultState);
      const resultOrient = kind.orient(resultState);
      if (wrongPieces.some((piece) => resultPerm[piece] !== piece || resultOrient[piece] !== 0)) continue;

      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
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
  const fixedOk = fixedPreservedCheck(fixedCorners, fixedEdges);
  const maxSupport = Math.max(...library.map((c) => kind.support(c).length), 0);

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
    let found = wrongBefore >= 2 && wrongBefore <= Math.min(maxSupport, MAX_FINISH_SIZE) ? findFinishingApplication(kind, library, current, fixedOk, wrongPositions) : null;
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
        found = findSafeApplication(kind, library, current, fixedOk, targetPositions, target, wrongBefore, true);
        if (found) break;
      }
      if (found) {
        consecutiveLateral = 0;
      } else {
        if (consecutiveLateral >= maxConsecutiveLateral) {
          throw new Error(`megaminxSolver: solveTargetPositions stuck (${countWrongKind(kind, current, targetPositions)} pieces still wrong, ${maxConsecutiveLateral} lateral moves in a row without progress)`);
        }
        for (const target of wrongPositions) {
          found = findSafeApplication(kind, library, current, fixedOk, targetPositions, target, wrongBefore, false);
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
const MIDDLE_CORNER_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS]);
const middleCornerLibrary = lazy(() => buildCommutatorLibrary(CORNER_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), MIDDLE_CORNER_FIXED_EDGES, undefined, undefined, undefined, undefined, "middleCorner"));

export function isMiddleCornersSolved(state: MegaminxState): boolean {
  return MIDDLE_CORNER_POSITIONS.every((p) => state.cornerPerm[p] === p && state.cornerOrient[p] === 0);
}

export function solveMiddleCorners(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(CORNER_KIND, middleCornerLibrary(), state, MIDDLE_CORNER_POSITIONS, new Set(FIRST_LAYER_CORNER_POSITIONS), MIDDLE_CORNER_FIXED_EDGES, maxAttempts);
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
const EQUATORIAL_FIXED_EDGES = new Set([...FIRST_LAYER_EDGE_POSITIONS, ...UPPER_UPPER_EDGE_POSITIONS]);
const equatorialEdgeLibrary = lazy(() => buildCommutatorLibrary(EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES, 10, 80, 8_000_000, undefined, "equatorialEdge"));

export function isEquatorialEdgesSolved(state: MegaminxState): boolean {
  return LOWER_UPPER_EDGE_POSITIONS.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

/** Solves the equatorial edges alone, deliberately allowed to disturb the middle corners (see solveMiddleLayer). */
export function solveEquatorialEdges(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(EDGE_KIND, equatorialEdgeLibrary(), state, LOWER_UPPER_EDGE_POSITIONS, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES, maxAttempts);
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

export function solveBottomCorners(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(CORNER_KIND, bottomCornerLibrary(), state, LAST_LAYER_CORNER_POSITIONS, TOP_AND_MIDDLE_CORNERS, BOTTOM_CORNER_FIXED_EDGES, maxAttempts);
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

/** Solves the bottom edges alone, deliberately allowed to disturb the bottom corners (see solveLastLayer). */
export function solveBottomEdges(state: MegaminxState, maxAttempts = 400): MegaminxTurn[] {
  return solveTargetPositions(EDGE_KIND, bottomEdgeLibrary(), state, BOTTOM_LOWER_EDGE_POSITIONS, TOP_AND_MIDDLE_CORNERS, BOTTOM_EDGE_FIXED_EDGES, maxAttempts);
}

function correctPositions(positions: readonly number[], perm: Int8Array, orient: Int8Array): number[] {
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
 * Blind ping-pong (just alternating solveBottomCorners/solveBottomEdges)
 * risks a period-2 cycle: each greedy solve is deterministic, so if fixing
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
function solveTargetPositionsPreferring(kind: PieceKind, library: readonly Commutator[], current: MegaminxState, targetPositions: readonly number[], strictFixedCorners: ReadonlySet<number>, strictFixedEdges: ReadonlySet<number>, looseFixedCorners: ReadonlySet<number>, looseFixedEdges: ReadonlySet<number>): MegaminxTurn[] {
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
