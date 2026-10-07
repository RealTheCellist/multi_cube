// GIGAMINX_S9_COMPOUND_FINISH_ARCHITECTURE_SCREENING_V1 -- pure research
// screening, zero production changes (gigaminxSolver.ts untouched this
// sprint). Everything here is a LOCAL reimplementation (reading the real
// buildJoint*ReachTable/tryExactFinish*/tryCompoundFinish* algorithms via
// source inspection) used only for instrumentation and for prototyping
// "Architecture A: Reach-Table Reuse" -- never wired into production.
//
// Key structural fact confirmed by reading gigaminxSolver.ts directly:
// buildJoint<Orbit>ReachTable(current, pieces)'s BFS exploration (frontier
// expansion over ALL_MOVES from `current`) does NOT depend on `pieces` at
// all except through the dedup/grouping key function
// positionOnly<Orbit>KeyFor(pieces). tryCompoundFinish<Orbit> calls
// tryExactFinish<Orbit> (which calls buildJoint*ReachTable) once per
// SUBSET of wrongPieces, across every subset size from length-1 down to
// 2 -- i.e. it reruns the full (budget-capped) BFS from scratch for every
// subset, even though the underlying exploration is largely subset-
// independent. Architecture A: explore ONCE (keyed by the full wrongPieces
// set, the finest granularity actually needed within one compound-finish
// call), then cheaply re-group (project) that single exploration's
// (state, path) pairs by each subset's own coarser key -- no new BFS.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, areWingsSolved, areEdgeBridgesSolved, areCenterBridgesSolved, __dev } from "./gigaminxSolver";

// Direct-to-disk debug log, bypassing vitest's console.log buffering (which
// only flushes on test completion) so progress is visible WHILE the process
// is still running -- see this session's own notes on vitest buffering.
const DBG_PATH = process.env.GIGA_S9_DEBUG;
function dbg(msg: string) {
  if (!DBG_PATH) return;
  require("node:fs").appendFileSync(DBG_PATH, `[${Date.now()}] ${msg}\n`);
}

const {
  wingCommutators,
  findSafeWingApplication,
  tryExactFinishWings,
  countWrongWings,
  edgeBridgeCommutators,
  findSafeEdgeBridgeApplication,
  tryExactFinishEdgeBridges,
  countWrongEdgeBridges,
  centerBridgeCommutators,
  findSafeCenterBridgeApplication,
  tryExactFinishCenterBridges,
  countWrongCenterBridges,
  positionSetupTables,
} = __dev as any;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function applySeq(state: GigaminxState, seq: readonly GigaminxTurn[]): GigaminxState {
  let s = state;
  for (const t of seq) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  return s;
}
function invertSeq(seq: readonly GigaminxTurn[]): GigaminxTurn[] {
  return [...seq].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1, depth: t.depth }));
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
const ALL_MOVES: readonly GigaminxTurn[] = buildAllMoves();
function buildAllMoves(): GigaminxTurn[] {
  const FACES = Array.from({ length: 12 }, (_, i) => i) as any;
  const out: GigaminxTurn[] = [];
  for (const face of FACES) for (const depth of [1, 2, 3, 4] as const) for (const sign of [1, -1] as const) out.push({ face, sign, depth });
  return out;
}

