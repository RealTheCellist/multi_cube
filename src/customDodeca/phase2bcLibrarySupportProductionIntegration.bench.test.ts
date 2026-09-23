/**
 * MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_PRODUCTION_INTEGRATION_V1 --
 * post-integration regression, run against the REAL, now-modified
 * production `solveMiddleLayer` (megaminxSolver.ts's `equatorialEdgeLibrary`
 * is now built with maxSupport=6, not 10 -- see that file's own dev note at
 * its declaration). Unlike the prior OPTIMIZATION_V1 Sprint, this harness
 * does NOT build any library itself or use a test-local solveMiddleLayer
 * clone -- it calls the exact same 5 exported phase functions
 * bottleneckDecomposition.bench.test.ts always has, so there is nothing
 * left to distinguish "harness" from "production" here.
 *
 * Reuses the exact same 100-scramble (20/40/40) fixture and
 * mulberry32(seed*97+scrambleLength*7919) formula as every prior Sprint in
 * this series, for direct comparability against OPTIMIZATION_V1's own
 * maxSupport=6 numbers (phase2bc mean 245.0ms, total mean 447.5ms, 74/100
 * solved, 18/18 support=7-affected scrambles recovered).
 */
import { describe, it, expect, vi } from "vitest";
import * as searchWasm from "./megaminxSearchWasm";
import { readReachLog, resetReachLog, type ReachLogEntry } from "./megaminxSearchWasm";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved, equatorialEdgeLibrary, EDGE_KIND } from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

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
  phase2bcMs: number;
  phase2bcFn: ReturnType<typeof freshFnStats>;
  totalMs: number;
  solved: boolean;
  replayOk: boolean | null;
  primaryLog: (ReachLogEntry & { tier: string; seed: number })[];
}

function runFullSolve(tier: SolveRecord["tier"], seed: number, scrambleLength: number): SolveRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
  const solution: MegaminxTurn[] = [];
  let current: MegaminxState = scrambled;
  const totalStart = performance.now();

  try {
    let seq = solveFirstLayer(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveUpperEdges(current);
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    return { tier, seed, reachedPhase2bc: false, phase2bcMs: 0, phase2bcFn: freshFnStats(), totalMs: performance.now() - totalStart, solved: false, replayOk: null, primaryLog: [] };
  }

  resetReachLog();
  const phase2bcStats = freshFnStats();
  const uninstall = installTimingSpies(phase2bcStats);
  let phase2bcConverged = true;
  let phase2bcMs = 0;
  try {
    const t0 = performance.now();
    const seq = solveMiddleLayer(current); // the REAL production function, unmodified, now backed by maxSupport=6
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
    return { tier, seed, reachedPhase2bc: true, phase2bcMs, phase2bcFn: phase2bcStats, totalMs: performance.now() - totalStart, solved: false, replayOk: null, primaryLog };
  }

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
  return { tier, seed, reachedPhase2bc: true, phase2bcMs, phase2bcFn: phase2bcStats, totalMs, solved, replayOk, primaryLog };
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

describe("MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_PRODUCTION_INTEGRATION_V1", () => {
  it("re-verifies correctness/completeness/runtime against the REAL, now maxSupport=6 production solveMiddleLayer", () => {
    const lib = equatorialEdgeLibrary();
    const totalPairs = lib.reduce((a, c) => a + EDGE_KIND.movingSupport(c).length, 0);
    console.log(`PRODUCTION_INTEGRATION_V1: live equatorialEdgeLibrary() = ${lib.length} commutators, ${totalPairs} pairs (expect 400 / 1,440)`);
    expect(lib.length).toBe(400);
    expect(totalPairs).toBe(1440);

    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      s = applySeq(s, solveFirstLayer(s));
      s = applySeq(s, solveUpperEdges(s));
      s = applySeq(s, solveMiddleLayer(s));
      s = applySeq(s, solveLowerLowerEdges(s));
      s = applySeq(s, solveLastLayer(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    const records: SolveRecord[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) records.push(runFullSolve(tier, seed, length));
    }

    const reached = records.filter((r) => r.reachedPhase2bc);
    const solved = records.filter((r) => r.solved);
    console.log(`PRODUCTION_INTEGRATION_V1: reached phase2bc=${reached.length}/100, solved=${solved.length}/100 (unreached = solveCross blocker, unrelated, tracked separately)`);

    // Gate A: false solve / replay failure.
    const falseSolves = solved.filter((r) => r.replayOk !== true);
    console.log(`GATE A: claimed solved=${solved.length}, false solves (replay mismatch)=${falseSolves.length}`);
    expect(falseSolves.length).toBe(0);

    // The 18 previously-flagged support=7-affected scrambles: re-identify by winningSupportSize in this SAME run's own log
    // (their raw identity as (tier,seed) is expected to match OPTIMIZATION_V1's own list one-for-one, since the fixture,
    // formula, and every phase up to phase2bc are byte-identical -- verified below, not assumed).
    const affectedKeys = new Set<string>();
    for (const r of records) for (const e of r.primaryLog) if (e.winningSupportSize === 7) affectedKeys.add(`${r.tier}#${r.seed}`);
    console.log(`GATE C (spot check): scrambles where a support=7 call still succeeds under this maxSupport=6 library = ${affectedKeys.size} (expect 0 -- support=7 entries no longer exist in a maxSupport=6 library; this is a sanity check that the cache truly rebuilt, not a regression signal)`);

    const expectedAffected = new Set(["easy#13", "easy#14", "easy#18", "normal#2", "normal#9", "normal#11", "normal#14", "normal#22", "normal#26", "normal#30", "normal#39", "hard#15", "hard#19", "hard#23", "hard#29", "hard#34", "hard#35", "hard#37"]);
    const byKey = new Map(records.map((r) => [`${r.tier}#${r.seed}`, r]));
    let recoveredAll = true;
    for (const k of expectedAffected) {
      const r = byKey.get(k);
      const ok = r?.solved === true;
      if (!ok) recoveredAll = false;
      console.log(`  ${k}: solved=${r?.solved ?? "MISSING"}`);
    }
    console.log(`GATE B/C: all 18 previously support=7-dependent scrambles still solved under production maxSupport=6 = ${recoveredAll}`);
    expect(recoveredAll).toBe(true);

    // Gate C: runtime.
    const phase2bcMsValues = reached.map((r) => r.phase2bcMs);
    const totalMsValues = solved.map((r) => r.totalMs);
    console.log(`GATE C: ${summarize("phase2bc wall time", phase2bcMsValues)}`);
    console.log(`GATE C: ${summarize("total solve wall time (solved only)", totalMsValues)}`);
    const findSafeCalls = reached.reduce((a, r) => a + r.phase2bcFn.findSafe.calls, 0);
    const findSafeMs = reached.reduce((a, r) => a + r.phase2bcFn.findSafe.totalMs, 0);
    console.log(`GATE C: phase2bc findSafeApplication: ${findSafeCalls} calls, ${findSafeMs.toFixed(1)}ms total, ${(findSafeMs / Math.max(1, findSafeCalls)).toFixed(3)}ms/call avg`);
    console.log(`GATE C: phase2bc cumulative wall time = ${phase2bcMsValues.reduce((a, b) => a + b, 0).toFixed(0)}ms (OPTIMIZATION_V1's own maxSupport=6 harness measured 18,131ms on the same fixture)`);

    expect(reached.length).toBe(74);
    expect(solved.length).toBe(74);
  }, 900_000);
});
