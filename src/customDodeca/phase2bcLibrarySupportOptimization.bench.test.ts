/**
 * MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_OPTIMIZATION_V1 -- real optimization
 * candidate Sprint (not pure measurement).
 *
 * The prior Sprint (PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1, Decision B) found
 * that phase2bc x edge x pair-anchor's winning commutators are 97.7%
 * support<=6, with support=7 rescuing a further 2.3% (19/843 successes) at
 * 65.4% of the failing calls' own scan cost. This Sprint turns that finding
 * into an actual candidate: it builds REAL, reduced equatorial-edge
 * libraries (maxSupport=7 and maxSupport=6, via the SAME buildCommutatorLibrary
 * production function with only the maxSupport argument changed) and runs
 * the REAL solver against them, gated on correctness/completeness/runtime.
 *
 * How this stays "isolated" without touching megaminxSolver.ts's own
 * decision logic: megaminxSolver.ts had a handful of ALREADY-EXISTING
 * declarations (buildCommutatorLibrary, EDGE_KIND/CORNER_KIND,
 * solveTargetPositionsPreferring, correctPositions, middleCornerLibrary,
 * equatorialEdgeLibrary, and the fixed-position/target-position constants
 * solveMiddleLayer itself uses) given `export` -- a pure visibility change,
 * confirmed zero-behavior-change by the full 23-test suite (identical cross
 * depths AND identical solveMegaminx solution lengths before/after). Nothing
 * about their own implementation changed. `solveMiddleLayerVariant` below is
 * a line-for-line copy of megaminxSolver.ts's own solveMiddleLayer (see its
 * own dev notes there) with ONE difference: the equatorial-edge step's
 * library is a parameter instead of the hardcoded `equatorialEdgeLibrary()`
 * call -- so the corner step, the BFS, try_candidate, anchor policy, and
 * every other phase's library are all the untouched production versions.
 *
 * Cache-safety note: buildCommutatorLibrary's on-disk cache is keyed by
 * `cacheKey` alone (see megaminxSolver.ts's own saveCachedLibrary), so
 * candidate builds use DISTINCT cache keys ("equatorialEdge_maxSupport7",
 * "equatorialEdge_maxSupport6") -- reusing "equatorialEdge" with a different
 * maxSupport would silently overwrite the real production cache file.
 */
import { describe, it, expect, vi } from "vitest";
import * as searchWasm from "./megaminxSearchWasm";
import { readReachLog, resetReachLog, type ReachLogEntry } from "./megaminxSearchWasm";
import {
  solveFirstLayer,
  solveUpperEdges,
  solveLowerLowerEdges,
  solveLastLayer,
  isMegaminxFullySolved,
  isMiddleCornersSolved,
  isEquatorialEdgesSolved,
  buildCommutatorLibrary,
  EDGE_KIND,
  CORNER_KIND,
  solveTargetPositionsPreferring,
  correctPositions,
  middleCornerLibrary,
  equatorialEdgeLibrary,
  FIRST_LAYER_CORNER_POSITIONS,
  LOWER_UPPER_EDGE_POSITIONS,
  MIDDLE_CORNER_POSITIONS,
  MIDDLE_CORNER_FIXED_EDGES,
  EQUATORIAL_FIXED_EDGES,
  type Commutator,
} from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

// ---------------------------------------------------------------------
// solveMiddleLayerVariant -- line-for-line copy of megaminxSolver.ts's own
// solveMiddleLayer, with the equatorial-edge step's library parameterized.
// See this file's own top comment for why megaminxSolver.ts itself is not
// touched beyond adding `export` to already-existing declarations.
// ---------------------------------------------------------------------
function solveMiddleLayerVariant(state: MegaminxState, equatorialLibrary: readonly Commutator[], maxRounds = 12): MegaminxTurn[] {
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
    const seq = solveTargetPositionsPreferring(EDGE_KIND, equatorialLibrary, current, LOWER_UPPER_EDGE_POSITIONS, protectedCorners, EQUATORIAL_FIXED_EDGES, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES);
    solution.push(...seq);
    current = applySeq(current, seq);
  }
  if (isMiddleCornersSolved(current) && isEquatorialEdgesSolved(current)) return solution;
  throw new Error(`solveMiddleLayerVariant did not converge within ${maxRounds} rounds`);
}

// ---------------------------------------------------------------------
// Section 1-2: library construction + size census
// ---------------------------------------------------------------------
type Policy = "10" | "7" | "6";

function buildLibrary(policy: Policy): Commutator[] {
  if (policy === "10") return equatorialEdgeLibrary() as Commutator[]; // real production singleton, unmodified
  const maxSupport = policy === "7" ? 7 : 6;
  return buildCommutatorLibrary(EDGE_KIND, new Set(FIRST_LAYER_CORNER_POSITIONS), EQUATORIAL_FIXED_EDGES, maxSupport, 80, 8_000_000, undefined, `equatorialEdge_maxSupport${policy}`);
}