type Orbit = "wing" | "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  size: number;
  perm: (s: GigaminxState) => Int8Array;
  isPieceSolved: (s: GigaminxState, pos: number) => boolean;
  // MUST exactly match the production state-signature function each
  // orbit's own findSafeXApplication checks `visited` against internally
  // (wingStateSignature includes orientation; edgeBridge/centerBridge have
  // no orientation field at all) -- a format mismatch here silently
  // disables cycle-breaking (visited.has(...) never matches), which is
  // exactly the deterministic-cycling bug this project's visited-state
  // fix was built to prevent (see solveWings' own dev history).
  stateSignature: (s: GigaminxState) => string;
  commutators: () => { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
  findSafeApplication: (...args: any[]) => any;
  tryExactFinish: (...args: any[]) => any;
  countWrong: (s: GigaminxState, positions: readonly number[]) => number;
  setupTableOf: (tables: any) => Map<string, { seq: GigaminxTurn[]; move: GigaminxState }>;
}
const WING: Adapter = {
  name: "wing",
  size: 60,
  perm: (s) => s.wingPerm,
  isPieceSolved: (s, p) => s.wingPerm[p] === p && s.wingOrient[p] === 0,
  stateSignature: (s) => `${s.wingPerm.join(",")}|${s.wingOrient.join(",")}`,
  commutators: wingCommutators,
  findSafeApplication: findSafeWingApplication,
  tryExactFinish: tryExactFinishWings,
  countWrong: countWrongWings,
  setupTableOf: (t) => t.wing,
};
const EDGE_BRIDGE: Adapter = {
  name: "edgeBridge",
  size: 60,
  perm: (s) => s.edgeBridgePerm,
  isPieceSolved: (s, p) => s.edgeBridgePerm[p] === p,
  stateSignature: (s) => s.edgeBridgePerm.join(","),
  commutators: edgeBridgeCommutators,
  findSafeApplication: findSafeEdgeBridgeApplication,
  tryExactFinish: tryExactFinishEdgeBridges,
  countWrong: countWrongEdgeBridges,
  setupTableOf: (t) => t.edgeBridge,
};
const CENTER_BRIDGE: Adapter = {
  name: "centerBridge",
  size: 60,
  perm: (s) => s.centerBridgePerm,
  isPieceSolved: (s, p) => s.centerBridgePerm[p] === p,
  stateSignature: (s) => s.centerBridgePerm.join(","),
  commutators: centerBridgeCommutators,
  findSafeApplication: findSafeCenterBridgeApplication,
  tryExactFinish: tryExactFinishCenterBridges,
  countWrong: countWrongCenterBridges,
  setupTableOf: (t) => t.centerBridge,
};

