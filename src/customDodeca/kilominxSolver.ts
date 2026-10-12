import { applyKilominxMove, type KilominxState, type KilominxTurn } from "./kilominxState";
import { uploadLibraryWasm, findSafeApplicationWasm, findFinishingApplicationWasm } from "./kilominxSearchWasm";
export { warmupKilominxSearchWasm } from "./kilominxSearchWasm";
import { FACE_VERTEX_INDICES, FACE_INDICES, FACE_NORMALS, type FaceIndex } from "./dodecaMath";
// node:fs/node:path/node:url are deliberately NOT imported at the top level
// -- see megaminxSearchWasm.ts's own comment on this (Vite's dev server
// throws immediately on merely importing a named binding off an
// externalized Node builtin). Lazily `require()`'d on the Node-only branch
// below instead.
//
// Pre-built commutator library, same treatment as megaminxSolver.ts's own
// 7 static libraries: building this from scratch takes real time (minutes),
// fine for a long-lived Node process (reused via `lazy()`) but fatal for a
// browser tab's first "솔브" press.
import kilominxCornerStatic from "./data/kilominxCornerCommutators.json";

const STATIC_LIBRARIES: Record<string, { fingerprint: string; commutators: Commutator[] }> = {
  corner: kilominxCornerStatic as any,
};

const SOLVED_STATE: KilominxState = { perm: Array.from({ length: 20 }, (_, i) => i), orient: new Array(20).fill(0) };

function applySeq(state: KilominxState, seq: readonly KilominxTurn[]): KilominxState {
  let s = state;
  for (const t of seq) s = applyKilominxMove(s, t.face, t.sign);
  return s;
}
function invertSeq(seq: readonly KilominxTurn[]): KilominxTurn[] {
  return [...seq]
    .reverse()
    .map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1 }));
}

/**
 * Bidirectional (meet-in-the-middle) BFS from `state` to `target`, where
 * `keyFn` decides which states count as "the same" (a PROJECTION -- e.g.
 * only caring where a handful of specific pieces ended up, ignoring the
 * rest). Search forward from `state` and backward from `target`
 * simultaneously and stop as soon as the two frontiers share a key, so
 * reaching a real combined depth of d only costs exploring roughly
 * 2 * branching^(d/2) states instead of branching^d.
 *
 * Kept as pure JS (not ported to Wasm): used only by solveFirstLayer below,
 * which was never the slow phase (sub-3s per scramble, measured) -- the
 * actual bottleneck this module's own WASM port targets is solveRemaining's
 * commutator-insertion loop (see findSafeApplication/findFinishingApplication
 * below), which used to run a fresh JS BFS per candidate.
 */
interface Reached {
  state: KilominxState;
  path: KilominxTurn[];
}

