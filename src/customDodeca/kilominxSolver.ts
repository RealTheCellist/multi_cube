import { applyKilominxMove, type KilominxState, type KilominxTurn } from "./kilominxState";
import { FACE_VERTEX_INDICES, FACE_INDICES, FACE_NORMALS, type FaceIndex } from "./dodecaMath";

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
 * 2 * branching^(d/2) states instead of branching^d -- the same technique
 * this codebase's other from-scratch solvers already use (see
 * masterTetraminxSolver.ts). Returns null (not a thrown error) if nothing
 * is found within `maxHalfDepth`, so callers can retry with a different
 * (usually wider) projection instead of treating "too shallow" the same
 * as "genuinely unreachable".
 *
 * IMPORTANT lesson from this module's own history: `keyFn` must not
 * arbitrarily restrict the MOVE set, only the STATE comparison -- every
 * one of the 24 moves is always tried. An earlier version tried to also
 * restrict which faces this function turns (reasoning "only faces
 * touching face 0 can matter for solving face 0"), which is only true
 * when starting from solved; from an arbitrary scrambled state a target
 * piece can be sitting anywhere, so that restriction silently made some
 * scrambles unsolvable. Restricting only the deduplication key (not the
 * moves) is always safe.
 *
 * SECOND lesson: a `keyFn` that tracks MANY positions barely collapses
 * anything (few raw states share a wide projection), so a frontier can
 * grow close to the full, undeduplicated branching^depth instead of
 * staying small -- this is exactly what made a first version of
 * `solveRemaining` (see its own comment) unusable: it tried to track
 * "every position fixed so far" in a single ever-growing search, which
 * both timed out and once OOM-crashed the process. `maxFrontierSize`
 * bails out (returns null) the moment either frontier would grow past a
 * safe bound, instead of letting it run the process out of memory --
 * useful as a safety net, but the real fix was to stop needing wide keys
 * at all (see solveRemaining's own commutator/conjugation approach).
 */
interface Reached {
  state: KilominxState;
  path: KilominxTurn[];
}

/**
 * THIRD lesson (the one that actually matters for correctness): `keyFn`
 * must be a projection the move action FACTORS THROUGH -- i.e. applying
 * any move sequence to two states with the same key must always give two
 * states with the same key. Only then does "forward frontier and backward
 * frontier share a key" imply the joined path really works. Tracking
 * "which piece sits at position p" (keyFor) is NOT such a projection:
 * what a sequence brings INTO p depends on pieces at untracked positions.
 * An earlier version used exactly that key here and returned "solutions"
 * that, replayed, did not solve the first layer (confirmed on a concrete
 * scramble) -- and patching it with per-key buckets plus replay
 * verification blew the frontier up (1.5M entries at combined depth 11)
 * without ever finding a real meet. Tracking "where piece q is, and how
 * it's oriented" (pieceKeyFor) IS such a projection: applyKilominxMove
 * moves each piece as a function of its own position only, so a piece's
 * whole trajectory under a sequence is independent of every other piece.
 * With a sound key, one representative per key is enough again.
 */
function bidirectionalSearch(state: KilominxState, target: KilominxState, keyFn: (s: KilominxState) => string, maxHalfDepth: number, maxFrontierSize = 150_000): KilominxTurn[] | null {
  const targetKey = keyFn(target);
  let forward = new Map<string, Reached>([[keyFn(state), { state, path: [] }]]);
  let backward = new Map<string, Reached>([[targetKey, { state: target, path: [] }]]);

  const tryMeet = (): KilominxTurn[] | null => {
    for (const [key, f] of forward) {
      const b = backward.get(key);
      if (!b) continue;
      const joined = [...f.path, ...b.path];
      // Cheap guard against ever regressing to an unsound keyFn again.
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
            : // Backward step: to go from `child`'s state to `base`'s state
              // (one step closer to target), the FORWARD move is the
              // inverse, applied BEFORE the rest of `path`.
              [{ face, sign: (sign * -1) as 1 | -1 }, ...path];
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

/**
 * Single-direction forward BFS that stops as soon as `goal(state)` is
 * true, rather than searching for one specific target state -- used for
 * small "bring this one piece somewhere useful" searches where the exact
 * destination doesn't matter, only a property of it does.
 */
function forwardSearchUntil(state: KilominxState, goal: (s: KilominxState) => boolean, keyFn: (s: KilominxState) => string, maxDepth: number, maxFrontierSize = 50_000): KilominxTurn[] | null {
  if (goal(state)) return [];
  let frontier = new Map<string, { state: KilominxState; path: KilominxTurn[] }>([[keyFn(state), { state, path: [] }]]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = new Map<string, { state: KilominxState; path: KilominxTurn[] }>();
    for (const { state: base, path } of frontier.values()) {
      for (const face of FACE_INDICES) {
        for (const sign of [1, -1] as const) {
          const child = applyKilominxMove(base, face, sign);
          const childPath = [...path, { face, sign }];
          if (goal(child)) return childPath;
          const key = keyFn(child);
          if (next.has(key)) continue;
          if (next.size >= maxFrontierSize) return null;
          next.set(key, { state: child, path: childPath });
        }
      }
    }
    frontier = next;
    if (frontier.size === 0) return null;
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
 * a 2x2x2's) first layer. Piece ids equal home positions, so "the 5 face-0
 * pieces are all at home, oriented 0" is the same condition as "face 0's
 * 5 positions each hold their own piece" -- but only the former is a key
 * the search can safely dedupe on.
 */
const FIRST_LAYER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[0];
const firstLayerKey = pieceKeyFor(FIRST_LAYER_POSITIONS);

export function isFirstLayerSolved(state: KilominxState): boolean {
  return firstLayerKey(state) === firstLayerKey(SOLVED_STATE);
}

/**
 * Face 0's ANTIPODAL face (the one whose normal points most opposite to
 * face 0's own) and its 5 vertices -- computed geometrically, not
 * hand-picked, matching this codebase's own established rule (see
 * kilominxState.ts's own FACES_AT_VERTEX comment). This is the "last
 * layer" in the Layer-by-Layer sub-phase split below: with face 0
 * (already solved by Phase 1) as "top", face 10 -- confirmed the
 * antipodal face by dot product -- is "bottom", and the remaining 10
 * vertices, touching neither, are the "middle" band around the equator.
 */
const LAST_LAYER_FACE: FaceIndex = FACE_INDICES.reduce((best, f) => (FACE_NORMALS[f].dot(FACE_NORMALS[0]) < FACE_NORMALS[best].dot(FACE_NORMALS[0]) ? f : best), FACE_INDICES[1]);
const LAST_LAYER_POSITIONS: readonly number[] = FACE_VERTEX_INDICES[LAST_LAYER_FACE];
const MIDDLE_LAYER_POSITIONS: readonly number[] = Array.from({ length: 20 }, (_, i) => i).filter((p) => !FIRST_LAYER_POSITIONS.includes(p) && !LAST_LAYER_POSITIONS.includes(p));

// Empirically measured (see this module's own dev notes): with the sound
// pieceKeyFor projection, a 20-move scramble's first-layer solution can
// need a combined depth of 11, and the larger side's frontier at that
// depth can reach ~1.1M entries before the two sides meet (measured max
// across 30 scrambles: 1,120,373) -- so the cap needs real headroom above
// that, not the old 150k default (which was tuned around the BROKEN
// bucketed key and silently truncated valid searches here).
export function solveFirstLayer(state: KilominxState, maxHalfDepth = 11): KilominxTurn[] {
  if (isFirstLayerSolved(state)) return [];
  const solution = bidirectionalSearch(state, SOLVED_STATE, firstLayerKey, maxHalfDepth, 1_500_000);
  if (!solution) throw new Error(`kilominxSolver: first layer not solved within half-depth ${maxHalfDepth}`);
  return solution;
}

/**
 * Phase 2: solve the remaining 15 corners without disturbing face 0,
 * using real commutators/conjugation -- not a wider and wider tracked-
 * position search, which is what a first version of this function tried
 * and which both timed out and once OOM-crashed the process on anything
 * past the first few pieces (see bidirectionalSearch's own comment).
 *
 * The key group-theory fact this relies on: for a "commutator" sequence
 * C = A . B . A' . B' (A', B' = inverses), any position C does NOT move
 * is guaranteed untouched -- that's what makes a commutator a commutator.
 * Conjugating it, S . C . S', has EXACTLY the support S(support(C)):
 * wherever S sends C's own affected positions, nothing more, nothing
 * less, no matter what S does to everything else along the way (S' undoes
 * that perfectly). So the "setup" S never needs to be searched under a
 * "preserve everything already fixed" constraint -- it only needs to
 * park the ONE piece we care about at one of the commutator's own
 * template positions; correctness is verified by directly simulating the
 * full S . C . S' sequence afterward (cheap: an O(20) comparison, not a
 * search), and skipped rather than trusted if it happens to disturb a
 * fixed position or a template slot lands on another already-correct
 * piece.
 *
 * COMMUTATORS was found by brute-force trying short (<=2 move) A/B pairs
 * from solved and keeping [A,B] results that (a) leave face 0 solved and
 * (b) have small support -- see this module's own investigation history.
 * No support-3 (pure 3-cycle) pair turned up in that search; the ones
 * used here have support 4 (two 2-cycles-with-twist, verified by
 * replaying [A,B] from solved and inspecting exactly which positions
 * changed).
 */
interface Commutator {
  seq: KilominxTurn[];
  support: number[];
}

function makeCommutator(a: KilominxTurn[], b: KilominxTurn[]): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(SOLVED_STATE, seq);
  const support: number[] = [];
  for (let i = 0; i < 20; i++) if (result.perm[i] !== i || result.orient[i] !== 0) support.push(i);
  return { seq, support };
}

/**
 * A broad, COMPUTED library of commutators -- not a handful of hand-picked
 * examples. A first version used just 6 hand-picked ones and the greedy
 * solveRemaining loop below repeatedly got stuck partway through (verified:
 * it made real progress, then ran out of safe options with over half the
 * puzzle still unsolved) -- with so few distinct "support" sets to choose
 * from, there just weren't enough options for the greedy search to find a
 * safe, progress-making move at every step. A second version raised the
 * support cap to 4 -- still not enough (see solveRemaining's own dev
 * notes: fails fast, at every seed, with "no safe commutator application
 * found at all").
 *
 * This version widens the search itself, now that findSafeApplication's
 * own setup search runs against `pieceKeyFor([target])` -- a tiny (60-
 * state) key -- rather than `keyFor(C.support)`, whose key space grows
 * with support size and was the reason support was capped at 4 rather
 * than 6 in the first place (see git history / dev notes for that
 * measurement). With the setup search decoupled from a commutator's own
 * support size, there's no longer a reason to keep support capped so low:
 * A is now allowed 1-2 moves, B 1-3 moves (excluding immediately-repeated
 * faces within each, which can never be useful -- see makeCommutator's
 * own history), and support is allowed up to 6.
 *
 * Every (A, B) pair explored this way is enumerated brute-force, kept
 * only if it preserves face 0 and has support in [1, 6], and deduped to
 * ONE commutator per distinct support SET (positions), since many
 * different (A, B) land on the same support and only the set of affected
 * positions matters for how useful an entry is here. Collected in
 * separate buckets BY support size (capped per bucket) so the smallest,
 * most surgical commutators -- true 3-cycles if any exist, which the
 * earlier support<=4 search never found -- aren't crowded out by the far
 * more numerous support-5/6 results that turn up first in enumeration
 * order. Computed once at module load, same spirit as kilominxState.ts's
 * own MOVE_TABLE.
 */
const COMMUTATORS: Commutator[] = (() => {
  const singles: KilominxTurn[] = [];
  for (const face of FACE_INDICES) for (const sign of [1, -1] as const) singles.push({ face, sign });

  // A: length 1-2. B: length 1-3. Both built the same way: start from
  // singles, then grow one move at a time (never repeating the previous
  // move's face), collecting every length along the way.
  let As: KilominxTurn[][] = singles.map((t) => [t]);
  const As2 = As.flatMap((seq) => singles.filter((t) => t.face !== seq[0].face).map((t) => [...seq, t]));
  As = [...As, ...As2];

  let Bs: KilominxTurn[][] = singles.map((t) => [t]);
  const Bs2 = Bs.flatMap((seq) => singles.filter((t) => t.face !== seq[0].face).map((t) => [...seq, t]));
  const Bs3 = Bs2.flatMap((seq) => singles.filter((t) => t.face !== seq[seq.length - 1].face).map((t) => [...seq, t]));
  Bs = [...Bs, ...Bs2, ...Bs3];

  const MAX_SUPPORT = 6;
  const PER_SIZE_CAP = 80;
  const buckets = new Map<number, Commutator[]>();
  for (let n = 1; n <= MAX_SUPPORT; n++) buckets.set(n, []);
  const seen = new Set<string>();

  // The full (A, B) space is ~7M pairs -- fine per-pair, but a true
  // 3-cycle (support 3) may not exist at this A/B length at all (an
  // earlier, narrower search never found one), so a bucket-fill exit
  // alone could mean scanning the whole space just to confirm that.
  // This budget bounds module-load time regardless of what turns up.
  const MAX_PAIRS_EXAMINED = 1_500_000;
  let examined = 0;

  outer: for (const A of As) {
    for (const B of Bs) {
      if (examined++ >= MAX_PAIRS_EXAMINED) break outer;
      const c = makeCommutator(A, B);
      if (c.support.length === 0 || c.support.length > MAX_SUPPORT) continue;
      if (c.support.some((p) => FIRST_LAYER_POSITIONS.includes(p))) continue;
      const key = c.support.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(c.support.length)!;
      if (bucket.length >= PER_SIZE_CAP) continue;
      bucket.push(c);
      if ([...buckets.values()].every((b) => b.length >= PER_SIZE_CAP)) break outer;
    }
  }
  // Smallest support first: a solveRemaining round trying commutators in
  // this order finds the most surgical (least likely to need a lucky
  // setup, cheapest to verify) option before falling back to wider ones.
  const out: Commutator[] = [];
  for (let n = 1; n <= MAX_SUPPORT; n++) out.push(...buckets.get(n)!);
  return out;
})();

/**
 * A dedicated hunt for PURE-TWIST commutators -- identity permutation,
 * nonzero orientation only -- the same class of algorithm a 2x2x2 solver
 * needs for its "OLL parity" (2 corners twisted, nothing moved). Found
 * the hard way that ONE COMMUTATORS-only library isn't enough for this:
 * solveRemaining's own dev history shows every stuck endgame state was
 * exactly this pattern (confirmed by inspection: e.g. positions {9, 12}
 * both had perm[p] === p but nonzero orient) -- and no support-1 or
 * support-2 entry ever turned up in COMMUTATORS's own 1.5M-pair (A, B)
 * search, because a single commutator [A, B] generically produces a
 * PERMUTATION cycle; getting pure orientation change with nothing
 * permuted needs the permutation parts of two commutators to cancel on
 * their overlap while their orientation effects don't -- i.e. a
 * commutator OF commutators, [C1, C2] = C1.C2.C1'.C2', built from two
 * small-support library entries that partially overlap. Cheap to search
 * (only the small-support library, ~160 entries, squared) since it reuses
 * COMMUTATORS rather than re-deriving from raw moves.
 */
const TWIST_COMMUTATORS: Commutator[] = (() => {
  const small = COMMUTATORS.filter((c) => c.support.length <= 4);
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
      // Dedup by (support, orientation) together -- unlike COMMUTATORS,
      // two entries can share a support set but differ in which
      // orientation delta they apply (e.g. +1/+2 vs +2/+1), and both are
      // independently useful for matching whatever twist actually needs
      // fixing.
      const key = support.map((p) => `${p}:${result.orient[p]}`).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(support.length)!;
      if (bucket.length >= PER_SIZE_CAP) continue;
      bucket.push({ seq, support });
    }
  }
  const out: Commutator[] = [];
  for (let n = 2; n <= MAX_SUPPORT; n++) out.push(...buckets.get(n)!);
  return out;
})();

// Twist commutators first: they're the smallest-support, most surgical
// entries (support 2-4, pure orientation change) -- exactly what an
// endgame state with few positions left tends to need (see
// TWIST_COMMUTATORS's own dev notes), so trying them before the wider
// permutation-cycling COMMUTATORS entries finds a clean finish sooner
// when one's available.
const ALL_COMMUTATORS: Commutator[] = [...TWIST_COMMUTATORS, ...COMMUTATORS];

function countWrong(state: KilominxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.perm[p] !== p || state.orient[p] !== 0) n++;
  return n;
}

export function isKilominxFullySolved(state: KilominxState): boolean {
  return state.perm.every((p, i) => p === i) && state.orient.every((o) => o === 0);
}

// The setup search only needs to know where the ONE piece being routed
// currently is (and its orientation): that is a sound projection for the
// goal "piece `target` sits at `anchor`" (see bidirectionalSearch's THIRD
// lesson) and has just 60 possible keys, so the BFS is tiny and complete.
// Earlier versions keyed on the CONTENTS of the anchor position (1 value)
// and then on the contents of every support position -- both are
// position-projections the move action does not factor through, which is
// why the first "got stuck constantly" and the second was slow.
function findSafeApplication(current: KilominxState, fixed: ReadonlySet<number>, target: number, wrongBefore: number, remaining: readonly number[], requireImprovement: boolean): { state: KilominxState; seq: KilominxTurn[] } | null {
  const setupKey = pieceKeyFor([target]);
  for (const C of ALL_COMMUTATORS) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.perm[anchor] === target, setupKey, 7);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);

      const fixedPreserved = [...fixed].every((p) => resultState.perm[p] === p && resultState.orient[p] === 0);
      if (!fixedPreserved) continue;
      const wrongAfter = countWrong(resultState, remaining);
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

/** Like pieceKeyFor, but drops orientation -- only WHERE each piece sits, not how it's twisted. Still sound (see pieceKeyFor's own reasoning: applyKilominxMove moves a piece as a function of its own position only), and coarser, which is exactly what's wanted here: the setup search below doesn't care what orientation it arrives with, only that it parks each piece at its assigned slot -- correctness of the final result is checked afterward by replaying the whole S.C.S' sequence anyway. */
function positionOnlyKeyFor(pieces: readonly number[]): (s: KilominxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: KilominxState) => {
    const loc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) loc[s.perm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((c) => [first, ...c]), ...combinations(rest, size)];
}

/**
 * Builds a joint setup-search table for exactly `pieces` (order doesn't
 * matter -- the returned lookup is by SORTED-piece-id positions): for
 * every reachable POSITION-only arrangement of just those pieces (see
 * positionOnlyKeyFor), a small BUCKET of distinct paths that reach it.
 * Used by findFinishingApplication to look up, in O(1), whether some
 * commutator's desired arrangement is reachable, instead of a fresh BFS
 * per candidate (see that function's own dev notes on why -- a first
 * version ran one search per (commutator, assignment) pair and was too
 * slow to finish a 10-seed test in under 280s).
 *
 * MUST be a bucket, not a single shortest path: position-only is a
 * coarser key than the piece's full state, so several genuinely different
 * paths can reach the SAME position arrangement while leaving the pieces
 * at DIFFERENT orientations -- and it's the orientation that decides
 * whether a given commutator ends up leaving everything solved or not
 * (confirmed empirically: an earlier single-path version found 267
 * position-matching setups for a real stuck case and every one of them
 * failed the final orientation check, because only one arbitrary path per
 * arrangement was ever tried). Keeping a few alternatives per key isn't a
 * correctness fix (a bad match is still caught by the caller's replay
 * verification either way) -- it's a completeness one, giving the search
 * more than one orientation-outcome to actually try.
 */
function buildJointReachTable(current: KilominxState, pieces: readonly number[]): Map<string, KilominxTurn[][]> {
  const posKeyFn = positionOnlyKeyFor(pieces);
  const MAX_DEPTH = 10;
  const MAX_REACHABLE = 300_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, KilominxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: KilominxState; path: KilominxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: KilominxState; path: KilominxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const face of FACE_INDICES) {
        for (const sign of [1, -1] as const) {
          const child = applyKilominxMove(base, face, sign);
          const key = posKeyFn(child);
          const childPath = [...path, { face, sign }];
          let bucket = reachable.get(key);
          if (bucket) {
            // Only the FIRST time a key is reached does its bucket also
            // become part of the next frontier -- alternate (later,
            // equal-or-longer) paths to an already-seen arrangement are
            // recorded for orientation diversity but not re-expanded,
            // same as ordinary BFS dedup.
            if (bucket.length < MAX_BUCKET) {
              bucket.push(childPath);
              totalPaths++;
            }
            continue;
          }
          if (totalPaths >= MAX_REACHABLE) break;
          bucket = [childPath];
          reachable.set(key, bucket);
          totalPaths++;
          next.push({ state: child, path: childPath });
        }
      }
    }
    frontier = next;
  }
  return reachable;
}