function censusLibrary(policy: Policy, lib: readonly Commutator[]): void {
  const totalPairs = lib.reduce((a, c) => a + EDGE_KIND.movingSupport(c).length, 0);
  console.log(`\n=== LIBRARY CENSUS maxSupport=${policy}: ${lib.length} commutators, ${totalPairs} (commutator,anchor) pairs ===`);
  const bySupport = new Map<number, { commutators: number; pairs: number }>();
  for (const c of lib) {
    const s = EDGE_KIND.support(c).length;
    const entry = bySupport.get(s) ?? { commutators: 0, pairs: 0 };
    entry.commutators++;
    entry.pairs += EDGE_KIND.movingSupport(c).length;
    bySupport.set(s, entry);
  }
  for (const s of [...bySupport.keys()].sort((a, b) => a - b)) {
    const e = bySupport.get(s)!;
    console.log(`  support ${s}: ${e.commutators} commutators, ${e.pairs} pairs`);
  }
}

// ---------------------------------------------------------------------
// Section 3-4: full-pipeline solve with REACH_LOG + timing instrumentation
// ---------------------------------------------------------------------
interface FnStats {
  calls: number;
  totalMs: number;
}
function freshFnStats(): Record<"findSafe" | "findFinishing", FnStats> {
  return { findSafe: { calls: 0, totalMs: 0 }, findFinishing: { calls: 0, totalMs: 0 } };
}
function installTimingSpies(stats: ReturnType<typeof freshFnStats>) {
  const origFindSafe = searchWasm.findSafeApplicationWasm;
  const origFindFinishing = searchWasm.findFinishingApplicationWasm;
  const spies = [
    vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof origFindSafe>) => {
      const t0 = performance.now();
      const r = origFindSafe(...args);
      stats.findSafe.calls++;
      stats.findSafe.totalMs += performance.now() - t0;
      return r;
    }),
    vi.spyOn(searchWasm, "findFinishingApplicationWasm").mockImplementation((...args: Parameters<typeof origFindFinishing>) => {
      const t0 = performance.now();
      const r = origFindFinishing(...args);
      stats.findFinishing.calls++;
      stats.findFinishing.totalMs += performance.now() - t0;
      return r;
    }),
  ];
  return () => spies.forEach((s) => s.mockRestore());
}

interface SolveRecord {
  tier: "easy" | "normal" | "hard";
  seed: number;
  reachedPhase2bc: boolean;
  phase2bcConverged: boolean;
  phase2bcMs: number;
  phase2bcFn: ReturnType<typeof freshFnStats>;
  totalMs: number;
  laterPhaseError?: string;
  solved: boolean;
  replayOk: boolean | null; // null when not solved (replay check only meaningful for a claimed solve)
  fullSolution: MegaminxTurn[];
  scrambled: MegaminxState;
  primaryLog: (ReachLogEntry & { tier: string; seed: number })[]; // phase2bc x edge x pair-anchor calls, for winningSupportSize distribution
}

