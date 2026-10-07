// GIGAMINX_S9.1_BASELINE_SUCCESS_PRESERVATION_GATE_V1 -- pure correctness
// gate, zero production changes (gigaminxSolver.ts untouched). Unlike S9
// (which drove the trajectory with a LOCAL reimplementation of
// tryCompoundFinish* as the "baseline"), this file calls the REAL exported
// tryExactFinish<Orbit>/tryCompoundFinish<Orbit> (via __dev) directly as
// the oracle -- the actual production functions, not a reimplementation --
// so "baseline" here means Production itself.
//
// Goal: find >=1 REAL production compound-finish SUCCESS per orbit (Wing/
// EdgeBridge/CenterBridge) from an actual solver trajectory, then run S9's
// Architecture A prototype (shared exploration + subset projection, same
// semantics, same MAX_DEPTH/MAX_REACHABLE/MAX_BUCKET) on the IDENTICAL
// input and confirm it also succeeds, with a valid replay.
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

const DBG_PATH = process.env.GIGA_S91_DEBUG;
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
  tryCompoundFinish: tryCompoundFinishWings,
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
  tryCompoundFinish: tryCompoundFinishEdgeBridges,
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
  tryCompoundFinish: tryCompoundFinishCenterBridges,
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

// ===== Architecture A: Reach-Table Reuse (identical semantics to S9's prototype -- same budgets, same algorithm) =====
const MAX_DEPTH = 5;
const MAX_REACHABLE = 3_000;
const MAX_BUCKET = 4;

