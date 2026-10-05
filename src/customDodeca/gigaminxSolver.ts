import { applyGigaminxMove, solvedGigaminxState, type GigaminxState, type GigaminxDepth, type GigaminxTurn } from "./gigaminxState";
import { FACE_INDICES } from "./dodecaMath";

/**
 * GIGAMINX_SOLVER_V1 (reconstructed): Phase-based reduction solver, same
 * architecture as kilominxSolver.ts's own commutator-library +
 * greedy-safe-application + dedicated-finisher approach, generalized for
 * Gigaminx's 96-wide move set (12 faces x 4 depths x 2 signs, not 24) and
 * its larger piece orbits.
 *
 * Phases:
 *   Phase 1: 20 outer CORNERS (position + orientation).
 *   Phase 2: 60 WINGS (position + orientation), corners fixed.
 *   Phase 3: 60 INNER CORNERS (position only, no orientation), corners+wings fixed.
 *
 * NOTE on scope (reconstruction after uncommitted work was lost to a
 * container reset -- see repo history): this rebuild prioritizes
 * correctness over the original's accumulated performance tuning (expanded
 * libraries, candidate-ordering heuristics, hybrid exact-finish policies
 * from many later Sprints). It is NOT expected to hit the original's
 * ~3-second production runtime target out of the box.
 */

export const ALL_MOVES: readonly GigaminxTurn[] = (() => {
  const out: GigaminxTurn[] = [];
  for (const face of FACE_INDICES) for (const depth of [1, 2, 3, 4] as GigaminxDepth[]) for (const sign of [1, -1] as const) out.push({ face, sign, depth });
  return out;
})();

function applySeq(state: GigaminxState, seq: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of seq) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}
function invertSeq(seq: readonly GigaminxTurn[]): GigaminxTurn[] {
  return [...seq].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1, depth: t.depth }));
}

/** Single-direction forward BFS that stops as soon as `goal(state)` is true. */
function forwardSearchUntil(state: GigaminxState, goal: (s: GigaminxState) => boolean, keyFn: (s: GigaminxState) => string, maxDepth: number, maxFrontierSize = 300_000): GigaminxTurn[] | null {
  if (goal(state)) return [];
  let frontier = new Map<string, { state: GigaminxState; path: GigaminxTurn[] }>([[keyFn(state), { state, path: [] }]]);
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = new Map<string, { state: GigaminxState; path: GigaminxTurn[] }>();
    for (const { state: base, path } of frontier.values()) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const childPath = [...path, t];
        if (goal(child)) return childPath;
        const key = keyFn(child);
        if (next.has(key)) continue;
        if (next.size >= maxFrontierSize) return null;
        next.set(key, { state: child, path: childPath });
      }
    }
    frontier = next;
    if (frontier.size === 0) return null;
  }
  return null;
}

function setKeyOf(positions: readonly number[]): string {
  return [...positions].sort((a, b) => a - b).join(",");
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...combinations(rest, size - 1).map((c) => [first, ...c]), ...combinations(rest, size)];
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

export interface PhaseTrace {
  name: string;
  rounds: number;
  movesEmitted: number;
  succeeded: boolean;
  error?: string;
}

// ===================== Corner orbit (Phase 1) =====================

function cornerKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) loc[s.cornerPerm[pos]] = pos;
    return sorted.map((piece) => `${loc[piece]}:${s.cornerOrient[loc[piece]]}`).join(",");
  };
}
function positionOnlyCornerKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(20);
    for (let pos = 0; pos < 20; pos++) loc[s.cornerPerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}
function countWrongCorners(state: GigaminxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.cornerPerm[p] !== p || state.cornerOrient[p] !== 0) n++;
  return n;
}
export function areCornersSolved(state: GigaminxState): boolean {
  return state.cornerPerm.every((p, i) => p === i) && state.cornerOrient.every((o) => o === 0);
}

interface Commutator {
  seq: GigaminxTurn[];
  support: number[];
}

function makeCornerCommutator(a: GigaminxTurn[], b: GigaminxTurn[], solved: GigaminxState): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(solved, seq);
  const support: number[] = [];
  for (let i = 0; i < 20; i++) if (result.cornerPerm[i] !== i || result.cornerOrient[i] !== 0) support.push(i);
  return { seq, support };
}

/** A/B pair sequences up to the given lengths, over the full 96-move grammar, never repeating the immediately-previous move's face. */
function admissibleSeqs(maxLen: number): GigaminxTurn[][] {
  let seqs: GigaminxTurn[][] = ALL_MOVES.map((t) => [t]);
  let out: GigaminxTurn[][] = seqs;
  for (let len = 2; len <= maxLen; len++) {
    const next = seqs.flatMap((seq) => ALL_MOVES.filter((t) => t.face !== seq[seq.length - 1].face).map((t) => [...seq, t]));
    out = out.concat(next);
    seqs = next;
  }
  return out;
}

function buildCommutatorLibrary(
  solved: GigaminxState,
  As: GigaminxTurn[][],
  Bs: GigaminxTurn[][],
  maxSupport: number,
  // Per-size cap: smaller support sizes need a MUCH higher cap than larger
  // ones. A large-support commutator (8-16) almost always collides with an
  // already-fixed position once few pieces remain wrong (its setup search
  // only pins ONE target position, leaving the other 7-15 support slots to
  // chance -- see findSafeWingApplication's own dev notes), so it's only
  // useful for bulk early progress; a small handful suffices. Small-support
  // commutators (3,5,6) are what the ENDGAME's joint/exact-finish search
  // actually needs in quantity, to have enough distinct template shapes to
  // match an arbitrary small residual.
  perSizeCap: (size: number) => number,
  maxPairsExamined: number,
  isPure: (result: GigaminxState) => boolean,
  support: (result: GigaminxState) => number[],
  // Which support sizes actually occur for this orbit's commutator shape --
  // some sizes are structurally impossible (e.g. a lone 2-fold piece can't
  // be twisted alone without violating the move group's own parity) and
  // would otherwise force scanning the ENTIRE maxPairsExamined budget every
  // time, since "every bucket full" could never be satisfied. Defaults to
  // every size 1..maxSupport (safe/original behavior) -- pass the
  // empirically observed subset for orbits where some sizes never occur.
  requiredSizes: readonly number[] = Array.from({ length: maxSupport }, (_, i) => i + 1),
): Commutator[] {
  const buckets = new Map<number, Commutator[]>();
  for (let n = 1; n <= maxSupport; n++) buckets.set(n, []);
  const seen = new Set<string>();
  let examined = 0;

  outer: for (const A of As) {
    for (const B of Bs) {
      if (examined++ >= maxPairsExamined) break outer;
      const seq = [...A, ...B, ...invertSeq(A), ...invertSeq(B)];
      const result = applySeq(solved, seq);
      if (!isPure(result)) continue;
      const sup = support(result);
      if (sup.length === 0 || sup.length > maxSupport) continue;
      const key = sup.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(sup.length)!;
      const cap = perSizeCap(sup.length);
      if (bucket.length >= cap) continue;
      bucket.push({ seq, support: sup });
      if (requiredSizes.every((n) => buckets.get(n)!.length >= perSizeCap(n))) break outer;
    }
  }
  const out: Commutator[] = [];
  for (let n = 1; n <= maxSupport; n++) out.push(...buckets.get(n)!);
  return out;
}