function bidirectionalSearch(state: KilominxState, target: KilominxState, keyFn: (s: KilominxState) => string, maxHalfDepth: number, maxFrontierSize = 150_000): KilominxTurn[] | null {
  const targetKey = keyFn(target);
  let forward = new Map<string, Reached>([[keyFn(state), { state, path: [] }]]);
  let backward = new Map<string, Reached>([[targetKey, { state: target, path: [] }]]);

  const tryMeet = (): KilominxTurn[] | null => {
    for (const [key, f] of forward) {
      const b = backward.get(key);
      if (!b) continue;
      const joined = [...f.path, ...b.path];
      if (keyFn(applySeq(state, joined)) !== targetKey) throw new Error("kilominxSolver: bidirectionalSearch keyFn is not a sound projection");
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
          const child = applyKilominxMove(base, face, sign);
          const childKey = keyFn(child);
          if (next.has(childKey)) continue;
          if (next.size >= maxFrontierSize) return null;
          const childPath = expandForward
            ? [...path, { face, sign }]
            : [{ face, sign: (sign * -1) as 1 | -1 }, ...path];
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

/** Where each of `pieces` currently sits, and how it is oriented -- a sound projection (see bidirectionalSearch). */
function pieceKeyFor(pieces: readonly number[]): (s: KilominxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: KilominxState) => {
    const loc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) loc[s.perm[pos]] = pos;
    return sorted.map((piece) => `${loc[piece]}:${s.orient[loc[piece]]}`).join(",");
  };
}

/**
 * Phase 1: solve face 0's own 5 corners (position + orientation), ignoring
 * where the other 15 end up -- exactly how a human solves a Kilominx's (or
 * a 2x2x2's) first layer.
 */
const FIRST_LAYER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[0];
const firstLayerKey = pieceKeyFor(FIRST_LAYER_POSITIONS);

export function isFirstLayerSolved(state: KilominxState): boolean {
  return firstLayerKey(state) === firstLayerKey(SOLVED_STATE);
}

/** Face 0's ANTIPODAL face and its 5 vertices -- computed geometrically, matching dodecaMath's own established rule. */
const LAST_LAYER_FACE: FaceIndex = FACE_INDICES.reduce((best, f) => (FACE_NORMALS[f].dot(FACE_NORMALS[0]) < FACE_NORMALS[best].dot(FACE_NORMALS[0]) ? f : best), FACE_INDICES[1]);
const LAST_LAYER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[LAST_LAYER_FACE];
const MIDDLE_LAYER_POSITIONS: readonly number[] = Array.from({ length: 20 }, (_, i) => i).filter((p) => !FIRST_LAYER_POSITIONS.includes(p) && !LAST_LAYER_POSITIONS.includes(p));

export function solveFirstLayer(state: KilominxState, maxHalfDepth = 11): KilominxTurn[] {
  if (isFirstLayerSolved(state)) return [];
  const solution = bidirectionalSearch(state, SOLVED_STATE, firstLayerKey, maxHalfDepth, 1_500_000);
  if (!solution) throw new Error(`kilominxSolver: first layer not solved within half-depth ${maxHalfDepth}`);
  return solution;
}

/**
 * Phase 2: solve the remaining 15 corners without disturbing face 0, using
 * real commutators/conjugation -- same group-theory technique as this
 * module's own original pure-JS version (see git history), now with the
 * commutator-insertion search itself (the setup BFS and the candidate-
 * matching loop) running in the Wasm search engine instead of a fresh JS
 * BFS per candidate, mirroring megaminxSolver.ts's own CORNER_KIND
 * machinery -- Kilominx has only ONE piece kind (20 corners, mod 3,
 * no edges at all), so this is that same machinery with the edge half
 * simply never used (see kilominxSearchWasm.ts's own top comment).
 */
export interface Commutator {
  seq: KilominxTurn[];
  support: number[];
  /** The subset of `support` findSafeApplication's anchor routing can actually use (positions the commutator MOVES, not just twists -- see megaminxSolver.ts's own Commutator.cornerMovingSupport comment). */
  movingSupport: number[];
  /** destination[p] = where position p's occupant ends up after this commutator -- see megaminxSolver.ts's own Commutator.cornerDestination comment. */
  destination: number[];
}

function makeCommutator(a: KilominxTurn[], b: KilominxTurn[]): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(SOLVED_STATE, seq);
  const support: number[] = [];
  const movingSupport: number[] = [];
  const destination: number[] = new Array(20);
  for (let pos = 0; pos < 20; pos++) destination[result.perm[pos]] = pos;
  for (let i = 0; i < 20; i++) {
    if (result.perm[i] === i && result.orient[i] === 0) continue;
    support.push(i);
    if (result.perm[i] !== i) movingSupport.push(i);
  }
  return { seq, support, movingSupport, destination };
}

function buildSequencesUpToDepth(singles: readonly KilominxTurn[], maxDepth: number): KilominxTurn[][] {
  let all: KilominxTurn[][] = singles.map((t) => [t]);
  let prevDepth = all;
  for (let d = 2; d <= maxDepth; d++) {
    const next = prevDepth.flatMap((seq) => singles.filter((t) => t.face !== seq[seq.length - 1].face).map((t) => [...seq, t]));
    all = [...all, ...next];
    prevDepth = next;
  }
  return all;
}

