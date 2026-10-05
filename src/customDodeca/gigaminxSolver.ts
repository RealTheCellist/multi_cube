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

/**
 * S1 (permutation-backed candidate evaluation): `applySeq(solved, seq)` for any
 * sequence is itself exactly a "virtual move" -- a GigaminxState whose perm/
 * orient arrays generalize a single raw move's XPerm/XOrientDelta, because
 * `solved` starts at the identity. Two such virtual moves compose via cheap
 * O(orbit-size) array indexing, with NO replay of the underlying move
 * sequences -- this is the exact generalization of applyGigaminxMove's own
 * per-field update rule (gigaminxState.ts: `cornerPerm[pos] =
 * state.cornerPerm[move.cornerPerm[pos]]`, etc.), with `outer` playing
 * `state`'s role (the sequence that happened first) and `inner` playing
 * `move`'s role (the sequence applied second, on top of outer).
 */
function composeSeqFirstThenSecond(outer: GigaminxState, inner: GigaminxState): GigaminxState {
  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = inner.cornerPerm[pos];
    cornerPerm[pos] = outer.cornerPerm[from];
    cornerOrient[pos] = ((outer.cornerOrient[from] + inner.cornerOrient[pos]) % 3) as number;
  }
  const wingPerm = new Int8Array(60);
  const wingOrient = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) {
    const from = inner.wingPerm[pos];
    wingPerm[pos] = outer.wingPerm[from];
    wingOrient[pos] = ((outer.wingOrient[from] + inner.wingOrient[pos]) % 2) as number;
  }
  const innerCornerPerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) innerCornerPerm[pos] = outer.innerCornerPerm[inner.innerCornerPerm[pos]];
  const edgeBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) edgeBridgePerm[pos] = outer.edgeBridgePerm[inner.edgeBridgePerm[pos]];
  const centerBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) centerBridgePerm[pos] = outer.centerBridgePerm[inner.centerBridgePerm[pos]];
  return { cornerPerm, cornerOrient, wingPerm, wingOrient, innerCornerPerm, edgeBridgePerm, centerBridgePerm };
}

/** The virtual move of `invertSeq(seq)`, computed directly from `S = applySeq(solved, seq)`'s own arrays -- no extra BFS/simulation needed. */
function invertVirtualMove(S: GigaminxState): GigaminxState {
  const cornerPerm = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) cornerPerm[S.cornerPerm[pos]] = pos;
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) cornerOrient[pos] = ((3 - S.cornerOrient[cornerPerm[pos]]) % 3) as number;

  const wingPerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) wingPerm[S.wingPerm[pos]] = pos;
  const wingOrient = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) wingOrient[pos] = ((2 - S.wingOrient[wingPerm[pos]]) % 2) as number;

  const innerCornerPerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) innerCornerPerm[S.innerCornerPerm[pos]] = pos;
  const edgeBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) edgeBridgePerm[S.edgeBridgePerm[pos]] = pos;
  const centerBridgePerm = new Int8Array(60);
  for (let pos = 0; pos < 60; pos++) centerBridgePerm[S.centerBridgePerm[pos]] = pos;

  return { cornerPerm, cornerOrient, wingPerm, wingOrient, innerCornerPerm, edgeBridgePerm, centerBridgePerm };
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

/**
 * Lookup table per orbit: "sourcePosition->destPosition" -> a move sequence
 * whose PERMUTATION effect sends whatever piece currently sits at
 * sourcePosition to destPosition. This is state-independent (it depends only
 * on the move group's action on positions, not on which piece occupies which
 * slot), so it can be computed once, offline, and reused by every future
 * solve -- unlike the per-round forwardSearchUntil setup search this
 * replaces (a fresh BFS on every single findSafe*Application call, by far
 * the dominant cost in the whole solver; see solveWings' own benchmark notes).
 */
/** A setup sequence plus its precomputed virtual move (`applySeq(solved, seq)`), so candidate evaluation can compose instead of replay -- see composeSeqFirstThenSecond's own dev notes. */
interface SetupEntry {
  seq: GigaminxTurn[];
  move: GigaminxState;
}