let cornerCommutatorsCache: Commutator[] | null = null;
function cornerCommutators(): Commutator[] {
  if (cornerCommutatorsCache) return cornerCommutatorsCache;
  const solved = solvedGigaminxState();
  const As = admissibleSeqs(2);
  const Bs = admissibleSeqs(3);
  cornerCommutatorsCache = buildCommutatorLibrary(
    solved,
    As,
    Bs,
    6,
    () => 200,
    20_000_000,
    () => true,
    (result) => {
      const sup: number[] = [];
      for (let i = 0; i < 20; i++) if (result.cornerPerm[i] !== i || result.cornerOrient[i] !== 0) sup.push(i);
      return sup;
    },
  );
  return cornerCommutatorsCache;
}

interface JointReachTable {
  reachable: Map<string, GigaminxTurn[][]>;
  setIndex: Map<string, string[]>;
}

function buildJointCornerReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = positionOnlyCornerKeyFor(pieces);
  const MAX_DEPTH = 8;
  const MAX_REACHABLE = 5_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        let bucket = reachable.get(key);
        if (bucket) {
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
    frontier = next;
  }
  const setIndex = new Map<string, string[]>();
  for (const key of reachable.keys()) {
    const positions = key.split(",").map(Number);
    const sk = setKeyOf(positions);
    if (!setIndex.has(sk)) setIndex.set(sk, []);
    setIndex.get(sk)!.push(key);
  }
  return { reachable, setIndex };
}

function tryExactFinishCorners(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = buildJointCornerReachTable(current, pieces);
  for (const C of matchingEntries) {
    const sk = setKeyOf(C.support);
    const matchingKeys = setIndex.get(sk);
    if (!matchingKeys) continue;
    for (const key of matchingKeys) {
      const bucket = reachable.get(key)!;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);
        const fixedPreserved = [...fixed].every((p) => resultState.cornerPerm[p] === p && resultState.cornerOrient[p] === 0);
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => resultState.cornerPerm[piece] !== piece || resultState.cornerOrient[piece] !== 0)) continue;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

function tryCompoundFinishCorners(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishCorners(commutators, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

function findSafeCornerApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongBefore: number, remaining: readonly number[], requireImprovement: boolean): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = cornerKeyFor([target]);
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.cornerPerm[anchor] === target, setupKey, 7);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);
      const fixedPreserved = [...fixed].every((p) => resultState.cornerPerm[p] === p && resultState.cornerOrient[p] === 0);
      if (!fixedPreserved) continue;
      const wrongAfter = countWrongCorners(resultState, remaining);
      if (requireImprovement ? wrongAfter >= wrongBefore : wrongAfter > wrongBefore) continue;
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveCorners(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  const commutators = cornerCommutators();
  const targetPositions = Array.from({ length: 20 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;

  try {
    while (targetPositions.some((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveCorners exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 6) {
        found = tryExactFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
      } else {
        const target = wrongPositions[0];
        found = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, true);
        if (found) {
          consecutiveLateral = 0;
        } else if (consecutiveLateral >= maxConsecutiveLateral) {
          found = wrongBefore >= 2 && wrongBefore <= 5 ? tryCompoundFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p])) : null;
          if (!found) throw new Error(`solveCorners stuck (${wrongBefore} corners still wrong, ${maxConsecutiveLateral} lateral moves without progress)`);
          consecutiveLateral = 0;
        } else {
          found = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, false);
          if (!found) throw new Error(`solveCorners stuck (${wrongBefore} corners still wrong, no safe application found)`);
          consecutiveLateral++;
        }
      }

      current = found.state;
      solution.push(...found.seq);
      for (const p of targetPositions) if (current.cornerPerm[p] === p && current.cornerOrient[p] === 0) fixed.add(p);
    }
    return { moves: solution, trace: { name: "corners", rounds: attempts, movesEmitted: solution.length, succeeded: true } };
  } catch (err) {
    return { moves: solution, trace: { name: "corners", rounds: attempts, movesEmitted: solution.length, succeeded: false, error: String(err) } };
  }
}

// ===================== Wing orbit (Phase 2, corners fixed) =====================

function wingKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(60);
    for (let pos = 0; pos < 60; pos++) loc[s.wingPerm[pos]] = pos;
    return sorted.map((piece) => `${loc[piece]}:${s.wingOrient[loc[piece]]}`).join(",");
  };
}
function positionOnlyWingKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(60);
    for (let pos = 0; pos < 60; pos++) loc[s.wingPerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}
function countWrongWings(state: GigaminxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.wingPerm[p] !== p || state.wingOrient[p] !== 0) n++;
  return n;
}
export function areWingsSolved(state: GigaminxState): boolean {
  return state.wingPerm.every((p, i) => p === i) && state.wingOrient.every((o) => o === 0);
}