const COMMUTATOR_SINGLES: KilominxTurn[] = (() => {
  const singles: KilominxTurn[] = [];
  for (const face of FACE_INDICES) for (const sign of [1, -1] as const) singles.push({ face, sign });
  return singles;
})();
const COMMUTATOR_As = buildSequencesUpToDepth(COMMUTATOR_SINGLES, 2);
const COMMUTATOR_Bs = buildSequencesUpToDepth(COMMUTATOR_SINGLES, 3);

function cacheDir(): string {
  const { dirname, join } = require("node:path");
  const { fileURLToPath } = require("node:url");
  return join(dirname(fileURLToPath(import.meta.url)), "data");
}
function cacheFilePath(cacheKey: string): string {
  const { join } = require("node:path");
  return join(cacheDir(), `raw-dataset-kilominx-${cacheKey}.json`);
}
function loadCachedLibrary(cacheKey: string, fingerprint: string): Commutator[] | null {
  if (typeof window !== "undefined") return null;
  try {
    const raw = require("node:fs").readFileSync(cacheFilePath(cacheKey), "utf8");
    const data = JSON.parse(raw) as { fingerprint: string; commutators: Commutator[] };
    return data.fingerprint === fingerprint ? data.commutators : null;
  } catch {
    return null;
  }
}
function saveCachedLibrary(cacheKey: string, fingerprint: string, commutators: Commutator[]): void {
  if (typeof window !== "undefined") return;
  try {
    const fs = require("node:fs");
    if (!fs.existsSync(cacheDir())) fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFilePath(cacheKey), JSON.stringify({ fingerprint, commutators }));
  } catch {
    // Best-effort, same as megaminxSolver.ts's own saveCachedLibrary.
  }
}

function libraryFingerprint(fixed: ReadonlySet<number>, maxSupport: number, perSizeCap: number, maxPairsExamined: number): string {
  const f = [...fixed].sort((a, b) => a - b).join(",");
  return `${f}|${maxSupport}|${perSizeCap}|${maxPairsExamined}|${COMMUTATOR_As.length}x${COMMUTATOR_Bs.length}`;
}

/**
 * A broad, COMPUTED library of commutators useful for inserting corners --
 * kept only if they don't touch any of `fixed` and have a nonempty,
 * reasonably small support, bucketed by support size (smallest first). Same
 * reasoning as this module's own original pure-JS COMMUTATORS/TWIST_COMMUTATORS
 * search (see git history), generalized to a single reusable function
 * matching megaminxSolver.ts's own buildCommutatorLibrary shape.
 */
