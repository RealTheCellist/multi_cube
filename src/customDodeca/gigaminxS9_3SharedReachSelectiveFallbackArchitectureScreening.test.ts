// GIGAMINX_S9.3_SHARED_REACH_SELECTIVE_FALLBACK_ARCHITECTURE_SCREENING_V1 --
// pure correctness/cost-effectiveness probe, zero production changes
// (gigaminxSolver.ts untouched). Architecture F = "shared-first, selective
// fallback": try S9 Architecture A (single fine-key shared BFS) first; if
// it fails, fall back to calling the REAL, unmodified production
// tryCompoundFinish<Orbit> (the exact per-subset-fresh-BFS algorithm) with
// no modification whatsoever. This Sprint measures (a) correctness on the
// 4 real baseline-success fixtures from S9.1 (fallback == production, so
// correctness is almost definitional -- the real question is whether the
// wiring is bug-free) and (b) how often fallback actually triggers across
// real full-solve trajectories, and whether the resulting total compound-
// finish cost is meaningfully lower than production's own cost.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, areWingsSolved, areEdgeBridgesSolved, areCenterBridgesSolved, __dev } from "./gigaminxSolver";

const {
  wingCommutators,
  findSafeWingApplication,
  tryExactFinishWings,
  tryCompoundFinishWings,
  edgeBridgeCommutators,
  findSafeEdgeBridgeApplication,
  tryExactFinishEdgeBridges,
  tryCompoundFinishEdgeBridges,
  centerBridgeCommutators,
  findSafeCenterBridgeApplication,
  tryExactFinishCenterBridges,
  tryCompoundFinishCenterBridges,
  positionSetupTables,
} = __dev as any;

const DBG_PATH = process.env.GIGA_S93_DEBUG;
function dbg(msg: string) {
  if (!DBG_PATH) return;
  require("node:fs").appendFileSync(DBG_PATH, `[${Date.now()}] ${msg}\n`);
}

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
function buildAllMoves(): GigaminxTurn[] {
  const FACES = Array.from({ length: 12 }, (_, i) => i) as any;
  const out: GigaminxTurn[] = [];
  for (const face of FACES) for (const depth of [1, 2, 3, 4] as const) for (const sign of [1, -1] as const) out.push({ face, sign, depth });
  return out;
}
const ALL_MOVES: readonly GigaminxTurn[] = buildAllMoves();

type Orbit = "wing" | "edgeBridge" | "centerBridge";
interface Adapter {
  name: Orbit;
  size: number;
  perm: (s: GigaminxState) => Int8Array;
  isPieceSolved: (s: GigaminxState, pos: number) => boolean;
  stateSignature: (s: GigaminxState) => string;
  commutators: () => { seq: GigaminxTurn[]; support: number[]; move: GigaminxState }[];
  findSafeApplication: (...args: any[]) => any;
  tryExactFinish: (...args: any[]) => any;
  tryCompoundFinish: (...args: any[]) => any;
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
  tryCompoundFinish: tryCompoundFinishWings,
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
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
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
  tryCompoundFinish: tryCompoundFinishCenterBridges,
};
const ADAPTERS: Record<Orbit, Adapter> = { wing: WING, edgeBridge: EDGE_BRIDGE, centerBridge: CENTER_BRIDGE };

