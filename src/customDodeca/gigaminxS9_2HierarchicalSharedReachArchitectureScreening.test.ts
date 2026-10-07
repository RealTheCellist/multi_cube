// GIGAMINX_S9.2_HIERARCHICAL_SHARED_REACH_ARCHITECTURE_SCREENING_V1 -- pure
// correctness/viability probe, zero production changes (gigaminxSolver.ts
// untouched). Reuses S9.1's real baseline-success fixtures (same seeded
// trajectory, deterministic) and S9's Architecture A prototype as the
// comparison baseline, then screens a new candidate: Architecture H
// (coarse->fine hierarchical shared exploration) -- same MAX_DEPTH/
// MAX_REACHABLE/MAX_BUCKET constants as production and Architecture A,
// only the KEY FUNCTION used for BFS dedup/pruning changes with depth
// (coarse key for shallow depths, fine key for deeper depths), to see if
// that avoids Architecture A's observed breadth-explosion-starves-depth
// failure mode (S9.1: edgeBridge wrongPiecesLen=7, baseline success ->
// Architecture A failure) while still keeping shared-exploration's cost
// savings over per-subset-fresh-BFS production.
import { describe, it, expect } from "vitest";
import { applyGigaminxMove, applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import { solveCorners, solveInnerCorners, areWingsSolved, areEdgeBridgesSolved, __dev } from "./gigaminxSolver";

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

const DBG_PATH = process.env.GIGA_S92_DEBUG;
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

function positionOnlyKeyFor(adapter: Adapter, pieces: readonly number[]): (s: GigaminxState) => string {
  const sorted = [...pieces].sort((a, b) => a - b);
  return (s: GigaminxState) => {
    const loc = new Array<number>(adapter.size);
    const perm = adapter.perm(s);
    for (let pos = 0; pos < adapter.size; pos++) loc[perm[pos]] = pos;
    return sorted.map((piece) => loc[piece]).join(",");
  };
}

// ===== Shared budgets -- IDENTICAL to production's buildJointReachTable and
// to S9/S9.1's Architecture A. Never changed by either architecture below. =====
const MAX_DEPTH = 5;
const MAX_REACHABLE = 3_000;
const MAX_BUCKET = 4;

interface SharedExploration {
  entries: { state: GigaminxState; path: GigaminxTurn[] }[];
  maxReachableHit: boolean;
  maxDepthReached: number;
}

// ===== Architecture A (S9/S9.1, unmodified): single fine-key (full wrongPieces) BFS =====
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

// ===== Architecture H (NEW, this Sprint): coarse->fine hierarchical shared
// exploration. ONE BFS, SAME totalPaths budget (3000) and SAME MAX_DEPTH (5)
// as Architecture A / production -- nothing increased. The only change is
// WHICH key function is used for dedup/pruning at a given depth: a coarse
// key (small, fixed representative subset of wrongPieces -- explicitly
// permitted "position-level grouping" info per the Sprint spec) for shallow
// depths, and the fine key (full wrongPieces, same as Architecture A) for
// deeper depths. Rationale (from S9.1's root-cause analysis): breadth
// explosion that starves the budget happens because the FINE key has few
// collisions, so almost every move at shallow depths creates a brand-new
// key and gets added to the frontier. A coarse key at those same shallow
// depths collides heavily, so most of those moves become free
// bucket-fills (no budget cost, no frontier growth) -- conserving budget
// for the deeper, narrower exploration once we switch to the fine key. =====
function buildHierarchicalExploration(adapter: Adapter, current: GigaminxState, wrongPieces: readonly number[], coarseSubset: readonly number[], splitDepth: number): SharedExploration {
  const coarseKeyFn = positionOnlyKeyFor(adapter, coarseSubset);
  const fineKeyFn = positionOnlyKeyFor(adapter, wrongPieces);
  const seedKey = (0 < splitDepth ? coarseKeyFn : fineKeyFn)(current);
  const bucketCounts = new Map<string, number>([[seedKey, 1]]);
  const entries: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  let totalPaths = 1;
  let frontier: { state: GigaminxState; path: GigaminxTurn[] }[] = [{ state: current, path: [] }];
  let maxReachableHit = false;
  let maxDepthReached = 0;
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && totalPaths < MAX_REACHABLE; depth++) {
    maxDepthReached = depth + 1;
    const keyFn = depth < splitDepth ? coarseKeyFn : fineKeyFn;
    const next: { state: GigaminxState; path: GigaminxTurn[] }[] = [];
    outer: for (const { state: base, path } of frontier) {
      for (const t of ALL_MOVES) {
        const child = applyGigaminxMove(base, t.face, t.sign, t.depth);
        const key = keyFn(child);
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
  buildMs: number;
  totalMs: number;
  maxReachableHit: boolean;
  maxDepthReached: number;
  successSubsetSize: number | null;
}
function tryCompoundFinishPrototypeA(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): CompoundResult {
  const t0 = Date.now();
  const shared = buildSharedExplorationA(adapter, current, wrongPieces);
  const buildMs = Date.now() - t0;
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishFromShared(adapter, commutators, current, fixed, subset, shared);
      if (partial) {
        return { result: partial, buildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: subset.length };
      }
    }
  }
  return { result: null, buildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: null };
}
// Fixed architectural parameters for Architecture H -- chosen once, applied
// identically to every fixture/orbit (not tuned per-fixture, not a new
// matching heuristic): coarseSubset = first min(2, len) elements of
// wrongPieces (smallest usable subset size per tryExactFinish's size>=2
// floor); splitDepth=2 (S9.1 measured Architecture A saturating
// MAX_REACHABLE at exactly maxDepthReached=2 on every single fixture, so
// depths 0-1 are precisely the shallow/breadth-heavy region to protect).
const H_SPLIT_DEPTH = 2;
function tryCompoundFinishArchitectureH(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): CompoundResult {
  const t0 = Date.now();
  const coarseSubset = wrongPieces.slice(0, Math.min(2, wrongPieces.length));
  const shared = buildHierarchicalExploration(adapter, current, wrongPieces, coarseSubset, H_SPLIT_DEPTH);
  const buildMs = Date.now() - t0;
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishFromShared(adapter, commutators, current, fixed, subset, shared);
      if (partial) {
        return { result: partial, buildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: subset.length };
      }
    }
  }
  return { result: null, buildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: null };
}