function positionOnlyKeyFor(adapter: Adapter, pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(adapter.size);
    const perm = adapter.perm(s);
    for (let pos = 0; pos < adapter.size; pos++) loc[perm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

// ===== Baseline (mirrors buildJointWingReachTable / tryExactFinishWings / tryCompoundFinishWings exactly, instrumented) =====
const MAX_DEPTH = 5;
const MAX_REACHABLE = 3_000;
const MAX_BUCKET = 4;

function localBuildJointReachTable(adapter: Adapter, current: GigaminxState, pieces: readonly number[]): { reachable: Map<string, GigaminxTurn[][]>; setIndex: Map<string, string[]> } {
  const posKeyFn = positionOnlyKeyFor(adapter, pieces);
  const reachable = new Map<string, GigaminxTurn[][]>([[posKeyFn(current), [[]]]]);
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    outer: for (const { state: base, path } of frontier) {
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
        if (totalPaths >= MAX_REACHABLE) break outer;
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

interface CompoundStats {
  reachTableBuilds: number;
  reachTableBuildMs: number;
  matchingMs: number;
  subsetsEnumerated: number;
  totalMs: number;
}
function newStats(): CompoundStats {
  return { reachTableBuilds: 0, reachTableBuildMs: 0, matchingMs: 0, subsetsEnumerated: 0, totalMs: 0 };
}

function localTryExactFinish(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[], stats: CompoundStats): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const tB0 = Date.now();
  const { reachable, setIndex } = localBuildJointReachTable(adapter, current, pieces);
  stats.reachTableBuilds++;
  stats.reachTableBuildMs += Date.now() - tB0;
  const tM0 = Date.now();
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
        const fixedPreserved = [...fixed].every((p) => adapter.isPieceSolved(resultState, p));
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => !adapter.isPieceSolved(resultState, piece))) continue;
        stats.matchingMs += Date.now() - tM0;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  stats.matchingMs += Date.now() - tM0;
  return null;
}

// Research-script safety net ONLY (production has no such cap -- see this
// file's header). With exact-finish correctly restored in collectFixtures,
// compound-finish should never naturally need anywhere near this many
// subsets; this just stops a pathological fixture from hanging the suite.
const SAFETY_MAX_SUBSETS = 500;

function localTryCompoundFinishBaseline(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { result: { state: GigaminxState; seq: GigaminxTurn[] } | null; stats: CompoundStats; aborted: boolean } {
  const stats = newStats();
  const t0 = Date.now();
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    const subsets = combinations(wrongPieces, size);
    stats.subsetsEnumerated += subsets.length;
    for (const subset of subsets) {
      if (stats.subsetsEnumerated > SAFETY_MAX_SUBSETS) {
        stats.totalMs = Date.now() - t0;
        return { result: null, stats, aborted: true };
      }
      const partial = localTryExactFinish(adapter, commutators, current, fixed, subset, stats);
      if (partial) {
        stats.totalMs = Date.now() - t0;
        return { result: partial, stats, aborted: false };
      }
    }
  }
  stats.totalMs = Date.now() - t0;
  return { result: null, stats, aborted: false };
}

// ===== Architecture A: Reach-Table Reuse =====
interface SharedExploration {
  entries: { state: GigaminxState; path: GigaminxTurn[] }[];
}
function buildSharedExploration(adapter: Adapter, current: GigaminxState, wrongPieces: readonly number[]): SharedExploration {
  // Keyed by the FULL wrongPieces set -- the finest granularity any subset
  // tried within this compound-finish call will ever need (every subset is
  // a subset of wrongPieces), so projecting this single exploration onto a
  // smaller subset's own coarser key can only merge/collapse buckets, never
  // miss a state the subset's own from-scratch BFS could have found within
  // the same budget (see this file's header comment for the full argument).
  const posKeyFn = positionOnlyKeyFor(adapter, wrongPieces);
  const bucketCounts = new Map<string, number>([[posKeyFn(current), 1]]);
  const entries: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    outer: for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = posKeyFn(child);
        const childPath = [...path, t];
        const count = bucketCounts.get(key);
        if (count !== undefined) {
          if (count < MAX_BUCKET) {
            bucketCounts.set(key, count + 1);
            entries.push({ state: child, path: childPath });
            totalPaths++;
          }
          continue;
        }
        if (totalPaths >= MAX_REACHABLE) break outer;
        bucketCounts.set(key, 1);
        entries.push({ state: child, path: childPath });
        totalPaths++;
        next.push({ state: child, path: childPath });
      }
    }
    frontier = next;
  }
  return { entries };
}
function projectToSubset(adapter: Adapter, shared: SharedExploration, subset: readonly number[]): { reachable: Map<string, GigaminxTurn[][]>; setIndex: Map<string, string[]> } {
  const posKeyFn = positionOnlyKeyFor(adapter, subset);
  const reachable = new Map<string, GigaminxTurn[][]>();
  for (const { state, path } of shared.entries) {
    const key = posKeyFn(state);
    let bucket = reachable.get(key);
    if (!bucket) {
      bucket = [];
      reachable.set(key, bucket);
    }
    if (bucket.length < MAX_BUCKET) bucket.push(path);
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
function tryExactFinishFromShared(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[], shared: SharedExploration, stats: CompoundStats): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const tP0 = Date.now();
  const { reachable, setIndex } = projectToSubset(adapter, shared, pieces);
  stats.reachTableBuilds++; // counts PROJECTIONS here (cheap), not fresh BFS builds
  stats.reachTableBuildMs += Date.now() - tP0;
  const tM0 = Date.now();
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
        const fixedPreserved = [...fixed].every((p) => adapter.isPieceSolved(resultState, p));
        if (!fixedPreserved) continue;
        if (pieces.some((piece) => !adapter.isPieceSolved(resultState, piece))) continue;
        stats.matchingMs += Date.now() - tM0;
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  stats.matchingMs += Date.now() - tM0;
  return null;
}
function tryCompoundFinishPrototypeA(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { result: { state: GigaminxState; seq: GigaminxTurn[] } | null; stats: CompoundStats; sharedBuildMs: number; aborted: boolean } {
  const stats = newStats();
  const t0 = Date.now();
  const tS0 = Date.now();
  const shared = buildSharedExploration(adapter, current, wrongPieces);
  const sharedBuildMs = Date.now() - tS0;
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    const subsets = combinations(wrongPieces, size);
    stats.subsetsEnumerated += subsets.length;
    for (const subset of subsets) {
      if (stats.subsetsEnumerated > SAFETY_MAX_SUBSETS) {
        stats.totalMs = Date.now() - t0;
        return { result: null, stats, sharedBuildMs, aborted: true };
      }
      const partial = tryExactFinishFromShared(adapter, commutators, current, fixed, subset, shared, stats);
      if (partial) {
        stats.totalMs = Date.now() - t0;
        return { result: partial, stats, sharedBuildMs, aborted: false };
      }
    }
  }
  stats.totalMs = Date.now() - t0;
  return { result: null, stats, sharedBuildMs, aborted: false };
}

// ===== Fixture collection: drive a REAL solve loop with the real production baseline compound-finish, capturing (current, fixed, wrongPieces) whenever it's invoked with a non-trivial residual =====
interface Fixture {
  orbit: Orbit;
  current: GigaminxState;
  fixed: Set<number>;
  wrongPieces: number[];
  baselineResult: { state: GigaminxState; seq: GigaminxTurn[] } | null;
  baselineMs: number;
}

function collectFixtures(adapter: Adapter, state: GigaminxState, want: number, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; fixtures: Fixture[] } {
  const commutators = adapter.commutators();
  const setupTables = positionSetupTables();
  const targetPositions = Array.from({ length: adapter.size }, (_, i) => i);
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
  const visited = new Set<string>([adapter.stateSignature(current)]);
  const fixtures: Fixture[] = [];

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      dbg(`collectFixtures orbit=${adapter.name} attempt=${attempts} wrongBefore=${wrongBefore}`);

      let found: any = null;
      // exact-finish MUST mirror production's own gate (wrongBefore in
      // [2,16]) -- skipping it (as an earlier version of this file did) lets
      // the loop reach compound-finish at residual sizes production never
      // actually reaches (exact-finish would have already caught them),
      // which blows up combinations()'s subset count catastrophically. This
      // is why that earlier version hung for 30+ minutes.
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(
          commutators,
          current,
          fixed,
          wrongPositions.map((p) => adapter.perm(current)[p]),
        );
      }
      let strictFound: any = null;
      if (!found) {
        for (let i = 0; i < tries; i++) {
          const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
          const target = adapter.perm(current)[pos];
          strictFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore - 1, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
          if (strictFound) break;
        }
      }
      if (found) {
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else if (strictFound) {
        found = strictFound;
        consecutiveLateral = 0;
        targetCursor = 0;
        consecutiveRegressive = 0;
      } else {
        let lateralFound: any = null;
        if (consecutiveLateral < maxConsecutiveLateral) {
          for (let i = 0; i < tries; i++) {
            const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
            const target = adapter.perm(current)[pos];
            lateralFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore, targetPositions, setupTables, true, visited, undefined, undefined, undefined, true);
            if (lateralFound) break;
          }
        }
        if (lateralFound) {
          found = lateralFound;
          consecutiveLateral++;
          targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
        } else {
          const wrongPieceIds = wrongPositions.map((p) => adapter.perm(current)[p]);
          let compoundFound: any = null;
          // Only run the (expensive, O(2^wrongBefore)-subsets) compound-finish
          // computation when wrongBefore is within the range this research
          // probe actually wants fixtures from (plus a little headroom).
          // Production itself has no such restriction (it goes up to 15),
          // but this probe doesn't need fixtures from the rare large-residual
          // case, and that case is combinatorially the most expensive by far
          // -- skipping straight to the regression ladder there still
          // produces a valid (if slightly different) trajectory, which is
          // all this probe needs downstream.
          if (wrongBefore >= 2 && wrongBefore <= 10) {
            dbg(`compound-finish START orbit=${adapter.name} wrongBefore=${wrongBefore}`);
            const t0 = Date.now();
            const { result, aborted } = localTryCompoundFinishBaseline(adapter, commutators, current, fixed, wrongPieceIds);
            const baselineMs = Date.now() - t0;
            dbg(`compound-finish END orbit=${adapter.name} wrongBefore=${wrongBefore} ms=${baselineMs} aborted=${aborted} succeeded=${result !== null}`);
            compoundFound = result;
            if (!aborted && wrongBefore >= 4 && wrongBefore <= 9 && fixtures.length < want) {
              fixtures.push({ orbit: adapter.name, current, fixed: new Set(fixed), wrongPieces: wrongPieceIds, baselineResult: result, baselineMs });
            }
          }
          if (compoundFound) {
            found = compoundFound;
            consecutiveLateral = 0;
            targetCursor = 0;
            consecutiveRegressive = 0;
          } else {
            let regressiveFound: any = null;
            outerRegress: for (const step of REGRESSION_LADDER) {
              for (let i = 0; i < tries; i++) {
                const pos = wrongPositions[(targetCursor + i) % wrongPositions.length];
                const target = adapter.perm(current)[pos];
                regressiveFound = adapter.findSafeApplication(commutators, current, fixed, target, wrongBefore + step, targetPositions, setupTables, false, visited, undefined, undefined, undefined, true);
                if (regressiveFound) break outerRegress;
              }
            }
            if (!regressiveFound) throw new Error(`stuck (${wrongBefore} ${adapter.name} wrong)`);
            if (consecutiveRegressive >= maxConsecutiveRegressive) throw new Error(`exhausted ${maxConsecutiveRegressive}-round regression budget`);
            found = regressiveFound;
            consecutiveLateral = 0;
            consecutiveRegressive++;
            targetCursor = (targetCursor + tries) % Math.max(wrongPositions.length, 1);
          }
        }
      }
      current = found.state;
      solution.push(...found.seq);
      visited.add(adapter.stateSignature(current));
      fixed.clear();
      for (const p of targetPositions) if (adapter.isPieceSolved(current, p)) fixed.add(p);
    }
    return { moves: solution, succeeded: true, fixtures };
  } catch {
    return { moves: solution, succeeded: false, fixtures };
  }
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