let wingCommutatorsCache: Commutator[] | null = null;
function wingCommutators(): Commutator[] {
  if (wingCommutatorsCache) return wingCommutatorsCache;
  const diskCachePath = process.env.GIGA_WING_LIB_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    wingCommutatorsCache = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[wingCommutators] loaded from disk cache count=${wingCommutatorsCache!.length}\n`);
    return wingCommutatorsCache!;
  }
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[wingCommutators] build starting\n`);
  const tLib0 = Date.now();
  const solved = solvedGigaminxState();
  const As = admissibleSeqs(2);
  const Bs = admissibleSeqs(3);
  wingCommutatorsCache = buildCommutatorLibrary(
    solved,
    As,
    Bs,
    16,
    (size) => (size <= 6 ? 200 : 80),
    30_000_000,
    (result) => areCornersSolved(result),
    (result) => {
      const sup: number[] = [];
      for (let i = 0; i < 60; i++) if (result.wingPerm[i] !== i || result.wingOrient[i] !== 0) sup.push(i);
      return sup;
    },
    // Empirically observed (see dev probe): corner-pure wing commutators
    // from this A/B grammar only ever land on support sizes 3,5,6,8,9,10,
    // 12,13,14,16 -- sizes 1,2,4,7,11,15 never occur in this construction.
    [3, 5, 6, 8, 9, 10, 12, 13, 14, 16],
  );
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[wingCommutators] build done count=${wingCommutatorsCache.length} elapsedMs=${Date.now() - tLib0}\n`);
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(wingCommutatorsCache));
  return wingCommutatorsCache;
}

function buildJointWingReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = positionOnlyWingKeyFor(pieces);
  // Wider than the corner orbit's own table: wing commutators from this
  // grammar naturally land on larger support (up to 16, see wingCommutators'
  // own dev notes), so exact/compound-finish needs a correspondingly richer
  // joint-position search to find a setup matching those bigger templates --
  // matching kilominxSolver.ts's own proven endgame-finishing table size.
  const MAX_DEPTH = 10;
  const MAX_REACHABLE = 300_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        let bucket = reachable.get(key);
        if (bucket) {
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
    frontier = next;
  }
  const setIndex = new Map<string, string[]>();
  for (const key of reachable.keys()) {
    const positions = key.split(",").map(Number);
    const sk = setKeyOf(positions);
    if (!setIndex.has(sk)) setIndex.set(sk, []);
    setIndex.get(sk)!.push(key);
  }
  return { reachable, setIndex };
}

function wingStateSignature(state: GigaminxState): string {
  return `${state.wingPerm.join(",")}|${state.wingOrient.join(",")}`;
}

function tryExactFinishWings(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = buildJointWingReachTable(current, pieces);
  for (const C of matchingEntries) {
    const sk = setKeyOf(C.support);
    const matchingKeys = setIndex.get(sk);
    if (!matchingKeys) continue;
    for (const key of matchingKeys) {
      const bucket = reachable.get(key)!;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);
        const fixedPreserved = [...fixed].every((p) => resultState.wingPerm[p] === p && resultState.wingOrient[p] === 0);
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => resultState.wingPerm[piece] !== piece || resultState.wingOrient[piece] !== 0)) continue;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

function tryCompoundFinishWings(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishWings(commutators, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

/** `wrongAfterThreshold` is the max acceptable wrongAfter -- callers pass wrongBefore-1 for strict improvement, wrongBefore for lateral, wrongBefore+step for a regression-ladder rung. */
/**
 * `enforceFixed=true` (strict/lateral tiers) rejects any move that disturbs an
 * already-solved piece -- but once wrongBefore drops below the smallest usable
 * commutator support, EVERY commutator's support necessarily overlaps at least
 * one already-fixed piece (there just aren't enough wrong slots left to host
 * the whole support), so that gate becomes unsatisfiable by construction, not
 * by bad luck. The regression-ladder tier passes `enforceFixed=false` to allow
 * exactly that -- temporarily re-breaking a fixed piece -- relying solely on
 * the wrongAfterThreshold (computed over ALL positions, so it already counts
 * any such collateral damage) to bound how much damage is acceptable.
 */
function findSafeWingApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = wingKeyFor([target]);
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.wingPerm[anchor] === target, setupKey, 7, 100_000);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.wingPerm[p] === p && resultState.wingOrient[p] === 0);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongWings(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      // Without enforceFixed, strict/lateral/regression can otherwise rediscover
      // the exact same resultState every time the same (current, target,
      // threshold) recurs -- since the search is fully deterministic, that
      // produces a stable 2-(or N-)cycle that never converges. Skipping any
      // candidate that returns to an already-visited state forces a genuinely
      // new state each round instead.
      if (visited?.has(wingStateSignature(resultState))) continue;
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

/** Dev-only checkpoint shape (full state + solution-so-far); lets a long solveWings/solveInnerCorners run be resumed without redoing earlier rounds. */
interface PhaseCheckpoint {
  state: { cornerPerm: number[]; cornerOrient: number[]; wingPerm: number[]; wingOrient: number[]; innerCornerPerm: number[]; edgeBridgePerm: number[]; centerBridgePerm: number[] };
  solution: GigaminxTurn[];
  fixed: number[];
  attempts: number;
}

function stateToPlain(s: GigaminxState): PhaseCheckpoint["state"] {
  return {
    cornerPerm: Array.from(s.cornerPerm),
    cornerOrient: Array.from(s.cornerOrient),
    wingPerm: Array.from(s.wingPerm),
    wingOrient: Array.from(s.wingOrient),
    innerCornerPerm: Array.from(s.innerCornerPerm),
    edgeBridgePerm: Array.from(s.edgeBridgePerm),
    centerBridgePerm: Array.from(s.centerBridgePerm),
  };
}

function plainToState(p: PhaseCheckpoint["state"]): GigaminxState {
  return {
    cornerPerm: Int8Array.from(p.cornerPerm),
    cornerOrient: Int8Array.from(p.cornerOrient),
    wingPerm: Int8Array.from(p.wingPerm),
    wingOrient: Int8Array.from(p.wingOrient),
    innerCornerPerm: Int8Array.from(p.innerCornerPerm),
    edgeBridgePerm: Int8Array.from(p.edgeBridgePerm),
    centerBridgePerm: Int8Array.from(p.centerBridgePerm),
  };
}

export function solveWings(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaWingT0 = Date.now();
  const commutators = wingCommutators();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;

  const ckptPath = process.env.GIGA_WING_CKPT;
  if (ckptPath && require("node:fs").existsSync(ckptPath)) {
    const ckpt: PhaseCheckpoint = JSON.parse(require("node:fs").readFileSync(ckptPath, "utf8"));
    current = plainToState(ckpt.state);
    solution.push(...ckpt.solution);
    for (const p of ckpt.fixed) fixed.add(p);
    attempts = ckpt.attempts;
    if (process.env.GIGA_DEBUG) {
      require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveWings] resumed from checkpoint at attempts=${attempts}\n`);
    }
  }

  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  // Tracks every full wing state this run has passed through, so
  // findSafeWingApplication can refuse to re-enter one -- otherwise a fully
  // deterministic search can settle into a stable N-cycle (most visibly a
  // 2-cycle: regress away from a hard residual, then lateral/strict straight
  // back to it) and never converge.
  const visited = new Set<string>([wingStateSignature(current)]);

  try {
    while (targetPositions.some((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveWings exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.wingPerm[p] !== p || current.wingOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      if (process.env.GIGA_DEBUG) {
        require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveWings] round=${attempts} wrongBefore=${wrongBefore} elapsedMs=${Date.now() - (globalThis as any).__gigaWingT0}\n`);
      }
      if (ckptPath) {
        const ckpt: PhaseCheckpoint = { state: stateToPlain(current), solution, fixed: [...fixed], attempts };
        require("node:fs").writeFileSync(ckptPath, JSON.stringify(ckpt));
      }

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = tryExactFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.wingPerm[pos];
          strictFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, true, visited);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.wingPerm[pos];
              lateralFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore, targetPositions, true, visited);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishWings(commutators, current, fixed, wrongPositions.map((p) => current.wingPerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.wingPerm[pos];
                  regressiveFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, false, visited);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) {
                if (process.env.GIGA_DEBUG) {
                  const detail = wrongPositions.map((p) => `${p}->${current.wingPerm[p]}(o${current.wingOrient[p]})`).join(", ");
                  require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveWings] STUCK wrongPositions: ${detail}\n`);
                }
                throw new Error(`solveWings stuck (${wrongBefore} wings still wrong, no move found even allowing up to +${REGRESSION_LADDER[REGRESSION_LADDER.length - 1]} temporary regression)`);
              }
              if (consecutiveRegressive >= maxConsecutiveRegressive) {
                throw new Error(`solveWings stuck (${wrongBefore} wings still wrong, exhausted ${maxConsecutiveRegressive}-round regression budget)`);
              }
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }

      current = found.state;
      solution.push(...found.seq);
      visited.add(wingStateSignature(current));
      // Rebuild (not just add-to) fixed: a regression step can legitimately
      // re-break a previously-fixed piece, and if `fixed` only ever grew,
      // that piece would stay falsely "protected" and could never be fixed again.
      fixed.clear();
      for (const p of targetPositions) if (current.wingPerm[p] === p && current.wingOrient[p] === 0) fixed.add(p);
    }
    return { moves: solution, trace: { name: "wings", rounds: attempts, movesEmitted: solution.length, succeeded: true } };
  } catch (err) {
    return { moves: solution, trace: { name: "wings", rounds: attempts, movesEmitted: solution.length, succeeded: false, error: String(err) } };
  }
}