/** Tries every commutator whose support size exactly matches `pieces.length` against a single joint reach table for exactly those pieces. Returns a result whose effect on `pieces`' HOME positions is completely clean (see caller), but says nothing about the rest of the puzzle beyond `fixed` preservation -- checked by the caller as appropriate. */
function tryExactFinish(current: KilominxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: KilominxState; seq: KilominxTurn[] } | null {
  const sortedPieces = [...pieces].sort((a, b) => a - b);
  const reachable = buildJointReachTable(current, pieces);
  for (const C of ALL_COMMUTATORS) {
    if (C.support.length !== pieces.length) continue;
    for (const assignment of permutations(pieces)) {
      const pieceToPos = new Map<number, number>();
      assignment.forEach((piece, i) => pieceToPos.set(piece, C.support[i]));
      const key = sortedPieces.map((piece) => pieceToPos.get(piece)).join(",");
      const bucket = reachable.get(key);
      if (!bucket) continue;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);

        const fixedPreserved = [...fixed].every((p) => resultState.perm[p] === p && resultState.orient[p] === 0);
        if (!fixedPreserved) continue;
        // Every one of `pieces`' HOME positions must now be solved -- since
        // pieces are identified by home position, this is exactly "did this
        // fix every targeted piece", regardless of where other, untargeted
        // wrong pieces ended up.
        if (pieces.some((piece) => resultState.perm[piece] !== piece || resultState.orient[piece] !== 0)) continue;

        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

/**
 * A dedicated ENDGAME finisher, distinct from findSafeApplication's greedy
 * single-piece-at-a-time approach. Diagnosed via this module's own dev
 * history: once only a handful of positions remain wrong, they're
 * consistently a single commutator's exact pattern already sitting in the
 * library (a 3-cycle+twist, a pure 2-twist, ...) -- but findSafeApplication
 * only ever anchors ONE of that commutator's support positions to a
 * specific piece via its setup search, leaving where the OTHER support
 * positions land up to chance. That's fine early on (when most of the
 * puzzle is still wrong, some other support position landing on "also
 * wrong" is likely) but it's exactly why the greedy approach reliably
 * stalls in the last few positions: the odds of a lucky single-anchor
 * setup also parking every other support slot on a currently-wrong
 * position collapse as the wrong set shrinks (confirmed empirically: every
 * observed stall was a pure library-shaped pattern, e.g. wrong positions
 * [6,13,17] forming exactly a 3-cycle+twist -- COMMUTATORS has 80 support-3
 * entries, but greedy couldn't use any of them here).
 *
 * Only tries the FULL wrong set (a single clean match) -- cheap (one joint
 * BFS) and this is the common case, so it's safe to try every round while
 * few positions are wrong. See findCompoundFinishingApplication for the
 * (much pricier) subset-based fallback for when the wrong set turns out
 * NOT to be one commutator's exact pattern.
 */
function findFinishingApplication(current: KilominxState, fixed: ReadonlySet<number>, wrongPositions: readonly number[]): { state: KilominxState; seq: KilominxTurn[] } | null {
  const wrongPieces = wrongPositions.map((p) => current.perm[p]);
  return tryExactFinish(current, fixed, wrongPieces);
}

/**
 * The expensive fallback for a COMPOUND residual -- e.g. an independent
 * 3-cycle plus a separate lone twist, two unrelated library-shaped
 * patterns rather than one (confirmed empirically: wrong=[6,9,13,17]
 * turned out to be a 3-cycle on {6,9,13} plus an unrelated twist at 17).
 * Tries every SUBSET of the wrong pieces, largest first, looking for a
 * clean fix of just that subset; the rest stay wrong and get picked up by
 * a later round.
 *
 * A first version ran this (all subsets) on EVERY round whenever few
 * positions were wrong, same as the cheap exact-match finisher above --
 * far too expensive (a single 10-seed test didn't finish in 590s), since
 * the subset count alone is up to 25 for a 5-wrong state, each running
 * its own bounded BFS. This is instead reserved for solveRemaining's own
 * genuine last resort, tried once right before it would otherwise give
 * up -- rare enough (only truly stuck states reach it) that the cost is
 * acceptable there.
 */
function findCompoundFinishingApplication(current: KilominxState, fixed: ReadonlySet<number>, wrongPositions: readonly number[]): { state: KilominxState; seq: KilominxTurn[] } | null {
  const wrongPieces = wrongPositions.map((p) => current.perm[p]);
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinish(current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

/**
 * The core greedy+commutator loop, generalized over WHICH positions need
 * solving and WHICH are already required to stay solved -- originally
 * hardcoded to "all 15 non-face-0 positions, face-0 fixed" in one shot.
 * Factored out for the Layer-by-Layer sub-phase split (see solveRemaining):
 * solving the 10 middle-layer positions with only the top layer fixed,
 * then the 5 bottom-layer positions with top+middle fixed, is the exact
 * same algorithm run twice over smaller position sets -- not a different
 * one.
 */
function solveTargetPositions(state: KilominxState, targetPositions: readonly number[], initialFixed: ReadonlySet<number>, maxAttempts = 400): KilominxTurn[] {
  let current = state;
  const solution: KilominxTurn[] = [];
  const fixed = new Set(initialFixed);

  let attempts = 0;
  // How many rounds in a row made NO strict progress (a "lateral" move,
  // safe but not improving, accepted only because nothing better was
  // found) -- a pure greedy "only ever accept strict progress" search
  // repeatedly got stuck well before the puzzle was solved (see this
  // function's own history: it made real progress, then ran out of safe
  // strictly-improving options with over half the remaining pieces still
  // wrong). Allowing a BOUNDED number of lateral moves lets the search
  // reposition pieces into a more useful arrangement before continuing,
  // the same way a human solve sometimes needs a "setup" move that
  // doesn't look like progress by itself.
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;

  while (targetPositions.some((p) => current.perm[p] !== p || current.orient[p] !== 0)) {
    attempts++;
    if (attempts > maxAttempts) throw new Error(`kilominxSolver: solveTargetPositions exceeded ${maxAttempts} attempts`);

    const wrongPositions = targetPositions.filter((p) => current.perm[p] !== p || current.orient[p] !== 0);
    const wrongBefore = wrongPositions.length;

    // Few positions left: try the dedicated finisher first (see its own
    // dev notes) -- it directly targets a full, clean solve of exactly
    // what's still wrong, rather than the greedy single-piece approach
    // below, which is what actually gets stuck this late. The COMPOUND
    // (subset) search is only a LAST RESORT (after lateral moves are
    // exhausted), not tried every round -- an earlier version tried it
    // every round and that was confirmed too expensive (a single 3-seed
    // check didn't finish in 590s) without actually improving the
    // success rate (a later check found the SAME seeds still failing,
    // just slower -- trying it earlier doesn't help once the wrong set is
    // genuinely atomic, e.g. a real 5-cycle no subset of which is
    // independently solvable).
    let found = wrongBefore >= 2 && wrongBefore <= 6 ? findFinishingApplication(current, fixed, wrongPositions) : null;
    if (found) {
      consecutiveLateral = 0;
    } else {
      const target = wrongPositions[0];
      found = findSafeApplication(current, fixed, target, wrongBefore, targetPositions, true);
      if (found) {
        consecutiveLateral = 0;
      } else {
        if (consecutiveLateral >= maxConsecutiveLateral) {
          found = wrongBefore >= 2 && wrongBefore <= 5 ? findCompoundFinishingApplication(current, fixed, wrongPositions) : null;
          if (!found) {
            throw new Error(`kilominxSolver: solveTargetPositions stuck (${targetPositions.filter((p) => current.perm[p] !== p || current.orient[p] !== 0).length} positions still wrong, ${maxConsecutiveLateral} lateral moves in a row without progress)`);
          }
          consecutiveLateral = 0;
        } else {
          found = findSafeApplication(current, fixed, target, wrongBefore, targetPositions, false);
          if (!found) {
            throw new Error(`kilominxSolver: solveTargetPositions stuck (${targetPositions.filter((p) => current.perm[p] !== p || current.orient[p] !== 0).length} positions still wrong, no safe commutator application found at all)`);
          }
          consecutiveLateral++;
        }
      }
    }

    current = found.state;
    solution.push(...found.seq);

    // Refresh which of `targetPositions` are now solved, so the next
    // round's `wrongBefore` and the outer while-condition both see current
    // progress.
    for (const p of targetPositions) if (current.perm[p] === p && current.orient[p] === 0) fixed.add(p);
  }
  return solution;
}

/**
 * Phase 2, Layer-by-Layer: solve the 10 middle-layer positions (face 0
 * fixed), then the 5 bottom-layer positions (face 0 AND middle fixed) --
 * not one 15-position pass. A first version solved all 15 at once and
 * measured 27/30 (90%) full solves; the 3 known failures were all
 * residuals of exactly 5 wrong positions that no single library
 * commutator (even with an exhaustively larger, 300-per-size library, and
 * both a commutator's own action and its inverse) could resolve --
 * meaning the issue isn't library size, it's that greedy single-piece
 * progress across all 15 positions at once can leave behind an atomic
 * residual (see solveTargetPositions's own comment on this). Restricting
 * each pass's own greedy search to a smaller position set doesn't change
 * what residuals are POSSIBLE in principle, but does change what the
 * greedy process actually LEAVES behind in practice, since it's a
 * different, smaller search space with different progress dynamics at
 * each stage -- worth doing given the 15-at-once version's own ceiling.
 */
export function solveRemaining(state: KilominxState): KilominxTurn[] {
  const middleSolution = solveTargetPositions(state, MIDDLE_LAYER_POSITIONS, new Set(FIRST_LAYER_POSITIONS));
  const afterMiddle = applySeq(state, middleSolution);
  const bottomFixed = new Set([...FIRST_LAYER_POSITIONS, ...MIDDLE_LAYER_POSITIONS]);
  const bottomSolution = solveTargetPositions(afterMiddle, LAST_LAYER_POSITIONS, bottomFixed);
  return [...middleSolution, ...bottomSolution];
}

/** Full solve: first layer, then everything else. */
export function solveKilominx(state: KilominxState): KilominxTurn[] {
  const layerSolution = solveFirstLayer(state);
  const s = applySeq(state, layerSolution);
  const restSolution = solveRemaining(s);
  return [...layerSolution, ...restSolution];
}