interface PositionSetupTables {
  corner: Map<string, SetupEntry>;
  wing: Map<string, SetupEntry>;
  innerCorner: Map<string, SetupEntry>;
  edgeBridge: Map<string, SetupEntry>;
  centerBridge: Map<string, SetupEntry>;
}

function recordPositionPairs(table: Map<string, SetupEntry>, child: GigaminxState, perm: Int8Array, size: number, path: readonly GigaminxTurn[]): number {
  let added = 0;
  for (let q = 0; q < size; q++) {
    const p = perm[q];
    if (p === q) continue;
    const key = `${p}->${q}`;
    if (!table.has(key)) {
      table.set(key, { seq: path as GigaminxTurn[], move: child });
      added++;
    }
  }
  return added;
}

function buildPositionSetupTables(maxDepth = 10, maxStates = 400_000): PositionSetupTables {
  const solved = solvedGigaminxState();
  const tables: PositionSetupTables = {
    corner: new Map(),
    wing: new Map(),
    innerCorner: new Map(),
    edgeBridge: new Map(),
    centerBridge: new Map(),
  };
  const neededTotal = 20 * 19 + 60 * 59 * 4;
  let found = 0;
  const sigOf = (s: GigaminxState) => `${s.cornerPerm.join(",")}|${s.wingPerm.join(",")}|${s.innerCornerPerm.join(",")}|${s.edgeBridgePerm.join(",")}|${s.centerBridgePerm.join(",")}`;
  const seen = new Set<string>([sigOf(solved)]);
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: solved, path: [] }];
  for (let depth = 0; depth < maxDepth && frontier.length > 0 && found < neededTotal && seen.size < maxStates; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    outer: for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const sig = sigOf(child);
        if (seen.has(sig)) continue;
        seen.add(sig);
        const childPath = [...path, t];
        found += recordPositionPairs(tables.corner, child, child.cornerPerm, 20, childPath);
        found += recordPositionPairs(tables.wing, child, child.wingPerm, 60, childPath);
        found += recordPositionPairs(tables.innerCorner, child, child.innerCornerPerm, 60, childPath);
        found += recordPositionPairs(tables.edgeBridge, child, child.edgeBridgePerm, 60, childPath);
        found += recordPositionPairs(tables.centerBridge, child, child.centerBridgePerm, 60, childPath);
        next.push({ state: child, path: childPath });
        if (seen.size >= maxStates || found >= neededTotal) break outer;
      }
    }
    frontier = next;
  }
  return tables;
}

// Disk format stores only `seq` (unchanged from before S1), so existing cache
// files stay valid -- `move` is cheap to re-derive in one pass after load
// (applySeq(solved, seq) per entry, same computation the BFS already does
// once during a fresh build) rather than bloating the cache with redundant
// Int8Array data.
function serializeSetupTable(table: Map<string, SetupEntry>): Record<string, GigaminxTurn[]> {
  const out: Record<string, GigaminxTurn[]> = {};
  for (const [k, v] of table) out[k] = v.seq;
  return out;
}
function deserializeSetupTable(obj: Record<string, GigaminxTurn[]>, solved: GigaminxState): Map<string, SetupEntry> {
  const m = new Map<string, SetupEntry>();
  for (const k of Object.keys(obj)) {
    const seq = obj[k];
    m.set(k, { seq, move: applySeq(solved, seq) });
  }
  return m;
}