export function solveCornersAndWings(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; cornersTrace: PhaseTrace; wingsTrace: PhaseTrace } {
  const cornerResult = solveCorners(state, maxAttempts);
  if (!cornerResult.trace.succeeded) {
    return { moves: cornerResult.moves, cornersTrace: cornerResult.trace, wingsTrace: { name: "wings", rounds: 0, movesEmitted: 0, succeeded: false, error: "skipped: corners not solved" } };
  }
  const afterCorners = applySeq(state, cornerResult.moves);
  const wingResult = solveWings(afterCorners, maxAttempts);
  return { moves: [...cornerResult.moves, ...wingResult.moves], cornersTrace: cornerResult.trace, wingsTrace: wingResult.trace };
}

// ===================== Inner corner orbit (Phase 3, corners+wings fixed) =====================
// Pure permutation, no orientation -- otherwise the same commutator-library +
// greedy-safe-application architecture as the wing orbit (Phase 2), with the
// enforceFixed relaxation and visited-state cycle-breaking built in from the
// start this time (both were hard-won fixes discovered while debugging
// Phase 2 -- see findSafeWingApplication's and solveWings' own dev notes).

function innerCornerKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(60);
    for (let pos = 0; pos < 60; pos++) loc[s.innerCornerPerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}
function countWrongInnerCorners(state: GigaminxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.innerCornerPerm[p] !== p) n++;
  return n;
}
export function areInnerCornersSolved(state: GigaminxState): boolean {
  return state.innerCornerPerm.every((p, i) => p === i);
}
function innerCornerStateSignature(state: GigaminxState): string {
  return state.innerCornerPerm.join(",");
}