// ===== Fixture collection: IDENTICAL to S9.1 -- drive a REAL trajectory,
// calling the REAL production tryExactFinish/tryCompoundFinish as the
// oracle, capturing every compound-finish SUCCESS encountered. Same seeds,
// same logic -> deterministically reproduces S9.1's exact 4 fixtures. =====
interface SuccessFixture {
  orbit: Orbit;
  current: GigaminxState;
  fixed: Set<number>;
  wrongPieces: number[];
  baselineSeq: GigaminxTurn[];
  baselineMs: number;
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

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

describe("GIGAMINX_S9_2_HIERARCHICAL_SHARED_REACH_ARCHITECTURE_SCREENING_V1", () => {
  it(
    "screens Architecture H (coarse->fine hierarchical shared exploration) against the real baseline-success fixtures that broke Architecture A",
    () => {
      const allSuccesses: SuccessFixture[] = [];
      let seed = 1;
      while ((allSuccesses.filter((f) => f.orbit === "wing").length < 2 || allSuccesses.filter((f) => f.orbit === "edgeBridge").length < 2 || allSuccesses.filter((f) => f.orbit === "centerBridge").length < 2) && seed <= SEEDS.length) {
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

        dbg(
          `S92_PROGRESS seed=${seed} haveWing=${allSuccesses.filter((f) => f.orbit === "wing").length} haveEdge=${allSuccesses.filter((f) => f.orbit === "edgeBridge").length} haveCenter=${allSuccesses.filter((f) => f.orbit === "centerBridge").length}`,
        );
        seed++;
      }

      console.log(
        `S92_FIXTURES wing=${allSuccesses.filter((f) => f.orbit === "wing").length} edgeBridge=${allSuccesses.filter((f) => f.orbit === "edgeBridge").length} centerBridge=${allSuccesses.filter((f) => f.orbit === "centerBridge").length} seedsScanned=${seed - 1}`,
      );
      expect(allSuccesses.length, "need the same real production compound-finish SUCCESS fixtures S9.1 found").toBeGreaterThanOrEqual(3);

      const ADAPTERS: Record<Orbit, Adapter> = { wing: WING, edgeBridge: EDGE_BRIDGE, centerBridge: CENTER_BRIDGE };
      const rows: any[] = [];
      let preservedByA = 0;
      let regressionsByA = 0;
      let preservedByH = 0;
      let regressionsByH = 0;
      let criticalFixtureRow: any = null;

      for (const fx of allSuccesses) {
        const adapter = ADAPTERS[fx.orbit];
        const commutators = adapter.commutators();

        // Stage 1 oracle facts (same progress-based validity check as S9.1 --
        // tryCompoundFinish* only guarantees a SUBSET of wrongPieces gets
        // solved while `fixed` stays preserved, never "all wrongPieces solved").
        const baselineReplayed = applySeq(fx.current, fx.baselineSeq);
        const baselineFixedPreserved = [...fx.fixed].every((p) => adapter.isPieceSolved(baselineReplayed, p));
        const baselineStillWrong = fx.wrongPieces.filter((p) => !adapter.isPieceSolved(baselineReplayed, p));
        const baselineProgress = fx.wrongPieces.length - baselineStillWrong.length;
        const baselineValid = baselineFixedPreserved && baselineProgress >= 2;
        expect(baselineValid, `${fx.orbit}: production baseline's OWN result must be valid (fixedPreserved=${baselineFixedPreserved} progress=${baselineProgress})`).toBe(true);

        // Stage 0: Architecture A on the IDENTICAL input (reproduce S9.1).
        const a = tryCompoundFinishPrototypeA(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);
        let aValid = false;
        if (a.result) {
          const replayed = applySeq(fx.current, a.result.seq);
          const fixedOk = [...fx.fixed].every((p) => adapter.isPieceSolved(replayed, p));
          const stillWrong = fx.wrongPieces.filter((p) => !adapter.isPieceSolved(replayed, p));
          aValid = fixedOk && fx.wrongPieces.length - stillWrong.length >= 2;
        }
        if (a.result && aValid) preservedByA++;
        else regressionsByA++;

        // Stage 2/3: Architecture H on the IDENTICAL input.
        const h = tryCompoundFinishArchitectureH(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);
        let hValid = false;
        if (h.result) {
          const replayed = applySeq(fx.current, h.result.seq);
          const fixedOk = [...fx.fixed].every((p) => adapter.isPieceSolved(replayed, p));
          const stillWrong = fx.wrongPieces.filter((p) => !adapter.isPieceSolved(replayed, p));
          hValid = fixedOk && fx.wrongPieces.length - stillWrong.length >= 2;
        }
        if (h.result && hValid) preservedByH++;
        else regressionsByH++;

        const row = {
          orbit: fx.orbit,
          wrongPiecesLen: fx.wrongPieces.length,
          baselineMs: fx.baselineMs,
          baselineSeqLen: fx.baselineSeq.length,
          aSucceeded: a.result !== null,
          aValid,
          aMs: a.totalMs,
          aMaxReachableHit: a.maxReachableHit,
          aMaxDepthReached: a.maxDepthReached,
          hSucceeded: h.result !== null,
          hValid,
          hMs: h.totalMs,
          hMaxReachableHit: h.maxReachableHit,
          hMaxDepthReached: h.maxDepthReached,
          hSuccessSubsetSize: h.successSubsetSize,
          hSeqLen: h.result ? h.result.seq.length : null,
        };
        rows.push(row);
        console.log(
          `S92 orbit=${fx.orbit} wrongPiecesLen=${fx.wrongPieces.length} baselineMs=${fx.baselineMs} baselineSeqLen=${fx.baselineSeq.length} ` +
            `aSucceeded=${row.aSucceeded} aValid=${row.aValid} aMs=${row.aMs} aMaxDepthReached=${row.aMaxDepthReached} aMaxReachableHit=${row.aMaxReachableHit} ` +
            `hSucceeded=${row.hSucceeded} hValid=${row.hValid} hMs=${row.hMs} hMaxDepthReached=${row.hMaxDepthReached} hMaxReachableHit=${row.hMaxReachableHit} hSuccessSubsetSize=${row.hSuccessSubsetSize} hSeqLen=${row.hSeqLen}`,
        );

        if (fx.orbit === "edgeBridge" && fx.wrongPieces.length === 7) criticalFixtureRow = row;
      }

      console.log("S92_RESULTS_JSON=" + JSON.stringify(rows));
      console.log(`S92_GATE_A preserved=${preservedByA} regressions=${regressionsByA} total=${allSuccesses.length}`);
      console.log(`S92_GATE_H preserved=${preservedByH} regressions=${regressionsByH} total=${allSuccesses.length}`);
      if (criticalFixtureRow) {
        console.log(`S92_CRITICAL aFailureReproduced=${!criticalFixtureRow.aSucceeded || !criticalFixtureRow.aValid} hSucceeded=${criticalFixtureRow.hSucceeded} hValid=${criticalFixtureRow.hValid} hMaxDepthReached=${criticalFixtureRow.hMaxDepthReached} hMaxReachableHit=${criticalFixtureRow.hMaxReachableHit}`);
      } else {
        console.log("S92_CRITICAL fixture (edgeBridge wrongPiecesLen=7) NOT present in this run's fixture set");
      }
    },
    7_000_000,
  );
});