function runFullSolve(tier: SolveRecord["tier"], seed: number, scrambleLength: number, equatorialLibrary: readonly Commutator[]): SolveRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
  const solution: MegaminxTurn[] = [];
  let current: MegaminxState = scrambled;
  const totalStart = performance.now();

  // Phase 1 + 2a: fully untouched production path. A throw here is the
  // separately-tracked solveCross maxHalfDepth=11 blocker, unrelated to
  // this Sprint's own library choice (it runs before phase2bc even starts).
  try {
    let seq = solveFirstLayer(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveUpperEdges(current);
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    return { tier, seed, reachedPhase2bc: false, phase2bcConverged: false, phase2bcMs: 0, phase2bcFn: freshFnStats(), totalMs: performance.now() - totalStart, solved: false, replayOk: null, fullSolution: [], scrambled, primaryLog: [] };
  }

  // Phase 2bc: the ONLY step whose library differs between policies.
  resetReachLog();
  const phase2bcStats = freshFnStats();
  const uninstall = installTimingSpies(phase2bcStats);
  let phase2bcConverged = true;
  let phase2bcMs = 0;
  try {
    const t0 = performance.now();
    const seq = solveMiddleLayerVariant(current, equatorialLibrary);
    phase2bcMs = performance.now() - t0;
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    phase2bcConverged = false;
  } finally {
    uninstall();
  }
  const primaryLog = readReachLog()
    .filter((e) => e.callerTag === 1 && e.kind === 1)
    .map((e) => ({ ...e, tier, seed }));

  if (!phase2bcConverged) {
    return { tier, seed, reachedPhase2bc: true, phase2bcConverged: false, phase2bcMs, phase2bcFn: phase2bcStats, totalMs: performance.now() - totalStart, solved: false, replayOk: null, fullSolution: [], scrambled, primaryLog };
  }

  // Phase 3a + 3bc: fully untouched production path, downstream of phase2bc.
  let laterPhaseError: string | undefined;
  try {
    let seq = solveLowerLowerEdges(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveLastLayer(current);
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch (e) {
    laterPhaseError = e instanceof Error ? e.message : String(e);
  }

  const totalMs = performance.now() - totalStart;
  const solved = laterPhaseError === undefined && isMegaminxFullySolved(current);
  const replayOk = solved ? isMegaminxFullySolved(applySeq(scrambled, solution)) : null;
  return { tier, seed, reachedPhase2bc: true, phase2bcConverged: true, phase2bcMs, phase2bcFn: phase2bcStats, totalMs, laterPhaseError, solved, replayOk, fullSolution: solved ? solution : [], scrambled, primaryLog };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(label: string, values: number[]): string {
  if (values.length === 0) return `${label}: n=0`;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P90=${percentile(sorted, 90).toFixed(1)} MAX=${sorted[sorted.length - 1].toFixed(1)} n=${values.length}`;
}

const PLAN: { tier: SolveRecord["tier"]; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

function key(tier: string, seed: number): string {
  return `${tier}#${seed}`;
}

function runPolicy(policy: Policy, lib: readonly Commutator[]): SolveRecord[] {
  const records: SolveRecord[] = [];
  for (const { tier, length, count } of PLAN) {
    for (let seed = 1; seed <= count; seed++) records.push(runFullSolve(tier, seed, length, lib));
  }
  return records;
}

describe("MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_OPTIMIZATION_V1", () => {
  it("builds real maxSupport=10/7/6 equatorial-edge libraries and gates them on correctness/completeness/runtime against the real solver", () => {
    // Warmup: force every phase's lazy commutator library (including the
    // baseline equatorialEdgeLibrary) to build/cache before any timed run.
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      s = applySeq(s, solveFirstLayer(s));
      s = applySeq(s, solveUpperEdges(s));
      s = applySeq(s, solveMiddleLayerVariant(s, equatorialEdgeLibrary()));
      s = applySeq(s, solveLowerLowerEdges(s));
      s = applySeq(s, solveLastLayer(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    const lib10 = buildLibrary("10");
    const lib7 = buildLibrary("7");
    const lib6 = buildLibrary("6");
    censusLibrary("10", lib10);
    censusLibrary("7", lib7);
    censusLibrary("6", lib6);

    console.log("\n=== RUNNING: policy 10 (baseline) ===");
    const r10 = runPolicy("10", lib10);
    console.log("\n=== RUNNING: policy 7 (candidate) ===");
    const r7 = runPolicy("7", lib7);
    console.log("\n=== RUNNING: policy 6 (candidate) ===");
    const r6 = runPolicy("6", lib6);

    const byKey10 = new Map(r10.map((r) => [key(r.tier, r.seed), r]));
    const byKey7 = new Map(r7.map((r) => [key(r.tier, r.seed), r]));
    const byKey6 = new Map(r6.map((r) => [key(r.tier, r.seed), r]));

    // ---- Section 3: the affected-scramble fixture (baseline winningSupportSize===7 calls) ----
    const affectedKeys = new Set<string>();
    let baselineSupport7Calls = 0;
    for (const r of r10) {
      for (const e of r.primaryLog) {
        if (e.winningSupportSize === 7) {
          baselineSupport7Calls++;
          affectedKeys.add(key(r.tier, r.seed));
        }
      }
    }
    console.log(`\n=== SECTION 3: baseline winningSupportSize=7 calls = ${baselineSupport7Calls}, spread across ${affectedKeys.size} distinct scrambles ===`);
    for (const k of affectedKeys) {
      const b = byKey10.get(k)!;
      const c7 = byKey7.get(k)!;
      const c6 = byKey6.get(k)!;
      console.log(`  ${k}: maxSupport=10 solved=${b.solved} | maxSupport=7 solved=${c7.solved} | maxSupport=6 solved=${c6.solved}`);
    }
    const affected7Lost = [...affectedKeys].filter((k) => byKey10.get(k)!.solved && !byKey7.get(k)!.solved);
    const affected6Lost = [...affectedKeys].filter((k) => byKey10.get(k)!.solved && !byKey6.get(k)!.solved);
    console.log(`  -> of ${affectedKeys.size} affected scrambles that solved under baseline, maxSupport=7 loses ${affected7Lost.length} (expected 0, support=7 entries still present), maxSupport=6 loses ${affected6Lost.length} (call loss vs solver loss -- see Gate B below)`);

    // ---- Gate A: correctness (false solve / replay failure) ----
    for (const [label, records] of [["10", r10], ["7", r7], ["6", r6]] as const) {
      const claimed = records.filter((r) => r.solved);
      const falseSolves = claimed.filter((r) => r.replayOk !== true);
      console.log(`\n=== GATE A (correctness) maxSupport=${label}: claimed solved=${claimed.length}, false solves (replay mismatch)=${falseSolves.length} ===`);
      if (falseSolves.length > 0) console.log(`  FALSE SOLVE DETAIL: ${falseSolves.map((r) => key(r.tier, r.seed)).join(", ")}`);
    }

    // ---- Gate B: completeness regression (solver-level, not call-level) ----
    const reachedPhase2bcKeys = new Set(r10.filter((r) => r.reachedPhase2bc).map((r) => key(r.tier, r.seed)));
    const baselineSolvedKeys = new Set(r10.filter((r) => r.solved).map((r) => key(r.tier, r.seed)));
    console.log(`\n=== GATE B (completeness) baseline: reached phase2bc=${reachedPhase2bcKeys.size}/100 (rest = solveCross blocker, unrelated), solved=${baselineSolvedKeys.size}/100 ===`);
    for (const [label, byKeyMap] of [["7", byKey7], ["6", byKey6]] as const) {
      const lostVsBaseline: string[] = [];
      const convergenceFailures: string[] = [];
      for (const k of baselineSolvedKeys) {
        const c = byKeyMap.get(k)!;
        if (!c.solved) {
          lostVsBaseline.push(k);
          if (!c.phase2bcConverged) convergenceFailures.push(k);
        }
      }
      console.log(`  maxSupport=${label}: solver-level regressions vs baseline = ${lostVsBaseline.length}/${baselineSolvedKeys.size} (of which phase2bc itself failed to converge: ${convergenceFailures.length}; rest recovered a different call-level path within phase2bc but failed a LATER phase, or vice versa)`);
      if (lostVsBaseline.length > 0) console.log(`    detail: ${lostVsBaseline.join(", ")}`);
    }

    // ---- Gate C: runtime, restricted to the reachedPhase2bc subset (apples-to-apples -- solveCross failures never reach phase2bc regardless of policy) ----
    for (const [label, records] of [["10", r10], ["7", r7], ["6", r6]] as const) {
      const reached = records.filter((r) => reachedPhase2bcKeys.has(key(r.tier, r.seed)));
      const phase2bcMs = reached.map((r) => r.phase2bcMs);
      const totalMs = reached.filter((r) => r.solved).map((r) => r.totalMs);
      const findSafeCalls = reached.reduce((a, r) => a + r.phase2bcFn.findSafe.calls, 0);
      const findSafeMs = reached.reduce((a, r) => a + r.phase2bcFn.findSafe.totalMs, 0);
      console.log(`\n=== GATE C (runtime) maxSupport=${label} ===`);
      console.log(`  ${summarize("phase2bc wall time", phase2bcMs)}`);
      console.log(`  ${summarize("total solve wall time (solved only)", totalMs)}`);
      console.log(`  phase2bc findSafeApplication: ${findSafeCalls} calls, ${findSafeMs.toFixed(1)}ms total, ${(findSafeMs / Math.max(1, findSafeCalls)).toFixed(3)}ms/call avg`);
    }
    const phase2bcMs10 = r10.filter((r) => reachedPhase2bcKeys.has(key(r.tier, r.seed))).reduce((a, r) => a + r.phase2bcMs, 0);
    const phase2bcMs7 = r7.filter((r) => reachedPhase2bcKeys.has(key(r.tier, r.seed))).reduce((a, r) => a + r.phase2bcMs, 0);
    const phase2bcMs6 = r6.filter((r) => reachedPhase2bcKeys.has(key(r.tier, r.seed))).reduce((a, r) => a + r.phase2bcMs, 0);
    console.log(`\n=== GATE C SUMMARY: phase2bc total wall time -- maxSupport=10: ${phase2bcMs10.toFixed(0)}ms, maxSupport=7: ${phase2bcMs7.toFixed(0)}ms (${(((phase2bcMs10 - phase2bcMs7) / phase2bcMs10) * 100).toFixed(1)}% reduction), maxSupport=6: ${phase2bcMs6.toFixed(0)}ms (${(((phase2bcMs10 - phase2bcMs6) / phase2bcMs10) * 100).toFixed(1)}% reduction) ===`);

    expect(reachedPhase2bcKeys.size).toBeGreaterThan(0);
  }, 900_000);
});