let innerCornerCommutatorsCache: Commutator[] | null = null;
function innerCornerCommutators(): Commutator[] {
  if (innerCornerCommutatorsCache) return innerCornerCommutatorsCache;
  const diskCachePath = process.env.GIGA_INNERCORNER_LIB_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    innerCornerCommutatorsCache = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[innerCornerCommutators] loaded from disk cache count=${innerCornerCommutatorsCache!.length}\n`);
    return innerCornerCommutatorsCache!;
  }
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[innerCornerCommutators] build starting\n`);
  const tLib0 = Date.now();
  const solved = solvedGigaminxState();
  // Raw A/B move-pair commutators essentially never land on dual (corner+wing)
  // purity -- an empirical probe found ZERO hits in 2,000,000 admissibleSeqs(2)
  // x admissibleSeqs(3) pairs. Instead, build "commutators of commutators":
  // pair entries from the already-corner-pure wing commutator library and
  // take [W1, W2]. Since each Wi is corner-pure by construction, so is
  // [W1, W2] automatically; whether it's ALSO wing-pure depends on how W1 and
  // W2's wing-moving parts interact, which turned out to happen often enough
  // to be very usable (a probe found 7,752 hits, mostly support 3, in just
  // 400,000 of the ~1.34M possible pairs).
  const wingComms = wingCommutators().map((c) => c.seq);
  innerCornerCommutatorsCache = buildCommutatorLibrary(
    solved,
    wingComms,
    wingComms,
    16,
    (size) => (size <= 6 ? 200 : 80),
    wingComms.length * wingComms.length + 1,
    (result) => areCornersSolved(result) && areWingsSolved(result),
    (result) => {
      const sup: number[] = [];
      for (let i = 0; i < 60; i++) if (result.innerCornerPerm[i] !== i) sup.push(i);
      return sup;
    },
    // Default requiredSizes (every size 1..16) is fine here: the full pair
    // space is only ~1.3M (vs wings' ~8 billion raw A/B pairs), so scanning
    // it all to find whichever sizes truly occur is cheap (~tens of seconds).
  );
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[innerCornerCommutators] build done count=${innerCornerCommutatorsCache.length} elapsedMs=${Date.now() - tLib0}\n`);
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(innerCornerCommutatorsCache));
  return innerCornerCommutatorsCache;
}

function buildJointInnerCornerReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = innerCornerKeyFor(pieces);
  const MAX_DEPTH = 10;
  const MAX_REACHABLE = 300_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        let bucket = reachable.get(key);
        if (bucket) {
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
    frontier = next;
  }
  const setIndex = new Map<string, string[]>();
  for (const key of reachable.keys()) {
    const positions = key.split(",").map(Number);
    const sk = setKeyOf(positions);
    if (!setIndex.has(sk)) setIndex.set(sk, []);
    setIndex.get(sk)!.push(key);
  }
  return { reachable, setIndex };
}

function tryExactFinishInnerCorners(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = buildJointInnerCornerReachTable(current, pieces);
  for (const C of matchingEntries) {
    const sk = setKeyOf(C.support);
    const matchingKeys = setIndex.get(sk);
    if (!matchingKeys) continue;
    for (const key of matchingKeys) {
      const bucket = reachable.get(key)!;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);
        const fixedPreserved = [...fixed].every((p) => resultState.innerCornerPerm[p] === p);
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => resultState.innerCornerPerm[piece] !== piece)) continue;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

function tryCompoundFinishInnerCorners(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishInnerCorners(commutators, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

function findSafeInnerCornerApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = innerCornerKeyFor([target]);
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.innerCornerPerm[anchor] === target, setupKey, 7, 100_000);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.innerCornerPerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongInnerCorners(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(innerCornerStateSignature(resultState))) continue;
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveInnerCorners(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaInnerCornerT0 = Date.now();
  const commutators = innerCornerCommutators();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;

  const ckptPath = process.env.GIGA_INNERCORNER_CKPT;
  if (ckptPath && require("node:fs").existsSync(ckptPath)) {
    const ckpt: PhaseCheckpoint = JSON.parse(require("node:fs").readFileSync(ckptPath, "utf8"));
    current = plainToState(ckpt.state);
    solution.push(...ckpt.solution);
    for (const p of ckpt.fixed) fixed.add(p);
    attempts = ckpt.attempts;
    if (process.env.GIGA_DEBUG) {
      require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveInnerCorners] resumed from checkpoint at attempts=${attempts}\n`);
    }
  }

  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([innerCornerStateSignature(current)]);

  try {
    while (targetPositions.some((p) => current.innerCornerPerm[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveInnerCorners exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.innerCornerPerm[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      if (process.env.GIGA_DEBUG) {
        require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveInnerCorners] round=${attempts} wrongBefore=${wrongBefore} elapsedMs=${Date.now() - (globalThis as any).__gigaInnerCornerT0}\n`);
      }
      if (ckptPath) {
        const ckpt: PhaseCheckpoint = { state: stateToPlain(current), solution, fixed: [...fixed], attempts };
        require("node:fs").writeFileSync(ckptPath, JSON.stringify(ckpt));
      }

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = tryExactFinishInnerCorners(commutators, current, fixed, wrongPositions.map((p) => current.innerCornerPerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.innerCornerPerm[pos];
          strictFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, true, visited);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.innerCornerPerm[pos];
              lateralFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, true, visited);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishInnerCorners(commutators, current, fixed, wrongPositions.map((p) => current.innerCornerPerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.innerCornerPerm[pos];
                  regressiveFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, false, visited);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) {
                if (process.env.GIGA_DEBUG) {
                  const detail = wrongPositions.map((p) => `${p}->${current.innerCornerPerm[p]}`).join(", ");
                  require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveInnerCorners] STUCK wrongPositions: ${detail}\n`);
                }
                throw new Error(`solveInnerCorners stuck (${wrongBefore} inner corners still wrong, no move found even allowing up to +${REGRESSION_LADDER[REGRESSION_LADDER.length - 1]} temporary regression)`);
              }
              if (consecutiveRegressive >= maxConsecutiveRegressive) {
                throw new Error(`solveInnerCorners stuck (${wrongBefore} inner corners still wrong, exhausted ${maxConsecutiveRegressive}-round regression budget)`);
              }
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }

      current = found.state;
      solution.push(...found.seq);
      visited.add(innerCornerStateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (current.innerCornerPerm[p] === p) fixed.add(p);
    }
    return { moves: solution, trace: { name: "innerCorners", rounds: attempts, movesEmitted: solution.length, succeeded: true } };
  } catch (err) {
    return { moves: solution, trace: { name: "innerCorners", rounds: attempts, movesEmitted: solution.length, succeeded: false, error: String(err) } };
  }
}

export function solveCornersWingsAndInnerCorners(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; cornersTrace: PhaseTrace; wingsTrace: PhaseTrace; innerCornersTrace: PhaseTrace } {
  const { moves: cwMoves, cornersTrace, wingsTrace } = solveCornersAndWings(state, maxAttempts);
  if (!cornersTrace.succeeded || !wingsTrace.succeeded) {
    return { moves: cwMoves, cornersTrace, wingsTrace, innerCornersTrace: { name: "innerCorners", rounds: 0, movesEmitted: 0, succeeded: false, error: "skipped: corners/wings not solved" } };
  }
  const afterCW = applySeq(state, cwMoves);
  const innerCornersResult = solveInnerCorners(afterCW, maxAttempts);
  return { moves: [...cwMoves, ...innerCornersResult.moves], cornersTrace, wingsTrace, innerCornersTrace: innerCornersResult.trace };
}