function positionOnlyKeyFor(adapter: Adapter, pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(adapter.size);
    const perm = adapter.perm(s);
    for (let pos = 0; pos < adapter.size; pos++) loc[perm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

// ===== S9 Architecture A, UNMODIFIED -- the "shared-first" half of Architecture F =====
const MAX_DEPTH = 5;
const MAX_REACHABLE = 3_000;
const MAX_BUCKET = 4;
interface SharedExploration {
  entries: { state: GigaminxState; path: GigaminxTurn[] }[];
  maxReachableHit: boolean;
  maxDepthReached: number;
}
function buildSharedExplorationA(adapter: Adapter, current: GigaminxState, wrongPieces: readonly number[]): SharedExploration {
  const posKeyFn = positionOnlyKeyFor(adapter, wrongPieces);
  const bucketCounts = new Map<string, number>([[posKeyFn(current), 1]]);
  const entries: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  let maxReachableHit = false;
  let maxDepthReached = 0;
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    maxDepthReached = depth + 1;
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
        if (totalPaths >= MAX_REACHABLE) {
          maxReachableHit = true;
          break outer;
        }
        bucketCounts.set(key, 1);
        entries.push({ state: child, path: childPath });
        totalPaths++;
        next.push({ state: child, path: childPath });
      }
    }
    frontier = next;
  }
  return { entries, maxReachableHit, maxDepthReached };
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
function tryExactFinishFromShared(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, pieces: readonly number[], shared: SharedExploration): { state: GigaminxState; seq: GigaminxTurn[] } | null {
  const matchingEntries = commutators.filter((c) => c.support.length === pieces.length);
  if (matchingEntries.length === 0) return null;
  const { reachable, setIndex } = projectToSubset(adapter, shared, pieces);
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
        return { state: resultState, seq: fullSeq };
      }
    }
  }
  return null;
}
interface CompoundResult {
  result: { state: GigaminxState; seq: GigaminxTurn[] } | null;
  totalMs: number;
}
function tryCompoundFinishPrototypeA(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): CompoundResult {
  const t0 = Date.now();
  const shared = buildSharedExplorationA(adapter, current, wrongPieces);
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishFromShared(adapter, commutators, current, fixed, subset, shared);
      if (partial) return { result: partial, totalMs: Date.now() - t0 };
    }
  }
  return { result: null, totalMs: Date.now() - t0 };
}
function isProgressValid(adapter: Adapter, fixed: ReadonlySet<number>, wrongPieces: readonly number[], replayed: GigaminxState): boolean {
  const fixedOk = [...fixed].every((p) => adapter.isPieceSolved(replayed, p));
  const stillWrong = wrongPieces.filter((p) => !adapter.isPieceSolved(replayed, p));
  return fixedOk && wrongPieces.length - stillWrong.length >= 2;
}

// ===== Architecture F: shared-first, selective fallback. Fallback is the
// REAL, unmodified production tryCompoundFinish<Orbit> -- no new search,
// no modification. =====
interface FResult {
  fSucceeded: boolean;
  fValid: boolean;
  seq: GigaminxTurn[] | null;
  sharedMs: number;
  sharedSucceeded: boolean;
  fallbackTriggered: boolean;
  fallbackMs: number;
  fallbackSucceeded: boolean;
  totalMs: number;
}
function tryCompoundFinishArchitectureF(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): FResult {
  const a = tryCompoundFinishPrototypeA(adapter, commutators, current, fixed, wrongPieces);
  let sharedSucceeded = false;
  if (a.result) {
    const replayed = applySeq(current, a.result.seq);
    sharedSucceeded = isProgressValid(adapter, fixed, wrongPieces, replayed);
  }
  if (sharedSucceeded) {
    return { fSucceeded: true, fValid: true, seq: a.result!.seq, sharedMs: a.totalMs, sharedSucceeded: true, fallbackTriggered: false, fallbackMs: 0, fallbackSucceeded: false, totalMs: a.totalMs };
  }
  const t0 = Date.now();
  const fallback = adapter.tryCompoundFinish(commutators, current, fixed, wrongPieces);
  const fallbackMs = Date.now() - t0;
  const fallbackSucceeded = fallback !== null;
  return {
    fSucceeded: fallbackSucceeded,
    fValid: fallbackSucceeded,
    seq: fallbackSucceeded ? fallback.seq : null,
    sharedMs: a.totalMs,
    sharedSucceeded: false,
    fallbackTriggered: true,
    fallbackMs,
    fallbackSucceeded,
    totalMs: a.totalMs + fallbackMs,
  };
}