export function buildCommutatorLibrary(fixed: ReadonlySet<number>, maxSupport = 6, perSizeCap = 80, maxPairsExamined = 1_500_000, cacheKey?: string): Commutator[] {
  const fingerprint = cacheKey ? libraryFingerprint(fixed, maxSupport, perSizeCap, maxPairsExamined) : undefined;
  if (cacheKey && fingerprint) {
    const staticLib = STATIC_LIBRARIES[cacheKey];
    if (staticLib && staticLib.fingerprint === fingerprint) return staticLib.commutators;
    if (typeof window !== "undefined") {
      throw new Error(`kilominxSolver: static commutator library "${cacheKey}" is missing or stale (fingerprint mismatch). Regenerate src/customDodeca/data/kilominxCornerCommutators.json -- refusing to silently fall back to a from-scratch rebuild (can take minutes).`);
    }
    const cached = loadCachedLibrary(cacheKey, fingerprint);
    if (cached) return cached;
  }

  const buckets = new Map<number, Commutator[]>();
  for (let n = 1; n <= maxSupport; n++) buckets.set(n, []);
  const seen = new Set<string>();
  let examined = 0;

  outer: for (const A of COMMUTATOR_As) {
    for (const B of COMMUTATOR_Bs) {
      if (examined++ >= maxPairsExamined) break outer;
      const c = makeCommutator(A, B);
      if (c.support.length === 0 || c.support.length > maxSupport) continue;
      if (c.support.some((p) => fixed.has(p))) continue;
      const key = c.support.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(c.support.length)!;
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

/**
 * A dedicated hunt for PURE-TWIST commutators -- identity permutation,
 * nonzero orientation only. Same technique as this module's original
 * pure-JS TWIST_COMMUTATORS (see git history): no support-1 or support-2
 * entry ever turns up in the raw [A,B] library search below (a single
 * commutator generically produces a permutation cycle), so a dedicated
 * second pass builds commutators OF commutators ([C1,C2] from two small,
 * partially-overlapping library entries) to cancel the permutation parts
 * while keeping the orientation effect -- exactly the pattern a Kilominx's
 * endgame residual is, empirically, most likely to need (confirmed: this
 * module's own WASM port regressed from 30/30 to 24/30 on dropping this
 * step, every failure a 2-position pure-twist residual with no library
 * match otherwise).
 */
function buildTwistCommutators(library: readonly Commutator[]): Commutator[] {
  const small = library.filter((c) => c.support.length <= 4);
  const MAX_SUPPORT = 4;
  const PER_SIZE_CAP = 20;
  const buckets = new Map<number, Commutator[]>();
  for (let n = 2; n <= MAX_SUPPORT; n++) buckets.set(n, []);
  const seen = new Set<string>();
  for (const C1 of small) {
    for (const C2 of small) {
      const overlap = C1.support.filter((p) => C2.support.includes(p));
      if (overlap.length === 0 || overlap.length === C1.support.length) continue;
      const seq = [...C1.seq, ...C2.seq, ...invertSeq(C1.seq), ...invertSeq(C2.seq)];
      const result = applySeq(SOLVED_STATE, seq);
      const support: number[] = [];
      for (let i = 0; i < 20; i++) if (result.perm[i] !== i || result.orient[i] !== 0) support.push(i);
      if (support.length < 2 || support.length > MAX_SUPPORT) continue;
      if (support.some((p) => FIRST_LAYER_POSITIONS.includes(p))) continue;
      if (!support.every((p) => result.perm[p] === p)) continue; // must be PURE twist: no permutation at all
      const key = support.map((p) => `${p}:${result.orient[p]}`).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(support.length)!;
      if (bucket.length >= PER_SIZE_CAP) continue;
      const destination: number[] = new Array(20);
      for (let pos = 0; pos < 20; pos++) destination[result.perm[pos]] = pos;
      bucket.push({ seq, support, movingSupport: [], destination });
    }
  }
  const out: Commutator[] = [];
  for (let n = 2; n <= MAX_SUPPORT; n++) out.push(...buckets.get(n)!);
  return out;
}

function countWrong(state: KilominxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.perm[p] !== p || state.orient[p] !== 0) n++;
  return n;
}

export function isKilominxFullySolved(state: KilominxState): boolean {
  return state.perm.every((p, i) => p === i) && state.orient.every((o) => o === 0);
}

/** Uploads `library` to the Wasm module once per distinct array (cached by identity), same contract as megaminxSolver.ts's own getLibraryHandle. */
const libraryHandleCache = new WeakMap<readonly Commutator[], number>();
function getLibraryHandle(library: readonly Commutator[]): number {
  const cached = libraryHandleCache.get(library);
  if (cached !== undefined) return cached;
  const handle = uploadLibraryWasm(library.map((c) => ({ seq: c.seq, support: c.support, movingSupport: c.movingSupport, destination: c.destination })));
  libraryHandleCache.set(library, handle);
  return handle;
}

/** Wasm-backed drop-in for this module's own original JS findSafeApplication -- see wasm-search/src/lib.rs's own find_safe_application and megaminxSolver.ts's own findSafeApplication (same algorithm, ported once there already; this just reuses the Wasm side with kind=0 fixed). */
function findSafeApplication(library: readonly Commutator[], current: KilominxState, fixed: readonly number[], targetPositions: readonly number[], target: number, wrongBefore: number, requireImprovement: boolean): { state: KilominxState; seq: KilominxTurn[] } | null {
  const displaced = current.perm[target];
  const handle = getLibraryHandle(library);
  return findSafeApplicationWasm(handle, current, target, displaced, fixed, targetPositions, wrongBefore, requireImprovement);
}

/** Same tiering as megaminxSolver.ts's own finishingSearchCap -- see its own dev notes. */
function finishingSearchCap(n: number): { maxDepth: number; maxReachable: number } {
  if (n <= 3) return { maxDepth: 4, maxReachable: 2_000 };
  if (n === 4) return { maxDepth: 3, maxReachable: 1_000 };
  if (n === 5) return { maxDepth: 2, maxReachable: 400 };
  if (n === 6) return { maxDepth: 2, maxReachable: 200 };
  return { maxDepth: 1, maxReachable: 100 };
}

/** Wasm-backed drop-in for this module's own original JS findFinishingApplication/tryExactFinish. */
function findFinishingApplication(library: readonly Commutator[], current: KilominxState, fixed: readonly number[], wrongPositions: readonly number[]): { state: KilominxState; seq: KilominxTurn[] } | null {
  if (wrongPositions.length > 8) return null;
  const { maxDepth, maxReachable } = finishingSearchCap(wrongPositions.length);
  const handle = getLibraryHandle(library);
  return findFinishingApplicationWasm(handle, current, wrongPositions, fixed, maxDepth, maxReachable);
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((c) => [first, ...c]), ...combinations(rest, size)];
}

/**
 * The expensive fallback for a COMPOUND residual -- e.g. an independent
 * 3-cycle plus a separate lone twist, two unrelated library-shaped patterns
 * rather than one. Same technique as this module's original pure-JS
 * findCompoundFinishingApplication (see git history), now trying every
 * SUBSET of the wrong positions (largest first) via the Wasm exact-finish
 * search instead of a from-scratch JS BFS per subset. Reserved as a genuine
 * last resort (tried only once consecutive-lateral moves are exhausted),
 * same as the original: with only a ~552x12168-pair, maxSupport=6 library
 * (smaller than megaminx's own per-phase libraries, which never needed this
 * fallback), a handful of real scrambles leave behind exactly this kind of
 * compound residual that the single-shot findFinishingApplication (which
 * only ever tries the FULL wrong set against the library) can't resolve.
 */
function findCompoundFinishingApplication(library: readonly Commutator[], current: KilominxState, fixed: readonly number[], wrongPositions: readonly number[]): { state: KilominxState; seq: KilominxTurn[] } | null {
  for (let size = wrongPositions.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPositions, size)) {
      const partial = findFinishingApplication(library, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

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
 * The generic greedy+commutator loop -- same shape as megaminxSolver.ts's
 * own solveTargetPositions (which itself dropped this module's original
 * compound/subset fallback once the whole search moved to Wasm: cheap
 * enough now that the single-piece routing below reliably makes progress
 * without needing it, confirmed empirically there and reused unchanged
 * here).
 */
function solveTargetPositions(library: readonly Commutator[], state: KilominxState, targetPositions: readonly number[], initialFixed: ReadonlySet<number>, maxAttempts = 400): KilominxTurn[] {
  const maxSupport = Math.max(...library.map((c) => c.support.length), 0);
  let current = state;
  const solution: KilominxTurn[] = [];
  const fixed = new Set(initialFixed);

  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  const MAX_FINISH_SIZE = 6;

  while (targetPositions.some((p) => current.perm[p] !== p || current.orient[p] !== 0)) {
    attempts++;
    if (attempts > maxAttempts) throw new Error(`kilominxSolver: solveTargetPositions exceeded ${maxAttempts} attempts`);

    const fixedArr = [...fixed];
    const wrongPositions = targetPositions.filter((p) => current.perm[p] !== p || current.orient[p] !== 0);
    const wrongBefore = wrongPositions.length;

    let found = wrongBefore >= 2 && wrongBefore <= Math.min(maxSupport, MAX_FINISH_SIZE) ? findFinishingApplication(library, current, fixedArr, wrongPositions) : null;
    if (found) {
      consecutiveLateral = 0;
    } else {
      for (const target of wrongPositions) {
        found = findSafeApplication(library, current, fixedArr, targetPositions, target, wrongBefore, true);
        if (found) break;
      }
      if (found) {
        consecutiveLateral = 0;
      } else {
        if (consecutiveLateral >= maxConsecutiveLateral) {
          found = wrongBefore >= 2 && wrongBefore <= 6 ? findCompoundFinishingApplication(library, current, fixedArr, wrongPositions) : null;
          if (!found) {
            throw new Error(`kilominxSolver: solveTargetPositions stuck (${countWrong(current, targetPositions)} positions still wrong, ${maxConsecutiveLateral} lateral moves in a row without progress)`);
          }
          consecutiveLateral = 0;
          current = found.state;
          solution.push(...found.seq);
          for (const p of targetPositions) if (current.perm[p] === p && current.orient[p] === 0) fixed.add(p);
          continue;
        }
        for (const target of wrongPositions) {
          found = findSafeApplication(library, current, fixedArr, targetPositions, target, wrongBefore, false);
          if (found) break;
        }
        if (!found) {
          throw new Error(`kilominxSolver: solveTargetPositions stuck (${countWrong(current, targetPositions)} positions still wrong, no safe commutator application found at all)`);
        }
        consecutiveLateral++;
      }
    }

    current = found.state;
    solution.push(...found.seq);
    for (const p of targetPositions) if (current.perm[p] === p && current.orient[p] === 0) fixed.add(p);
  }
  return solution;
}

/**
 * Built once, shared by both the middle-layer and bottom-layer passes below
 * -- twist commutators first (smallest-support, most surgical -- see
 * buildTwistCommutators's own dev notes), same ordering as this module's
 * original pure-JS ALL_COMMUTATORS = [...TWIST_COMMUTATORS, ...COMMUTATORS].
 */
const baseCornerLibrary = lazy(() => buildCommutatorLibrary(new Set(FIRST_LAYER_POSITIONS), 6, 80, 1_500_000, "corner"));
const cornerLibrary = lazy(() => [...buildTwistCommutators(baseCornerLibrary()), ...baseCornerLibrary()]);

/**
 * Phase 2, Layer-by-Layer: solve the 10 middle-layer positions (face 0
 * fixed), then the 5 bottom-layer positions (face 0 AND middle fixed) --
 * same split as this module's original pure-JS version (see git history
 * for why: a single 15-at-once pass left behind atomic residuals more
 * often than two smaller passes).
 */
export function solveRemaining(state: KilominxState): KilominxTurn[] {
  const library = cornerLibrary();
  const middleSolution = solveTargetPositions(library, state, MIDDLE_LAYER_POSITIONS, new Set(FIRST_LAYER_POSITIONS));
  const afterMiddle = applySeq(state, middleSolution);
  const bottomFixed = new Set([...FIRST_LAYER_POSITIONS, ...MIDDLE_LAYER_POSITIONS]);
  const bottomSolution = solveTargetPositions(library, afterMiddle, LAST_LAYER_POSITIONS, bottomFixed);
  return [...middleSolution, ...bottomSolution];
}

/** Full solve: first layer, then everything else. */
export function solveKilominx(state: KilominxState): KilominxTurn[] {
  const layerSolution = solveFirstLayer(state);
  const s = applySeq(state, layerSolution);
  const restSolution = solveRemaining(s);
  return [...layerSolution, ...restSolution];
}