// ===================== Edge bridge orbit (Phase 4, corners+wings+innerCorners fixed) =====================
// Pure permutation, no orientation -- identical architecture to Phase 3, one
// level deeper in the "commutator of commutators" chain: raw A/B pairs don't
// reach triple (corner+wing+innerCorner) purity any more reliably than they
// reached dual purity for Phase 3, so build from pairs of innerCorner
// commutators instead (each already corner+wing pure by construction; an
// empirical probe found the resulting [IC1,IC2] is ALSO innerCorner-pure
// often enough to be very usable -- 61,242 hits across sizes 3-10 scanning
// the full ~239K-pair space in 24s).

function edgeBridgeKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(60);
    for (let pos = 0; pos < 60; pos++) loc[s.edgeBridgePerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}
function countWrongEdgeBridges(state: GigaminxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.edgeBridgePerm[p] !== p) n++;
  return n;
}
export function areEdgeBridgesSolved(state: GigaminxState): boolean {
  return state.edgeBridgePerm.every((p, i) => p === i);
}
function edgeBridgeStateSignature(state: GigaminxState): string {
  return state.edgeBridgePerm.join(",");
}

let edgeBridgeCommutatorsCache: Commutator[] | null = null;
function edgeBridgeCommutators(): Commutator[] {
  if (edgeBridgeCommutatorsCache) return edgeBridgeCommutatorsCache;
  const diskCachePath = process.env.GIGA_EDGEBRIDGE_LIB_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    edgeBridgeCommutatorsCache = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[edgeBridgeCommutators] loaded from disk cache count=${edgeBridgeCommutatorsCache!.length}\n`);
    return edgeBridgeCommutatorsCache!;
  }
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[edgeBridgeCommutators] build starting\n`);
  const tLib0 = Date.now();
  const solved = solvedGigaminxState();
  const icComms = innerCornerCommutators().map((c) => c.seq);
  edgeBridgeCommutatorsCache = buildCommutatorLibrary(
    solved,
    icComms,
    icComms,
    16,
    (size) => (size <= 6 ? 200 : 80),
    icComms.length * icComms.length + 1,
    (result) => areCornersSolved(result) && areWingsSolved(result) && areInnerCornersSolved(result),
    (result) => {
      const sup: number[] = [];
      for (let i = 0; i < 60; i++) if (result.edgeBridgePerm[i] !== i) sup.push(i);
      return sup;
    },
  );
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[edgeBridgeCommutators] build done count=${edgeBridgeCommutatorsCache.length} elapsedMs=${Date.now() - tLib0}\n`);
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(edgeBridgeCommutatorsCache));
  return edgeBridgeCommutatorsCache;
}

function buildJointEdgeBridgeReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = edgeBridgeKeyFor(pieces);
  const MAX_DEPTH = 10;
  const MAX_REACHABLE = 300_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        let bucket = reachable.get(key);
        if (bucket) {
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
    frontier = next;
  }
  const setIndex = new Map<string, string[]>();
  for (const key of reachable.keys()) {
    const positions = key.split(",").map(Number);
    const sk = setKeyOf(positions);
    if (!setIndex.has(sk)) setIndex.set(sk, []);
    setIndex.get(sk)!.push(key);
  }
  return { reachable, setIndex };
}

function tryExactFinishEdgeBridges(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = buildJointEdgeBridgeReachTable(current, pieces);
  for (const C of matchingEntries) {
    const sk = setKeyOf(C.support);
    const matchingKeys = setIndex.get(sk);
    if (!matchingKeys) continue;
    for (const key of matchingKeys) {
      const bucket = reachable.get(key)!;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);
        const fixedPreserved = [...fixed].every((p) => resultState.edgeBridgePerm[p] === p);
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => resultState.edgeBridgePerm[piece] !== piece)) continue;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

function tryCompoundFinishEdgeBridges(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishEdgeBridges(commutators, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

function findSafeEdgeBridgeApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = edgeBridgeKeyFor([target]);
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.edgeBridgePerm[anchor] === target, setupKey, 7, 100_000);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.edgeBridgePerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongEdgeBridges(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(edgeBridgeStateSignature(resultState))) continue;
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveEdgeBridges(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaEdgeBridgeT0 = Date.now();
  const commutators = edgeBridgeCommutators();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;

  const ckptPath = process.env.GIGA_EDGEBRIDGE_CKPT;
  if (ckptPath && require("node:fs").existsSync(ckptPath)) {
    const ckpt: PhaseCheckpoint = JSON.parse(require("node:fs").readFileSync(ckptPath, "utf8"));
    current = plainToState(ckpt.state);
    solution.push(...ckpt.solution);
    for (const p of ckpt.fixed) fixed.add(p);
    attempts = ckpt.attempts;
    if (process.env.GIGA_DEBUG) {
      require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveEdgeBridges] resumed from checkpoint at attempts=${attempts}\n`);
    }
  }

  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([edgeBridgeStateSignature(current)]);

  try {
    while (targetPositions.some((p) => current.edgeBridgePerm[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveEdgeBridges exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.edgeBridgePerm[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      if (process.env.GIGA_DEBUG) {
        require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveEdgeBridges] round=${attempts} wrongBefore=${wrongBefore} elapsedMs=${Date.now() - (globalThis as any).__gigaEdgeBridgeT0}\n`);
      }
      if (ckptPath) {
        const ckpt: PhaseCheckpoint = { state: stateToPlain(current), solution, fixed: [...fixed], attempts };
        require("node:fs").writeFileSync(ckptPath, JSON.stringify(ckpt));
      }

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = tryExactFinishEdgeBridges(commutators, current, fixed, wrongPositions.map((p) => current.edgeBridgePerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.edgeBridgePerm[pos];
          strictFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, true, visited);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.edgeBridgePerm[pos];
              lateralFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, true, visited);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishEdgeBridges(commutators, current, fixed, wrongPositions.map((p) => current.edgeBridgePerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.edgeBridgePerm[pos];
                  regressiveFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, false, visited);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) {
                if (process.env.GIGA_DEBUG) {
                  const detail = wrongPositions.map((p) => `${p}->${current.edgeBridgePerm[p]}`).join(", ");
                  require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveEdgeBridges] STUCK wrongPositions: ${detail}\n`);
                }
                throw new Error(`solveEdgeBridges stuck (${wrongBefore} edge bridges still wrong, no move found even allowing up to +${REGRESSION_LADDER[REGRESSION_LADDER.length - 1]} temporary regression)`);
              }
              if (consecutiveRegressive >= maxConsecutiveRegressive) {
                throw new Error(`solveEdgeBridges stuck (${wrongBefore} edge bridges still wrong, exhausted ${maxConsecutiveRegressive}-round regression budget)`);
              }
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }

      current = found.state;
      solution.push(...found.seq);
      visited.add(edgeBridgeStateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (current.edgeBridgePerm[p] === p) fixed.add(p);
    }
    return { moves: solution, trace: { name: "edgeBridges", rounds: attempts, movesEmitted: solution.length, succeeded: true } };
  } catch (err) {
    return { moves: solution, trace: { name: "edgeBridges", rounds: attempts, movesEmitted: solution.length, succeeded: false, error: String(err) } };
  }
}