let positionSetupTablesCache: PositionSetupTables | null = null;
function positionSetupTables(): PositionSetupTables {
  if (positionSetupTablesCache) return positionSetupTablesCache;
  const diskCachePath = process.env.GIGA_SETUP_TABLES_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    const solved = solvedGigaminxState();
    positionSetupTablesCache = {
      corner: deserializeSetupTable(raw.corner, solved),
      wing: deserializeSetupTable(raw.wing, solved),
      innerCorner: deserializeSetupTable(raw.innerCorner, solved),
      edgeBridge: deserializeSetupTable(raw.edgeBridge, solved),
      centerBridge: deserializeSetupTable(raw.centerBridge, solved),
    };
    if (process.env.GIGA_DEBUG) {
      const t = positionSetupTablesCache;
      require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[positionSetupTables] loaded from disk cache sizes corner=${t.corner.size} wing=${t.wing.size} innerCorner=${t.innerCorner.size} edgeBridge=${t.edgeBridge.size} centerBridge=${t.centerBridge.size}\n`);
    }
    return positionSetupTablesCache;
  }
  const t0 = Date.now();
  if (process.env.GIGA_DEBUG) require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[positionSetupTables] build starting\n`);
  positionSetupTablesCache = buildPositionSetupTables();
  if (process.env.GIGA_DEBUG) {
    const t = positionSetupTablesCache;
    require("node:fs").appendFileSync(process.env.GIGA_DEBUG, `[positionSetupTables] build done elapsedMs=${Date.now() - t0} sizes corner=${t.corner.size} wing=${t.wing.size} innerCorner=${t.innerCorner.size} edgeBridge=${t.edgeBridge.size} centerBridge=${t.centerBridge.size}\n`);
  }
  if (diskCachePath) {
    require("node:fs").writeFileSync(
      diskCachePath,
      JSON.stringify({
        corner: serializeSetupTable(positionSetupTablesCache.corner),
        wing: serializeSetupTable(positionSetupTablesCache.wing),
        innerCorner: serializeSetupTable(positionSetupTablesCache.innerCorner),
        edgeBridge: serializeSetupTable(positionSetupTablesCache.edgeBridge),
        centerBridge: serializeSetupTable(positionSetupTablesCache.centerBridge),
      }),
    );
  }
  return positionSetupTablesCache;
}

/** O(1) setup lookup (seq + precomputed virtual move) with a BFS fallback (should essentially never trigger once the table is fully built) for safety. */
function lookupSetup(table: Map<string, SetupEntry>, sourcePos: number, destPos: number, fallback: () => GigaminxTurn[] | null): SetupEntry | null {
  if (sourcePos === destPos) return { seq: [], move: solvedGigaminxState() };
  const hit = table.get(`${sourcePos}->${destPos}`);
  if (hit) return hit;
  const seq = fallback();
  if (!seq) return null;
  return { seq, move: applySeq(solvedGigaminxState(), seq) };
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
  /** `applySeq(solved, seq)` -- this commutator's net effect as a composable virtual move (see composeSeqFirstThenSecond's own dev notes). */
  move: GigaminxState;
}

function makeCornerCommutator(a: GigaminxTurn[], b: GigaminxTurn[], solved: GigaminxState): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(solved, seq);
  const support: number[] = [];
  for (let i = 0; i < 20; i++) if (result.cornerPerm[i] !== i || result.cornerOrient[i] !== 0) support.push(i);
  return { seq, support, move: result };
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
      bucket.push({ seq, support: sup, move: result });
      if (requiredSizes.every((n) => buckets.get(n)!.length >= perSizeCap(n))) break outer;
    }
  }
  const out: Commutator[] = [];
  for (let n = 1; n <= maxSupport; n++) out.push(...buckets.get(n)!);
  return out;
}

// Disk format stores only `seq`/`support` (unchanged from before S1) --
// `move` is re-derived in one cheap pass after load (applySeq(solved, seq)
// per entry) rather than serializing redundant Int8Array data, same pattern
// as serializeSetupTable/deserializeSetupTable above.
function stripMove(commutators: readonly Commutator[]): { seq: GigaminxTurn[]; support: number[] }[] {
  return commutators.map(({ seq, support }) => ({ seq, support }));
}
function deriveMoves(raw: readonly { seq: GigaminxTurn[]; support: number[] }[], solved: GigaminxState): Commutator[] {
  return raw.map((c) => ({ seq: c.seq, support: c.support, move: applySeq(solved, c.seq) }));
}