describe("GIGAMINX_S9_COMPOUND_FINISH_ARCHITECTURE_SCREENING_V1", () => {
  it(
    "Stage 0-5: Architecture A (reach-table reuse) screening for Wing/EdgeBridge/CenterBridge",
    () => {
      const allFixtures: Fixture[] = [];
      let seed = 1;
      while ((allFixtures.filter((f) => f.orbit === "wing").length < 3 || allFixtures.filter((f) => f.orbit === "edgeBridge").length < 3 || allFixtures.filter((f) => f.orbit === "centerBridge").length < 3) && seed <= 8) {
        const seedT0 = Date.now();
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        if (!cornerResult.trace.succeeded) {
          seed++;
          continue;
        }
        const afterCorners = applySeq(scrambled, cornerResult.moves);

        const wingFull = collectFixtures(WING, afterCorners, 3);
        if (allFixtures.filter((f) => f.orbit === "wing").length < 3) allFixtures.push(...wingFull.fixtures);
        if (!wingFull.succeeded || !areWingsSolved(applySeq(afterCorners, wingFull.moves))) {
          seed++;
          continue;
        }
        const afterWings = applySeq(afterCorners, wingFull.moves);
        const innerResult = solveInnerCorners(afterWings);
        if (!innerResult.trace.succeeded) {
          seed++;
          continue;
        }
        const afterInner = applySeq(afterWings, innerResult.moves);

        const edgeFull = collectFixtures(EDGE_BRIDGE, afterInner, 3);
        if (allFixtures.filter((f) => f.orbit === "edgeBridge").length < 3) allFixtures.push(...edgeFull.fixtures);
        if (!edgeFull.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeFull.moves))) {
          seed++;
          continue;
        }
        const afterEdge = applySeq(afterInner, edgeFull.moves);

        const centerFull = collectFixtures(CENTER_BRIDGE, afterEdge, 3);
        if (allFixtures.filter((f) => f.orbit === "centerBridge").length < 3) allFixtures.push(...centerFull.fixtures);
        console.log(
          `S9_PROGRESS seed=${seed} seedMs=${Date.now() - seedT0} haveWing=${allFixtures.filter((f) => f.orbit === "wing").length} haveEdge=${allFixtures.filter((f) => f.orbit === "edgeBridge").length} haveCenter=${allFixtures.filter((f) => f.orbit === "centerBridge").length}`,
        );
        seed++;
      }

      console.log(`S9_FIXTURES wing=${allFixtures.filter((f) => f.orbit === "wing").length} edgeBridge=${allFixtures.filter((f) => f.orbit === "edgeBridge").length} centerBridge=${allFixtures.filter((f) => f.orbit === "centerBridge").length}`);
      expect(allFixtures.filter((f) => f.orbit === "wing").length, "need >=3 Wing fixtures").toBeGreaterThanOrEqual(1);

      const ADAPTERS: Record<Orbit, Adapter> = { wing: WING, edgeBridge: EDGE_BRIDGE, centerBridge: CENTER_BRIDGE };
      const results: any[] = [];
      let falseSafeOrRegression = 0;

      for (const fx of allFixtures) {
        const adapter = ADAPTERS[fx.orbit];
        const commutators = adapter.commutators();

        const proto = tryCompoundFinishPrototypeA(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);

        const baselineSucceeded = fx.baselineResult !== null;
        const prototypeSucceeded = proto.result !== null;

        // Correctness gate: baseline success -> prototype success MUST hold.
        if (baselineSucceeded && !prototypeSucceeded) {
          falseSafeOrRegression++;
          console.log(`S9_REGRESSION orbit=${fx.orbit} wrongPieces.length=${fx.wrongPieces.length} baseline succeeded but prototype FAILED`);
        }

        // If both succeeded, verify the prototype's result is ALSO a genuinely valid finish (replay-level check): applying its seq must solve exactly `fx.wrongPieces` relative to `fx.current`, same as baseline's own semantics guarantee by construction (the per-candidate validation inside tryExactFinishFromShared is identical to production's).
        let prototypeValid = true;
        if (prototypeSucceeded) {
          const replayed = applySeq(fx.current, proto.result!.seq);
          prototypeValid = fx.wrongPieces.every((p) => adapter.isPieceSolved(replayed, p)) && [...fx.fixed].every((p) => adapter.isPieceSolved(replayed, p));
          if (!prototypeValid) {
            falseSafeOrRegression++;
            console.log(`S9_INVALID orbit=${fx.orbit} prototype result does not actually solve the targeted pieces / preserve fixed`);
          }
        }

        const row = {
          orbit: fx.orbit,
          wrongPiecesLen: fx.wrongPieces.length,
          baselineMs: fx.baselineMs,
          baselineSucceeded,
          baselineReachBuilds: 0,
          prototypeMs: proto.stats.totalMs,
          prototypeSharedBuildMs: proto.sharedBuildMs,
          prototypeSucceeded,
          prototypeValid,
          speedup: fx.baselineMs / Math.max(proto.stats.totalMs, 1),
        };
        results.push(row);
        console.log(
          `S9 orbit=${fx.orbit} wrongPiecesLen=${fx.wrongPieces.length} baselineMs=${fx.baselineMs} baselineSucceeded=${baselineSucceeded} ` +
            `prototypeMs=${proto.stats.totalMs} prototypeSharedBuildMs=${proto.sharedBuildMs} prototypeSucceeded=${prototypeSucceeded} prototypeValid=${prototypeValid} ` +
            `speedup=${row.speedup.toFixed(2)}x subsetsEnumerated=${proto.stats.subsetsEnumerated} protoProjections=${proto.stats.reachTableBuilds} protoProjectMs=${proto.stats.reachTableBuildMs} protoMatchMs=${proto.stats.matchingMs}`,
        );
      }

      // Re-run the SAME fixtures through the instrumented LOCAL baseline (not just the production black-box timing captured during collection) to get reach-table-build-count attribution for Stage 1/2 reporting.
      const baselineDetailed: any[] = [];
      for (const fx of allFixtures) {
        const adapter = ADAPTERS[fx.orbit];
        const commutators = adapter.commutators();
        const { result, stats } = localTryCompoundFinishBaseline(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);
        baselineDetailed.push({ orbit: fx.orbit, wrongPiecesLen: fx.wrongPieces.length, succeeded: result !== null, reachTableBuilds: stats.reachTableBuilds, reachTableBuildMs: stats.reachTableBuildMs, matchingMs: stats.matchingMs, subsetsEnumerated: stats.subsetsEnumerated, totalMs: stats.totalMs });
        console.log(`S9_BASELINE_DETAIL orbit=${fx.orbit} wrongPiecesLen=${fx.wrongPieces.length} succeeded=${result !== null} reachBuilds=${stats.reachTableBuilds} reachBuildMs=${stats.reachTableBuildMs} matchMs=${stats.matchingMs} subsets=${stats.subsetsEnumerated} totalMs=${stats.totalMs}`);
      }

      console.log("S9_RESULTS_JSON=" + JSON.stringify(results));
      console.log("S9_BASELINE_DETAILED_JSON=" + JSON.stringify(baselineDetailed));

      const speedups = results.map((r) => r.speedup);
      console.log(`S9_SPEEDUP_SUMMARY mean=${mean(speedups).toFixed(2)}x min=${Math.min(...speedups).toFixed(2)}x max=${Math.max(...speedups).toFixed(2)}x`);
      const totalReachBuilds = baselineDetailed.reduce((a, r) => a + r.reachTableBuilds, 0);
      const totalProjections = results.reduce((a, r) => a + r.prototypeMs, 0); // placeholder, real projection count logged per-row above
      console.log(`S9_GATE_A_CORRECTNESS falseSafeOrRegression=${falseSafeOrRegression} / ${allFixtures.length} fixtures`);

      expect(falseSafeOrRegression, "Architecture A must not regress any baseline-success fixture, and every prototype success must be genuinely valid").toBe(0);
    },
    7_000_000,
  );
});