export function solveCornersWingsInnerCornersAndEdgeBridges(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; cornersTrace: PhaseTrace; wingsTrace: PhaseTrace; innerCornersTrace: PhaseTrace; edgeBridgesTrace: PhaseTrace } {
  const { moves: cwiMoves, cornersTrace, wingsTrace, innerCornersTrace } = solveCornersWingsAndInnerCorners(state, maxAttempts);
  if (!cornersTrace.succeeded || !wingsTrace.succeeded || !innerCornersTrace.succeeded) {
    return { moves: cwiMoves, cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace: { name: "edgeBridges", rounds: 0, movesEmitted: 0, succeeded: false, error: "skipped: corners/wings/innerCorners not solved" } };
  }
  const afterCWI = applySeq(state, cwiMoves);
  const edgeBridgesResult = solveEdgeBridges(afterCWI, maxAttempts);
  return { moves: [...cwiMoves, ...edgeBridgesResult.moves], cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace: edgeBridgesResult.trace };
}

// ===================== Center bridge orbit (Phase 5, corners+wings+innerCorners+edgeBridges fixed) =====================
// Pure permutation, no orientation -- identical architecture to Phase 4, one
// level deeper again: build from pairs of edgeBridge commutators (each
// already corner+wing+innerCorner pure by construction); an empirical probe
// found [EB1,EB2] is ALSO edgeBridge-pure often enough to be usable (6,130
// hits, mostly size 3, scanning 400,000 of the ~804K possible pairs in 171s).
// This is the LAST orbit -- once centerBridge is solved, all 260 tracked
// pieces (the 12 fixed face centers are never tracked) are solved.