let cornerCommutatorsCache: Commutator[] | null = null;
function cornerCommutators(): Commutator[] {
  if (cornerCommutatorsCache) return cornerCommutatorsCache;
  const diskCachePath = process.env.GIGA_CORNER_LIB_CACHE;
  if (diskCachePath && require("node:fs").existsSync(diskCachePath)) {
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    cornerCommutatorsCache = deriveMoves(raw, solvedGigaminxState());
    return cornerCommutatorsCache;
  }
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
    // Empirically observed (see dev probe, mirrors wingCommutators' own
    // note): sizes 1,2 never occur for corner-only commutators from this
    // grammar, so without this the build never early-exits and scans the
    // entire maxPairsExamined budget every single time (this was corners'
    // actual bottleneck -- a ~170s one-time cost, not per-round search).
    [3, 4, 5, 6],
  );
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(stripMove(cornerCommutatorsCache)));
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

function cornerStateSignature(state: GigaminxState): string {
  return `${state.cornerPerm.join(",")}|${state.cornerOrient.join(",")}`;
}

/** Same enforceFixed-relaxation + visited-state-rejection pattern as the later phases (see findSafeWingApplication's own dev notes) -- corners lacked both until now, which was the real cause of its highly variable solve time (occasionally settling into an unproductive deterministic cycle, exactly like wings did before those fixes). */
function findSafeCornerApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], setupTables: PositionSetupTables, enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = cornerKeyFor([target]);
  const loc = new Array<number>(20);
  for (let p = 0; p < 20; p++) loc[current.cornerPerm[p]] = p;
  const sourcePos = loc[target];
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = lookupSetup(setupTables.corner, sourcePos, anchor, () => forwardSearchUntil(current, (s) => s.cornerPerm[anchor] === target, setupKey, 7));
      if (!S) continue;
      const SinvMove = invertVirtualMove(S.move);
      const fullMove = composeSeqFirstThenSecond(composeSeqFirstThenSecond(S.move, C.move), SinvMove);
      const resultState = composeSeqFirstThenSecond(current, fullMove);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.cornerPerm[p] === p && resultState.cornerOrient[p] === 0);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongCorners(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(cornerStateSignature(resultState))) continue;
      const fullSeq = [...S.seq, ...C.seq, ...invertSeq(S.seq)];
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveCorners(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  const commutators = cornerCommutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: 20 }, (_, i) => i);
  let current = state;
  const solution: GigaminxTurn[] = [];
  const fixed = new Set<number>();
  let attempts = 0;
  let consecutiveLateral = 0;
  const maxConsecutiveLateral = 8;
  let targetCursor = 0;
  const TARGETS_PER_ROUND = 6;
  const REGRESSION_LADDER = [2, 5, 10, 20];
  let consecutiveRegressive = 0;
  const maxConsecutiveRegressive = 20;
  const visited = new Set<string>([cornerStateSignature(current)]);

  try {
    while (targetPositions.some((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0)) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`solveCorners exceeded ${maxAttempts} attempts`);

      const wrongPositions = targetPositions.filter((p) => current.cornerPerm[p] !== p || current.cornerOrient[p] !== 0);
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
      if (wrongBefore >= 2 && wrongBefore <= 6) {
        found = tryExactFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p]));
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let strictFound: { state: GigaminxState; seq: GigaminxTurn[] } | null = null;
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = current.cornerPerm[pos];
          strictFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited);
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
              const target = current.cornerPerm[pos];
              lateralFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited);
              if (lateralFound) break;
            }
          }
          if (lateralFound) {
            found = lateralFound;
            consecutiveLateral++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          } else {
            const compoundFound = wrongBefore >= 2 && wrongBefore <= 5 ? tryCompoundFinishCorners(commutators, current, fixed, wrongPositions.map((p) => current.cornerPerm[p])) : null;
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
                  const target = current.cornerPerm[pos];
                  regressiveFound = findSafeCornerApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited);
                  if (regressiveFound) break outerRegress;
                }
              }
              if (!regressiveFound) {
                throw new Error(`solveCorners stuck (${wrongBefore} corners still wrong, no move found even allowing up to +${REGRESSION_LADDER[REGRESSION_LADDER.length - 1]} temporary regression)`);
              }
              if (consecutiveRegressive >= maxConsecutiveRegressive) {
                throw new Error(`solveCorners stuck (${wrongBefore} corners still wrong, exhausted ${maxConsecutiveRegressive}-round regression budget)`);
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
      visited.add(cornerStateSignature(current));
      fixed.clear();
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
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    wingCommutatorsCache = deriveMoves(raw, solvedGigaminxState());
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
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(stripMove(wingCommutatorsCache)));
  return wingCommutatorsCache;
}

function buildJointWingReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = positionOnlyWingKeyFor(pieces);
  // Deliberately small: exact-finish is now only a nice-to-have (it can emit
  // a cleaner multi-piece fix in one shot), not load-bearing for correctness
  // -- the strict/lateral/regression tiers use O(1) setup-table lookups now
  // and already proved they can solve hard residuals on their own (see
  // solveWings' visited-state dev notes). A cheap, mostly-empty table here
  // is far better than paying a multi-hundred-thousand-state BFS every
  // single round just to occasionally save a few moves.
  const MAX_DEPTH = 5;
  const MAX_REACHABLE = 3_000;
  const MAX_BUCKET = 4;
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
/**
 * S(C.support): the positions a conjugate `S路C路S^-1` actually touches, read
 * straight off the already-looked-up setup move's permutation array -- no
 * compose needed. `support(S C S^-1) = S(support(C))` is an exact algebraic
 * identity (conjugation preserves support under relabeling by S); see
 * gigaminxS4ConjugationSupportPrefilter.test.ts for the full derivation and
 * its empirical validation. Returns true iff ANY mapped position is in
 * `fixed` -- i.e. the conjugate is NOT provably disjoint from fixed.
 */
function wingSupportOverlapsFixed(support: readonly number[], setupWingPerm: Int8Array, fixed: ReadonlySet<number>): boolean {
  for (const c of support) {
    if (fixed.has(setupWingPerm[c])) return true;
  }
  return false;
}

/**
 * `candidatesOverride`/`onEval`/`onGenerate` are opt-in, no-op-by-default
 * instrumentation/ordering hooks for the S2/S3/S4 screening sprints (see
 * gigaminxS2WingOrderingBench.test.ts, gigaminxS3WingCostDecomposition.test.ts,
 * gigaminxS4ConjugationSupportPrefilter.test.ts) -- `commutators` is still
 * iterated in array order exactly as before, and no continue/return site's
 * CONDITION changes when these are omitted, so passing none of them leaves
 * behavior and output byte-identical to the pre-S2 function. `onGenerate`
 * fires once per (C, anchor) pair considered, before the setup-table lookup
 * (S3's "generatedCandidates"); `onEval` fires once per pair that reached a
 * concrete setup S (S3's "evaluatedCandidates"), tagged with exactly which
 * existing branch it fell into -- no new branches, just naming the ones
 * already here. `candidatesOverride` lets a caller search a reordered (but
 * set-identical) copy of `commutators` without touching production call
 * sites, which always omit it. `usePrefilter` (S4, default false) is the
 * ONLY parameter that can change a return value: when true, and
 * `enforceFixed` is true, and `wingSupportOverlapsFixed` finds an overlap,
 * the candidate is rejected (exactly the same `continue` the existing
 * fixedPreserved check would have taken) WITHOUT running the S1 compose
 * that would otherwise be needed to compute `resultState` for that check --
 * production call sites never pass `usePrefilter`, so this is unreachable
 * there; every production candidate is still decided by the full, exact
 * `fixedPreserved` compose+check exactly as before.
 */