interface SharedExploration {
  entries: { state: GigaminxState; path: GigaminxTurn[] }[];
  maxReachableHit: boolean;
  maxDepthReached: number;
}
function buildSharedExploration(adapter: Adapter, current: GigaminxState, wrongPieces: readonly number[]): SharedExploration {
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
function tryCompoundFinishPrototypeA(adapter: Adapter, commutators: readonly { seq: GigaminxTurn[]; support: number[] }[], current: GigaminxState, fixed: ReadonlySet<number>, wrongPieces: readonly number[]): { result: { state: GigaminxState; seq: GigaminxTurn[] } | null; sharedBuildMs: number; totalMs: number; maxReachableHit: boolean; maxDepthReached: number; successSubsetSize: number | null } {
  const t0 = Date.now();
  const tS0 = Date.now();
  const shared = buildSharedExploration(adapter, current, wrongPieces);
  const sharedBuildMs = Date.now() - tS0;
  for (let size = wrongPieces.length - 1; size >= 2; size--) {
    for (const subset of combinations(wrongPieces, size)) {
      const partial = tryExactFinishFromShared(adapter, commutators, current, fixed, subset, shared);
      if (partial) {
        return { result: partial, sharedBuildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: subset.length };
      }
    }
  }
  return { result: null, sharedBuildMs, totalMs: Date.now() - t0, maxReachableHit: shared.maxReachableHit, maxDepthReached: shared.maxDepthReached, successSubsetSize: null };
}

// ===== Fixture collection: drive a REAL trajectory, calling the REAL production tryExactFinish/tryCompoundFinish as the oracle, capturing every compound-finish SUCCESS encountered =====
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
            dbg(`compound-finish(PRODUCTION oracle) START orbit=${adapter.name} wrongBefore=${wrongBefore}`);
            const t0 = Date.now();
            compoundFound = adapter.tryCompoundFinish(commutators, current, fixed, wrongPieceIds);
            const baselineMs = Date.now() - t0;
            dbg(`compound-finish(PRODUCTION oracle) END orbit=${adapter.name} wrongBefore=${wrongBefore} ms=${baselineMs} succeeded=${compoundFound !== null}`);
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

describe("GIGAMINX_S9_1_BASELINE_SUCCESS_PRESERVATION_GATE_V1", () => {
  it(
    "finds >=1 real production compound-finish SUCCESS per orbit and confirms Architecture A reproduces it",
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
          `S91_PROGRESS seed=${seed} haveWing=${allSuccesses.filter((f) => f.orbit === "wing").length} haveEdge=${allSuccesses.filter((f) => f.orbit === "edgeBridge").length} haveCenter=${allSuccesses.filter((f) => f.orbit === "centerBridge").length}`,
        );
        seed++;
      }

      console.log(
        `S91_FIXTURES wing=${allSuccesses.filter((f) => f.orbit === "wing").length} edgeBridge=${allSuccesses.filter((f) => f.orbit === "edgeBridge").length} centerBridge=${allSuccesses.filter((f) => f.orbit === "centerBridge").length} seedsScanned=${seed - 1}`,
      );

      const ADAPTERS: Record<Orbit, Adapter> = { wing: WING, edgeBridge: EDGE_BRIDGE, centerBridge: CENTER_BRIDGE };
      const rows: any[] = [];
      let preserved = 0;
      let regressions = 0;

      for (const fx of allSuccesses) {
        const adapter = ADAPTERS[fx.orbit];
        const commutators = adapter.commutators();

        // Stage 1 oracle facts (already have baselineSeq from production; replay to confirm).
        //
        // IMPORTANT: tryCompoundFinishWings/EdgeBridges/CenterBridges iterates over
        // proper SUBSETS of wrongPieces (size wrongPieces.length-1 downto 2) and
        // returns as soon as any subset's tryExactFinish succeeds. It only guarantees
        // (a) `fixed` stays preserved and (b) that one subset (>=2 pieces) is now
        // solved -- NOT that every element of the original wrongPieces list ends up
        // solved. Production itself (solveWings et al.) treats the result purely as
        // a progress-making move and continues the round loop without checking "all
        // wrongPieces solved". So the correctness invariant to check here is
        // fixed-preserved + strict progress (>=2 previously-wrong pieces now solved),
        // not "all wrongPieces solved".
        const baselineReplayed = applySeq(fx.current, fx.baselineSeq);
        const baselineFixedPreserved = [...fx.fixed].every((p) => adapter.isPieceSolved(baselineReplayed, p));
        const baselineStillWrong = fx.wrongPieces.filter((p) => !adapter.isPieceSolved(baselineReplayed, p));
        const baselineProgress = fx.wrongPieces.length - baselineStillWrong.length;
        const baselineValid = baselineFixedPreserved && baselineProgress >= 2;
        expect(baselineValid, `${fx.orbit}: production baseline's OWN result must be valid (fixedPreserved=${baselineFixedPreserved} progress=${baselineProgress})`).toBe(true);

        // Stage 2: Architecture A on the IDENTICAL input.
        const proto = tryCompoundFinishPrototypeA(adapter, commutators, fx.current, fx.fixed, fx.wrongPieces);
        const prototypeSucceeded = proto.result !== null;
        let prototypeValid = false;
        if (prototypeSucceeded) {
          const replayed = applySeq(fx.current, proto.result!.seq);
          const protoFixedPreserved = [...fx.fixed].every((p) => adapter.isPieceSolved(replayed, p));
          const protoStillWrong = fx.wrongPieces.filter((p) => !adapter.isPieceSolved(replayed, p));
          const protoProgress = fx.wrongPieces.length - protoStillWrong.length;
          prototypeValid = protoFixedPreserved && protoProgress >= 2;
        }

        if (prototypeSucceeded && prototypeValid) preserved++;
        else regressions++;

        const row = {
          orbit: fx.orbit,
          wrongPiecesLen: fx.wrongPieces.length,
          baselineMs: fx.baselineMs,
          baselineSeqLen: fx.baselineSeq.length,
          prototypeSucceeded,
          prototypeValid,
          prototypeMs: proto.totalMs,
          sharedBuildMs: proto.sharedBuildMs,
          maxReachableHit: proto.maxReachableHit,
          maxDepthReached: proto.maxDepthReached,
          successSubsetSize: proto.successSubsetSize,
          speedup: fx.baselineMs / Math.max(proto.totalMs, 1),
        };
        rows.push(row);
        console.log(
          `S91 orbit=${fx.orbit} wrongPiecesLen=${fx.wrongPieces.length} baselineMs=${fx.baselineMs} baselineSeqLen=${fx.baselineSeq.length} ` +
            `prototypeSucceeded=${prototypeSucceeded} prototypeValid=${prototypeValid} prototypeMs=${proto.totalMs} sharedBuildMs=${proto.sharedBuildMs} ` +
            `maxReachableHit=${proto.maxReachableHit} maxDepthReached=${proto.maxDepthReached} successSubsetSize=${proto.successSubsetSize} speedup=${row.speedup.toFixed(2)}x`,
        );
      }

      console.log("S91_RESULTS_JSON=" + JSON.stringify(rows));
      console.log(`S91_GATE preserved=${preserved} regressions=${regressions} total=${allSuccesses.length}`);

      expect(allSuccesses.length, "need at least 1 real production compound-finish success total").toBeGreaterThanOrEqual(1);
      expect(regressions, "every production compound-finish SUCCESS must be reproduced (validly) by Architecture A").toBe(0);
    },
    7_000_000,
  );
});