function centerBridgeKeyFor(pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(60);
    for (let pos = 0; pos < 60; pos++) loc[s.centerBridgePerm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}
function countWrongCenterBridges(state: GigaminxState, positions: readonly number[]): number {
  let n = 0;
  for (const p of positions) if (state.centerBridgePerm[p] !== p) n++;
  return n;
}
export function areCenterBridgesSolved(state: GigaminxState): boolean {
  return state.centerBridgePerm.every((p, i) => p === i);
}
function centerBridgeStateSignature(state: GigaminxState): string {
  return state.centerBridgePerm.join(",");
}

let centerBridgeCommutatorsCache: Commutator[] | null = null;
function centerBridgeCommutators(): Commutator[] {
  if (centerBridgeCommutatorsCache) return centerBridgeCommutatorsCache;
  const diskCachePath = process.env.GIGA_CENTERBRIDGE_LIB_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    centerBridgeCommutatorsCache = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[centerBridgeCommutators] loaded from disk cache count=${centerBridgeCommutatorsCache!.length}\n`);
    return centerBridgeCommutatorsCache!;
  }
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[centerBridgeCommutators] build starting\n`);
  const tLib0 = Date.now();
  const solved = solvedGigaminxState();
  const ebComms = edgeBridgeCommutators().map((c) => c.seq);
  centerBridgeCommutatorsCache = buildCommutatorLibrary(
    solved,
    ebComms,
    ebComms,
    16,
    (size) => (size <= 6 ? 200 : 80),
    ebComms.length * ebComms.length + 1,
    (result) => areCornersSolved(result) && areWingsSolved(result) && areInnerCornersSolved(result) && areEdgeBridgesSolved(result),
    (result) => {
      const sup: number[] = [];
      for (let i = 0; i < 60; i++) if (result.centerBridgePerm[i] !== i) sup.push(i);
      return sup;
    },
  );
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[centerBridgeCommutators] build done count=${centerBridgeCommutatorsCache.length} elapsedMs=${Date.now() - tLib0}\n`);
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(centerBridgeCommutatorsCache));
  return centerBridgeCommutatorsCache;
}

function buildJointCenterBridgeReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = centerBridgeKeyFor(pieces);
  const MAX_DEPTH = 10;
  const MAX_REACHABLE = 300_000;
  const MAX_BUCKET = 6;
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        let bucket = reachable.get(key);
        if (bucket) {
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
    frontier = next;
  }
  const setIndex = new Map<string, string[]>();
  for (const key of reachable.keys()) {
    const positions = key.split(",").map(Number);
    const sk = setKeyOf(positions);
    if (!setIndex.has(sk)) setIndex.set(sk, []);
    setIndex.get(sk)!.push(key);
  }
  return { reachable, setIndex };
}

function tryExactFinishCenterBridges(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = buildJointCenterBridgeReachTable(current, pieces);
  for (const C of matchingEntries) {
    const sk = setKeyOf(C.support);
    const matchingKeys = setIndex.get(sk);
    if (!matchingKeys) continue;
    for (const key of matchingKeys) {
      const bucket = reachable.get(key)!;
      for (const S of bucket) {
        const Sinv = invertSeq(S);
        const fullSeq = [...S, ...C.seq, ...Sinv];
        const resultState = applySeq(current, fullSeq);
        const fixedPreserved = [...fixed].every((p) => resultState.centerBridgePerm[p] === p);
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => resultState.centerBridgePerm[piece] !== piece)) continue;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}

function tryCompoundFinishCenterBridges(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishCenterBridges(commutators, current, fixed, subset);
      if (partial) return partial;
    }
  }
  return null;
}

function findSafeCenterBridgeApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = centerBridgeKeyFor([target]);
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = forwardSearchUntil(current, (s) => s.centerBridgePerm[anchor] === target, setupKey, 7, 100_000);
      if (!S) continue;
      const Sinv = invertSeq(S);
      const fullSeq = [...S, ...C.seq, ...Sinv];
      const resultState = applySeq(current, fullSeq);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.centerBridgePerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongCenterBridges(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(centerBridgeStateSignature(resultState))) continue;
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveCenterBridges(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaCenterBridgeT0 = Date.now();
  const commutators = centerBridgeCommutators();
  const targetPositions = Array.from({ length: 60 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;

  const ckptPath = process.env.GIGA_CENTERBRIDGE_CKPT;
  if (ckptPath && require("node:fs").existsSync(ckptPath)) {
    const ckpt: PhaseCheckpoint = JSON.parse(require("node:fs").readFileSync(ckptPath, "utf8"));
    current = plainToState(ckpt.state);
    solution.push(...ckpt.solution);
    for (const p of ckpt.fixed) fixed.add(p);
    attempts = ckpt.attempts;
    if (process.env.GIGA_DEBUG) {
      require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveCenterBridges] resumed from checkpoint at attempts=${attempts}\n`);
    }
  }

  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([centerBridgeStateSignature(current)]);

  try {
    while (targetPositions.some((p) => current.centerBridgePerm[p] !== p)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveCenterBridges exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.centerBridgePerm[p] !== p);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      if (process.env.GIGA_DEBUG) {
        require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveCenterBridges] round=${attempts} wrongBefore=${wrongBefore} elapsedMs=${Date.now() - (globalThis as any).__gigaCenterBridgeT0}\n`);
      }
      if (ckptPath) {
        const ckpt: PhaseCheckpoint = { state: stateToPlain(current), solution, fixed: [...fixed], attempts };
        require("node:fs").writeFileSync(ckptPath, JSON.stringify(ckpt));
      }

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = tryExactFinishCenterBridges(commutators, current, fixed, wrongPositions.map((p) => current.centerBridgePerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.centerBridgePerm[pos];
          strictFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, true, visited);
          if (strictFound) break;
        }
        if (strictFound) {
          found = strictFound;
          consecutiveLateral = 0;
          targetCursor = 0;
          consecutiveRegressive = 0;
        } else {
          let lateralFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
          if (consecutiveLateral < maxConsecutiveLateral) {
            for (let i = 0; i < tries; i++) {
              const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
              const target = current.centerBridgePerm[pos];
              lateralFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, true, visited);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 15 ? tryCompoundFinishCenterBridges(commutators, current, fixed, wrongPositions.map((p) => current.centerBridgePerm[p])) : null;
            if (compoundFound) {
              found = compoundFound;
              consecutiveLateral = 0;
              targetCursor = 0;
              consecutiveRegressive = 0;
            } else {
              let regressiveFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
              outerRegress: for (const step of REGRESSION_LADDER) {
                for (let i = 0; i < tries; i++) {
                  const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                  const target = current.centerBridgePerm[pos];
                  regressiveFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, false, visited);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) {
                if (process.env.GIGA_DEBUG) {
                  const detail = wrongPositions.map((p) => `${p}->${current.centerBridgePerm[p]}`).join(", ");
                  require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[solveCenterBridges] STUCK wrongPositions: ${detail}\n`);
                }
                throw new Error(`solveCenterBridges stuck (${wrongBefore} center bridges still wrong, no move found even allowing up to +${REGRESSION_LADDER[REGRESSION_LADDER.length - 1]} temporary regression)`);
              }
              if (consecutiveRegressive >= maxConsecutiveRegressive) {
                throw new Error(`solveCenterBridges stuck (${wrongBefore} center bridges still wrong, exhausted ${maxConsecutiveRegressive}-round regression budget)`);
              }
              found = regressiveFound;
              consecutiveLateral = 0;
              consecutiveRegressive++;
              targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
            }
          }
        }
      }

      current = found.state;
      solution.push(...found.seq);
      visited.add(centerBridgeStateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (current.centerBridgePerm[p] === p) fixed.add(p);
    }
    return { moves: solution, trace: { name: "centerBridges", rounds: attempts, movesEmitted: solution.length, succeeded: true } };
  } catch (err) {
    return { moves: solution, trace: { name: "centerBridges", rounds: attempts, movesEmitted: solution.length, succeeded: false, error: String(err) } };
  }
}

export function solveFullGigaminx(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; cornersTrace: PhaseTrace; wingsTrace: PhaseTrace; innerCornersTrace: PhaseTrace; edgeBridgesTrace: PhaseTrace; centerBridgesTrace: PhaseTrace } {
  const { moves: cwieMoves, cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace } = solveCornersWingsInnerCornersAndEdgeBridges(state, maxAttempts);
  if (!cornersTrace.succeeded || !wingsTrace.succeeded || !innerCornersTrace.succeeded || !edgeBridgesTrace.succeeded) {
    return { moves: cwieMoves, cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace, centerBridgesTrace: { name: "centerBridges", rounds: 0, movesEmitted: 0, succeeded: false, error: "skipped: corners/wings/innerCorners/edgeBridges not solved" } };
  }
  const afterCWIE = applySeq(state, cwieMoves);
  const centerBridgesResult = solveCenterBridges(afterCWIE, maxAttempts);
  return { moves: [...cwieMoves, ...centerBridgesResult.moves], cornersTrace, wingsTrace, innerCornersTrace, edgeBridgesTrace, centerBridgesTrace: centerBridgesResult.trace };
}

/** Dev-only re-exports for ad-hoc experimentation against a saved checkpoint. Not part of the public solver API. */
export const __dev = {
  applySeq,
  invertSeq,
  forwardSearchUntil,
  wingKeyFor,
  countWrongWings,
  wingCommutators,
  tryExactFinishWings,
  tryCompoundFinishWings,
  findSafeWingApplication,
  innerCornerKeyFor,
  countWrongInnerCorners,
  innerCornerCommutators,
  tryExactFinishInnerCorners,
  tryCompoundFinishInnerCorners,
  findSafeInnerCornerApplication,
  edgeBridgeKeyFor,
  countWrongEdgeBridges,
  edgeBridgeCommutators,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  findSafeEdgeBridgeApplication,
  centerBridgeKeyFor,
  countWrongCenterBridges,
  centerBridgeCommutators,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
  findSafeCenterBridgeApplication,
};