function findSafeWingApplication(
  commutators: readonly Commutator[],
  current: GigaminxState,
  fixed: ReadonlySet<number>,
  target: number,
  wrongAfterThreshold: number,
  remaining: readonly number[],
  setupTables: PositionSetupTables,
  enforceFixed = true,
  visited?: ReadonlySet<string>,
  candidatesOverride?: readonly Commutator[],
  onEval?: (info: { commutator: Commutator; anchor: number; setupSeqLen: number; localRank: number; outcome: "fixedReject" | "improvementReject" | "visitedReject" | "accepted"; lookupMs: number; composeMs: number; checkMs: number; prefilterOverlap: boolean; composeSkipped: boolean }) => void,
  onGenerate?: () => void,
  usePrefilter = false,
): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = wingKeyFor([target]);
  const loc = new Array<number>(60);
  for (let p = 0; p < 60; p++) loc[current.wingPerm[p]] = p;
  const sourcePos = loc[target];
  let localRank = 0;
  // `timed` gates the extra performance.now() calls below behind the SAME
  // boolean every time, so when onEval is omitted (every production call
  // site) this is one cheap check per candidate and no timestamps are taken
  // -- S3's fine-grained per-step timing (lookup/compose/check) never runs
  // unless a caller explicitly opts in by passing onEval.
  const timed = !!onEval;
  for (const C of candidatesOverride ?? commutators) {
    for (const anchor of C.support) {
      onGenerate?.();
      const tLookup0 = timed ? performance.now() : 0;
      const S = lookupSetup(setupTables.wing, sourcePos, anchor, () => forwardSearchUntil(current, (s) => s.wingPerm[anchor] === target, setupKey, 7, 100_000));
      const tLookup1 = timed ? performance.now() : 0;
      if (!S) continue;
      localRank++;
      const prefilterOverlap = onEval || usePrefilter ? wingSupportOverlapsFixed(C.support, S.move.wingPerm, fixed) : false;
      if (enforceFixed && usePrefilter && prefilterOverlap) {
        const tCheck1 = timed ? performance.now() : 0;
        onEval?.({ commutator: C, anchor, setupSeqLen: S.seq.length, localRank, outcome: "fixedReject", lookupMs: tLookup1 - tLookup0, composeMs: 0, checkMs: tCheck1 - tLookup1, prefilterOverlap, composeSkipped: true });
        continue;
      }
      const SinvMove = invertVirtualMove(S.move);
      const fullMove = composeSeqFirstThenSecond(composeSeqFirstThenSecond(S.move, C.move), SinvMove);
      const resultState = composeSeqFirstThenSecond(current, fullMove);
      const tCompose1 = timed ? performance.now() : 0;
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.wingPerm[p] === p && resultState.wingOrient[p] === 0);
        if (!fixedPreserved) {
          const tCheck1 = timed ? performance.now() : 0;
          onEval?.({ commutator: C, anchor, setupSeqLen: S.seq.length, localRank, outcome: "fixedReject", lookupMs: tLookup1 - tLookup0, composeMs: tCompose1 - tLookup1, checkMs: tCheck1 - tCompose1, prefilterOverlap, composeSkipped: false });
          continue;
        }
      }
      const wrongAfter = countWrongWings(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) {
        const tCheck1 = timed ? performance.now() : 0;
        onEval?.({ commutator: C, anchor, setupSeqLen: S.seq.length, localRank, outcome: "improvementReject", lookupMs: tLookup1 - tLookup0, composeMs: tCompose1 - tLookup1, checkMs: tCheck1 - tCompose1, prefilterOverlap, composeSkipped: false });
        continue;
      }
      // Without enforceFixed, strict/lateral/regression can otherwise rediscover
      // the exact same resultState every time the same (current, target,
      // threshold) recurs -- since the search is fully deterministic, that
      // produces a stable 2-(or N-)cycle that never converges. Skipping any
      // candidate that returns to an already-visited state forces a genuinely
      // new state each round instead.
      if (visited?.has(wingStateSignature(resultState))) {
        const tCheck1 = timed ? performance.now() : 0;
        onEval?.({ commutator: C, anchor, setupSeqLen: S.seq.length, localRank, outcome: "visitedReject", lookupMs: tLookup1 - tLookup0, composeMs: tCompose1 - tLookup1, checkMs: tCheck1 - tCompose1, prefilterOverlap, composeSkipped: false });
        continue;
      }
      const fullSeq = [...S.seq, ...C.seq, ...invertSeq(S.seq)];
      const tCheck1 = timed ? performance.now() : 0;
      onEval?.({ commutator: C, anchor, setupSeqLen: S.seq.length, localRank, outcome: "accepted", lookupMs: tLookup1 - tLookup0, composeMs: tCompose1 - tLookup1, checkMs: tCheck1 - tCompose1, prefilterOverlap, composeSkipped: false });
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