// ===== Fixture collection: IDENTICAL to S9.1/S9.2 -- real trajectory, real
// production oracle, captures every compound-finish SUCCESS encountered. =====
interface SuccessFixture {
  orbit: Orbit;
  current: GigaminxState;
  fixed: Set<number>;
  wrongPieces: number[];
  baselineSeq: GigaminxTurn[];
  baselineMs: number;
}
// ===== Stage 3/4 instrumentation: every compound-finish CALL (success or
// failure), not just successes -- drives a REAL full-solve trajectory using
// the REAL production oracle throughout (so the sampled trajectory is
// unbiased/representative), and at each compound-finish decision point ALSO
// runs Architecture A for comparison (cheap: ~tens-hundreds of ms) without
// altering which result drives the trajectory forward. =====
interface CompoundCallRecord {
  orbit: Orbit;
  wrongBefore: number;
  baselineMs: number;
  baselineSucceeded: boolean;
  sharedMs: number;
  sharedSucceeded: boolean;
}
function runOrbitInstrumented(adapter: Adapter, state: GigaminxState, calls: CompoundCallRecord[], maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean } {
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

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);

      let found: any = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
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
          if (wrongBefore >= 2 && wrongBefore <= 15) {
            const t0 = Date.now();
            compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPieceIds);
            const baselineMs = Date.now() - t0;
            const a = tryCompoundFinishPrototypeA(adapter, commutators, current, fixed, wrongPieceIds);
            let sharedSucceeded = false;
            if (a.result) {
              const replayed = applySeq(current, a.result.seq);
              sharedSucceeded = isProgressValid(adapter, fixed, wrongPieceIds, replayed);
            }
            calls.push({ orbit: adapter.name, wrongBefore, baselineMs, baselineSucceeded: compoundFound !== null, sharedMs: a.totalMs, sharedSucceeded });
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
    return { moves: solution, succeeded: true };
  } catch {
    return { moves: solution, succeeded: false };
  }
}
function collectSuccessFixtures(adapter: Adapter, state: GigaminxState, wantSuccesses: number, maxAttempts = 400): { moves: GigaminxTurn[]; succeeded: boolean; successes: SuccessFixture[] } {
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
  const successes: SuccessFixture[] = [];

  try {
    while (targetPositions.some((p) => !adapter.isPieceSolved(current, p))) {
      attempts++;
      if (attempts > maxAttempts) throw new Error(`exceeded ${maxAttempts} attempts`);
      const wrongPositions = targetPositions.filter((p) => !adapter.isPieceSolved(current, p));
      const wrongBefore = wrongPositions.length;
      const tries = Math.min(TARGETS_PER_ROUND, wrongPositions.length);
      dbg(`collectSuccessFixtures orbit=${adapter.name} attempt=${attempts} wrongBefore=${wrongBefore} successesSoFar=${successes.length}`);

      let found: any = null;
      if (wrongBefore >= 2 && wrongBefore <= 16) {
        found = adapter.tryExactFinish(commutators, current, fixed, wrongPositions.map((p) => adapter.perm(current)[p]));
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
          if (wrongBefore >= 2 && wrongBefore <= 15) {
            const t0 = Date.now();
            compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPieceIds);
            const baselineMs = Date.now() - t0;
            if (compoundFound && successes.length < wantSuccesses) {
              successes.push({ orbit: adapter.name, current, fixed: new Set(fixed), wrongPieces: wrongPieceIds, baselineSeq: compoundFound.seq, baselineMs });
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
    return { moves: solution, succeeded: true, successes };
  } catch {
    return { moves: solution, succeeded: false, successes };
  }
}

const FIXTURE_SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
const TRAJECTORY_SEEDS = Array.from({ length: 15 }, (_, i) => i + 1);

describe("GIGAMINX_S9_3_SHARED_REACH_SELECTIVE_FALLBACK_ARCHITECTURE_SCREENING_V1", () => {
  it(
    "Architecture F (shared-first, selective production fallback): correctness on S9.1 fixtures + fallback-frequency/cost measurement on real full-solve trajectories",
    () => {
      // ===== Stage 0/1/2: correctness on the S9.1 real baseline-success fixtures =====
      const allSuccesses: SuccessFixture[] = [];
      let seed = 1;
      while ((allSuccesses.filter((f) => f.orbit === "wing").length < 2 || allSuccesses.filter((f) => f.orbit === "edgeBridge").length < 2 || allSuccesses.filter((f) => f.orbit === "centerBridge").length < 2) && seed <= FIXTURE_SEEDS.length) {
        const rng = mulberry32(seed * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        if (!cornerResult.trace.succeeded) {
          seed++;
          continue;
        }
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        const wingRun = collectSuccessFixtures(WING, afterCorners, 2);
        if (allSuccesses.filter((f) => f.orbit === "wing").length < 2) allSuccesses.push(...wingRun.successes);
        if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) {
          seed++;
          continue;
        }
        const afterWings = applySeq(afterCorners, wingRun.moves);
        const innerResult = solveInnerCorners(afterWings);
        if (!innerResult.trace.succeeded) {
          seed++;
          continue;
        }
        const afterInner = applySeq(afterWings, innerResult.moves);
        const edgeRun = collectSuccessFixtures(EDGE_BRIDGE, afterInner, 2);
        if (allSuccesses.filter((f) => f.orbit === "edgeBridge").length < 2) allSuccesses.push(...edgeRun.successes);
        if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) {
          seed++;
          continue;
        }
        const afterEdge = applySeq(afterInner, edgeRun.moves);
        const centerRun = collectSuccessFixtures(CENTER_BRIDGE, afterEdge, 2);
        if (allSuccesses.filter((f) => f.orbit === "centerBridge").length < 2) allSuccesses.push(...centerRun.successes);
        seed++;
      }
      console.log(
        `S93_FIXTURES wing=${allSuccesses.filter((f) => f.orbit === "wing").length} edgeBridge=${allSuccesses.filter((f) => f.orbit === "edgeBridge").length} centerBridge=${allSuccesses.filter((f) => f.orbit === "centerBridge").length} seedsScanned=${seed - 1}`,
      );
      expect(allSuccesses.length, "need the same real production compound-finish SUCCESS fixtures S9.1 found").toBeGreaterThanOrEqual(3);

      let correctnessPreserved = 0;
      let correctnessRegressions = 0;
      let criticalRow: any = null;
      for (const fx of allSuccesses) {
        const adapter = ADAPTERS[fx.orbit];
        const commutators = adapter.commutators();
        const f = tryCompoundFinishArchitectureF(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);
        let fReplayValid = false;
        if (f.seq) {
          const replayed = applySeq(fx.current, f.seq);
          fReplayValid = isProgressValid(adapter, fx.fixed, fx.wrongPieces, replayed);
        }
        if (f.fSucceeded && fReplayValid) correctnessPreserved++;
        else correctnessRegressions++;
        const row = { orbit: fx.orbit, wrongPiecesLen: fx.wrongPieces.length, baselineMs: fx.baselineMs, sharedMs: f.sharedMs, sharedSucceeded: f.sharedSucceeded, fallbackTriggered: f.fallbackTriggered, fallbackMs: f.fallbackMs, fallbackSucceeded: f.fallbackSucceeded, fSucceeded: f.fSucceeded, fReplayValid, fTotalMs: f.totalMs };
        console.log(
          `S93_FIXTURE orbit=${row.orbit} wrongPiecesLen=${row.wrongPiecesLen} baselineMs=${row.baselineMs} sharedMs=${row.sharedMs} sharedSucceeded=${row.sharedSucceeded} ` +
            `fallbackTriggered=${row.fallbackTriggered} fallbackMs=${row.fallbackMs} fallbackSucceeded=${row.fallbackSucceeded} fSucceeded=${row.fSucceeded} fReplayValid=${row.fReplayValid} fTotalMs=${row.fTotalMs}`,
        );
        if (fx.orbit === "edgeBridge" && fx.wrongPieces.length === 7) criticalRow = row;
      }
      console.log(`S93_CORRECTNESS_GATE preserved=${correctnessPreserved} regressions=${correctnessRegressions} total=${allSuccesses.length}`);
      if (criticalRow) {
        console.log(`S93_CRITICAL sharedSucceeded=${criticalRow.sharedSucceeded} fallbackTriggered=${criticalRow.fallbackTriggered} fallbackSucceeded=${criticalRow.fallbackSucceeded} fSucceeded=${criticalRow.fSucceeded}`);
      }

      // ===== Stage 3/4: fallback frequency + cost on real full-solve trajectories =====
      const calls: CompoundCallRecord[] = [];
      let fullSolvesAttempted = 0;
      let fullSolvesCompleted = 0;
      for (const s of TRAJECTORY_SEEDS) {
        fullSolvesAttempted++;
        const rng = mulberry32(s * 13 + 7);
        const scramble = randomGigaminxScramble(30, rng);
        const scrambled = applyGigaminxScramble(solvedGigaminxState(), scramble);
        const cornerResult = solveCorners(scrambled);
        if (!cornerResult.trace.succeeded) continue;
        const afterCorners = applySeq(scrambled, cornerResult.moves);
        const wingRun = runOrbitInstrumented(WING, afterCorners, calls);
        if (!wingRun.succeeded || !areWingsSolved(applySeq(afterCorners, wingRun.moves))) continue;
        const afterWings = applySeq(afterCorners, wingRun.moves);
        const innerResult = solveInnerCorners(afterWings);
        if (!innerResult.trace.succeeded) continue;
        const afterInner = applySeq(afterWings, innerResult.moves);
        const edgeRun = runOrbitInstrumented(EDGE_BRIDGE, afterInner, calls);
        if (!edgeRun.succeeded || !areEdgeBridgesSolved(applySeq(afterInner, edgeRun.moves))) continue;
        const afterEdge = applySeq(afterInner, edgeRun.moves);
        const centerRun = runOrbitInstrumented(CENTER_BRIDGE, afterEdge, calls);
        if (centerRun.succeeded && areCenterBridgesSolved(applySeq(afterEdge, centerRun.moves))) fullSolvesCompleted++;
        dbg(`S93_TRAJ seed=${s} callsSoFar=${calls.length} fullSolvesCompleted=${fullSolvesCompleted}`);
      }
      console.log(`S93_TRAJECTORIES attempted=${fullSolvesAttempted} completed=${fullSolvesCompleted} totalCompoundCalls=${calls.length}`);

      type Agg = { calls: number; sharedSuccess: number; fallback: number; baselineMs: number; fMs: number };
      function emptyAgg(): Agg {
        return { calls: 0, sharedSuccess: 0, fallback: 0, baselineMs: 0, fMs: 0 };
      }
      const byOrbit: Record<string, Agg> = { wing: emptyAgg(), edgeBridge: emptyAgg(), centerBridge: emptyAgg(), total: emptyAgg() };
      const byLen = new Map<number, Agg>();
      for (const c of calls) {
        const fMs = c.sharedSucceeded ? c.sharedMs : c.sharedMs + c.baselineMs;
        for (const bucket of [byOrbit[c.orbit], byOrbit.total]) {
          bucket.calls++;
          if (c.sharedSucceeded) bucket.sharedSuccess++;
          else bucket.fallback++;
          bucket.baselineMs += c.baselineMs;
          bucket.fMs += fMs;
        }
        if (!byLen.has(c.wrongBefore)) byLen.set(c.wrongBefore, emptyAgg());
        const lb = byLen.get(c.wrongBefore)!;
        lb.calls++;
        if (c.sharedSucceeded) lb.sharedSuccess++;
        else lb.fallback++;
        lb.baselineMs += c.baselineMs;
        lb.fMs += fMs;
      }
      for (const [orbit, agg] of Object.entries(byOrbit)) {
        const fallbackRate = agg.calls > 0 ? agg.fallback / agg.calls : 0;
        const speedup = agg.fMs > 0 ? agg.baselineMs / agg.fMs : 0;
        console.log(`S93_ORBIT_AGG orbit=${orbit} calls=${agg.calls} sharedSuccess=${agg.sharedSuccess} fallback=${agg.fallback} fallbackRate=${fallbackRate.toFixed(3)} baselineMs=${agg.baselineMs} fMs=${agg.fMs} speedup=${speedup.toFixed(2)}x`);
      }
      for (const [len, agg] of [...byLen.entries()].sort((a, b) => a[0] - b[0])) {
        const fallbackRate = agg.calls > 0 ? agg.fallback / agg.calls : 0;
        const speedup = agg.fMs > 0 ? agg.baselineMs / agg.fMs : 0;
        console.log(`S93_LEN_AGG wrongBefore=${len} calls=${agg.calls} sharedSuccess=${agg.sharedSuccess} fallback=${agg.fallback} fallbackRate=${fallbackRate.toFixed(3)} baselineMs=${agg.baselineMs} fMs=${agg.fMs} speedup=${speedup.toFixed(2)}x`);
      }
      console.log("S93_CALLS_JSON=" + JSON.stringify(calls));
    },
    7_000_000,
  );
});