/**
 * S5 (production integration): S4 verified, across every enforceFixed=true
 * candidate evaluated in 3 seeds (2,844,216 of them), that `wingSupport
 * OverlapsFixed` decides the exact same accept/reject outcome as the full
 * S1 compose + fixedPreserved check -- zero false-safe (the direction
 * proven algebraically: no overlap => fixedPreserved is guaranteed true)
 * and zero false-reject (the direction validated empirically, not proven
 * for every conceivable state) -- with trajectory, regression suite, and
 * replay all unaffected, and Wing Phase 2 time cut ~2.63x by skipping the
 * S1 compose on ~99.75% of candidates. See gigaminx_s4_conjugation_support_
 * prefilter_conclusion.md. Conservative by construction even if the
 * empirical direction ever stops holding: an overlap NEVER short-circuits
 * accept/reject on its own -- it only ever falls through to the exact same
 * full compose + fixedPreserved check this file always ran.
 */
const WING_USE_PREFILTER = true;

export function solveWings(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaWingT0 = Date.now();
  const commutators = wingCommutators();
  const setupTables = positionSetupTables();
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
          strictFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, WING_USE_PREFILTER);
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
              lateralFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, WING_USE_PREFILTER);
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
                  // enforceFixed=false here means usePrefilter is structurally inert
                  // (findSafeWingApplication only engages it when enforceFixed is also
                  // true) -- passed anyway for consistency; Gate D-A in the S5 report
                  // verifies this guard holds.
                  regressiveFound = findSafeWingApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, WING_USE_PREFILTER);
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
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    innerCornerCommutatorsCache = deriveMoves(raw, solvedGigaminxState());
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
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(stripMove(innerCornerCommutatorsCache)));
  return innerCornerCommutatorsCache;
}

function buildJointInnerCornerReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = innerCornerKeyFor(pieces);
  // See buildJointWingReachTable's own dev notes: deliberately small now
  // that the strict/lateral/regression tiers use O(1) setup-table lookups
  // and no longer need exact-finish to be load-bearing.
  const MAX_DEPTH = 5;
  const MAX_REACHABLE = 3_000;
  const MAX_BUCKET = 4;
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

function findSafeInnerCornerApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], setupTables: PositionSetupTables, enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = innerCornerKeyFor([target]);
  const loc = new Array<number>(60);
  for (let p = 0; p < 60; p++) loc[current.innerCornerPerm[p]] = p;
  const sourcePos = loc[target];
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = lookupSetup(setupTables.innerCorner, sourcePos, anchor, () => forwardSearchUntil(current, (s) => s.innerCornerPerm[anchor] === target, setupKey, 7, 100_000));
      if (!S) continue;
      const SinvMove = invertVirtualMove(S.move);
      const fullMove = composeSeqFirstThenSecond(composeSeqFirstThenSecond(S.move, C.move), SinvMove);
      const resultState = composeSeqFirstThenSecond(current, fullMove);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.innerCornerPerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongInnerCorners(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(innerCornerStateSignature(resultState))) continue;
      const fullSeq = [...S.seq, ...C.seq, ...invertSeq(S.seq)];
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveInnerCorners(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaInnerCornerT0 = Date.now();
  const commutators = innerCornerCommutators();
  const setupTables = positionSetupTables();
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
          strictFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited);
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
              lateralFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited);
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
                  regressiveFound = findSafeInnerCornerApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited);
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
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    edgeBridgeCommutatorsCache = deriveMoves(raw, solvedGigaminxState());
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
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(stripMove(edgeBridgeCommutatorsCache)));
  return edgeBridgeCommutatorsCache;
}

function buildJointEdgeBridgeReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = edgeBridgeKeyFor(pieces);
  // See buildJointWingReachTable's own dev notes.
  const MAX_DEPTH = 5;
  const MAX_REACHABLE = 3_000;
  const MAX_BUCKET = 4;
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

function findSafeEdgeBridgeApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], setupTables: PositionSetupTables, enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = edgeBridgeKeyFor([target]);
  const loc = new Array<number>(60);
  for (let p = 0; p < 60; p++) loc[current.edgeBridgePerm[p]] = p;
  const sourcePos = loc[target];
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = lookupSetup(setupTables.edgeBridge, sourcePos, anchor, () => forwardSearchUntil(current, (s) => s.edgeBridgePerm[anchor] === target, setupKey, 7, 100_000));
      if (!S) continue;
      const SinvMove = invertVirtualMove(S.move);
      const fullMove = composeSeqFirstThenSecond(composeSeqFirstThenSecond(S.move, C.move), SinvMove);
      const resultState = composeSeqFirstThenSecond(current, fullMove);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.edgeBridgePerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongEdgeBridges(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(edgeBridgeStateSignature(resultState))) continue;
      const fullSeq = [...S.seq, ...C.seq, ...invertSeq(S.seq)];
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveEdgeBridges(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaEdgeBridgeT0 = Date.now();
  const commutators = edgeBridgeCommutators();
  const setupTables = positionSetupTables();
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
          strictFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited);
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
              lateralFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited);
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
                  regressiveFound = findSafeEdgeBridgeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited);
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
    const raw = JSON.parse(require("node:fs").readFileSync(diskCachePath, "utf8"));
    centerBridgeCommutatorsCache = deriveMoves(raw, solvedGigaminxState());
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
  if (diskCachePath) require("node:fs").writeFileSync(diskCachePath, JSON.stringify(stripMove(centerBridgeCommutatorsCache)));
  return centerBridgeCommutatorsCache;
}

function buildJointCenterBridgeReachTable(current: GigaminxState, pieces: readonly number[]): JointReachTable {
  const posKeyFn = centerBridgeKeyFor(pieces);
  // See buildJointWingReachTable's own dev notes.
  const MAX_DEPTH = 5;
  const MAX_REACHABLE = 3_000;
  const MAX_BUCKET = 4;
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

function findSafeCenterBridgeApplication(commutators: readonly Commutator[], current: GigaminxState, fixed: ReadonlySet<number>, target: number, wrongAfterThreshold: number, remaining: readonly number[], setupTables: PositionSetupTables, enforceFixed = true, visited?: ReadonlySet<string>): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const setupKey = centerBridgeKeyFor([target]);
  const loc = new Array<number>(60);
  for (let p = 0; p < 60; p++) loc[current.centerBridgePerm[p]] = p;
  const sourcePos = loc[target];
  for (const C of commutators) {
    for (const anchor of C.support) {
      const S = lookupSetup(setupTables.centerBridge, sourcePos, anchor, () => forwardSearchUntil(current, (s) => s.centerBridgePerm[anchor] === target, setupKey, 7, 100_000));
      if (!S) continue;
      const SinvMove = invertVirtualMove(S.move);
      const fullMove = composeSeqFirstThenSecond(composeSeqFirstThenSecond(S.move, C.move), SinvMove);
      const resultState = composeSeqFirstThenSecond(current, fullMove);
      if (enforceFixed) {
        const fixedPreserved = [...fixed].every((p) => resultState.centerBridgePerm[p] === p);
        if (!fixedPreserved) continue;
      }
      const wrongAfter = countWrongCenterBridges(resultState, remaining);
      if (wrongAfter > wrongAfterThreshold) continue;
      if (visited?.has(centerBridgeStateSignature(resultState))) continue;
      const fullSeq = [...S.seq, ...C.seq, ...invertSeq(S.seq)];
      return { state: resultState, seq: fullSeq };
    }
  }
  return null;
}

export function solveCenterBridges(state: GigaminxState, maxAttempts = 400): { moves: GigaminxTurn[]; trace: PhaseTrace } {
  (globalThis as any).__gigaCenterBridgeT0 = Date.now();
  const commutators = centerBridgeCommutators();
  const setupTables = positionSetupTables();
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
          strictFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited);
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
              lateralFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited);
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
                  regressiveFound = findSafeCenterBridgeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited);
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
  composeSeqFirstThenSecond,
  wingSupportOverlapsFixed,
  invertVirtualMove,
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
  buildPositionSetupTables,
  positionSetupTables,
};
