/**
 * MEGAMINX_3SEC_REACHABILITY_REUSE_ANALYSIS_V1 -- pure measurement Sprint.
 *
 * Question: within ONE solve, does build_reachable_impl get called
 * repeatedly with the exact same (root state, kind, pieces, maxDepth,
 * maxReachable) -- i.e. would a solve-local cache actually save real,
 * non-trivial work?
 *
 * Absolute constraints honored: no production algorithm/behavior change
 * (wasm-search/src/lib.rs only gained a side-channel LOG that no solver
 * logic reads -- see its own dev notes; confirmed behavior-identical by
 * rerunning the full existing 23-test suite, same solution depths as
 * every prior run this session), no cache/index implementation, no
 * change to the existing bottleneck-decomposition fixture (this file
 * reuses its exact plan/seed formula/warmup rather than editing it).
 */
import { describe, it, expect, vi } from "vitest";
import * as searchWasm from "./megaminxSearchWasm";
import { readReachLog, resetReachLog, type ReachLogEntry } from "./megaminxSearchWasm";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved } from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

/** Spies record PER-CALL times (not just a running total) so each call's time can be paired, in order, with its own reach-log entry. */
function installTimedSpies() {
  const findSafeTimes: number[] = [];
  const findFinishingTimes: number[] = [];
  let solveCrossMs = 0;

  const origFindSafe = searchWasm.findSafeApplicationWasm;
  const origFindFinishing = searchWasm.findFinishingApplicationWasm;
  const origSolveCross = searchWasm.solveCrossWasm;

  const spies = [
    vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof origFindSafe>) => {
      const t0 = performance.now();
      const r = origFindSafe(...args);
      findSafeTimes.push(performance.now() - t0);
      return r;
    }),
    vi.spyOn(searchWasm, "findFinishingApplicationWasm").mockImplementation((...args: Parameters<typeof origFindFinishing>) => {
      const t0 = performance.now();
      const r = origFindFinishing(...args);
      findFinishingTimes.push(performance.now() - t0);
      return r;
    }),
    vi.spyOn(searchWasm, "solveCrossWasm").mockImplementation((...args: Parameters<typeof origSolveCross>) => {
      const t0 = performance.now();
      const r = origSolveCross(...args);
      solveCrossMs += performance.now() - t0;
      return r;
    }),
  ];
  return { findSafeTimes, findFinishingTimes, getSolveCrossMs: () => solveCrossMs, uninstall: () => spies.forEach((s) => s.mockRestore()) };
}

function configKey(e: ReachLogEntry): string {
  return `${e.stateHash}|${e.kind}|${e.pieces.join(",")}|${e.maxDepth}|${e.maxReachable}`;
}

interface SolveReuseRecord {
  tier: "easy" | "normal" | "hard";
  seed: number;
  solved: boolean;
  error?: string;
  totalBFSCalls: number; // findSafe-tag (0 or 1) entries only, per this Sprint's own focus
  uniqueConfigs: number;
  duplicateCalls: number;
  maxReuseCount: number;
  totalFindSafeMs: number;
  duplicateFindSafeMs: number;
  findFinishingCalls: number;
  findFinishingUniqueConfigs: number;
  findFinishingDuplicateCalls: number;
}

function runOne(tier: SolveReuseRecord["tier"], seed: number, scrambleLength: number): SolveReuseRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);

  resetReachLog();
  const spies = installTimedSpies();
  let current: MegaminxState = scrambled;
  try {
    for (const phase of [solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer]) {
      const seq = phase(current);
      current = applySeq(current, seq);
    }
  } catch (e) {
    spies.uninstall();
    return {
      tier,
      seed,
      solved: false,
      error: e instanceof Error ? e.message : String(e),
      totalBFSCalls: 0,
      uniqueConfigs: 0,
      duplicateCalls: 0,
      maxReuseCount: 0,
      totalFindSafeMs: 0,
      duplicateFindSafeMs: 0,
      findFinishingCalls: 0,
      findFinishingUniqueConfigs: 0,
      findFinishingDuplicateCalls: 0,
    };
  }
  spies.uninstall();

  const log = readReachLog();
  const findSafeEntries = log.filter((e) => e.callerTag === 0 || e.callerTag === 1);
  const findFinishingEntries = log.filter((e) => e.callerTag === 2);

  // 1:1 order correspondence: the Nth findSafeApplicationWasm call made
  // exactly one build_reachable_impl call (single-anchor or pair branch,
  // never both -- see find_safe_application's own if/else), logged
  // synchronously inside that same call, in the same order.
  const counts = new Map<string, number>();
  let duplicateCalls = 0;
  let duplicateFindSafeMs = 0;
  for (let i = 0; i < findSafeEntries.length; i++) {
    const key = configKey(findSafeEntries[i]);
    const seenBefore = counts.get(key) ?? 0;
    counts.set(key, seenBefore + 1);
    if (seenBefore > 0) {
      duplicateCalls++;
      duplicateFindSafeMs += spies.findSafeTimes[i] ?? 0;
    }
  }
  const maxReuseCount = counts.size > 0 ? Math.max(...counts.values()) : 0;

  const ffCounts = new Map<string, number>();
  let ffDuplicateCalls = 0;
  for (const e of findFinishingEntries) {
    const key = configKey(e);
    ffCounts.set(key, (ffCounts.get(key) ?? 0) + 1);
  }
  for (const c of ffCounts.values()) if (c > 1) ffDuplicateCalls += c - 1;

  return {
    tier,
    seed,
    solved: isMegaminxFullySolved(current),
    totalBFSCalls: findSafeEntries.length,
    uniqueConfigs: counts.size,
    duplicateCalls,
    maxReuseCount,
    totalFindSafeMs: spies.findSafeTimes.reduce((a, b) => a + b, 0),
    duplicateFindSafeMs,
    findFinishingCalls: findFinishingEntries.length,
    findFinishingUniqueConfigs: ffCounts.size,
    findFinishingDuplicateCalls: ffDuplicateCalls,
  };
}

describe("MEGAMINX_3SEC_REACHABILITY_REUSE_ANALYSIS_V1", () => {
  it("measures reachable-map BFS configuration reuse within a single solve, across 50 scrambles (10 easy / 20 normal / 20 hard)", () => {
    // Same warmup as MEGAMINX_3SEC_BOTTLENECK_DECOMPOSITION_V1's own fixture.
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

    const plan: { tier: SolveReuseRecord["tier"]; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 10 },
      { tier: "normal", length: 40, count: 20 },
      { tier: "hard", length: 70, count: 20 },
    ];

    const records: SolveReuseRecord[] = [];
    for (const { tier, length, count } of plan) {
      for (let seed = 1; seed <= count; seed++) records.push(runOne(tier, seed, length));
    }

    const complete = records.filter((r) => r.solved);
    const failed = records.filter((r) => !r.solved);
    console.log(`REUSE: solved ${complete.length}/${records.length}, solveCross-style failures: ${failed.length}`);

    for (const tier of ["easy", "normal", "hard"] as const) {
      const tr = complete.filter((r) => r.tier === tier);
      if (tr.length === 0) continue;
      const totalCalls = tr.reduce((a, r) => a + r.totalBFSCalls, 0);
      const totalUnique = tr.reduce((a, r) => a + r.uniqueConfigs, 0);
      const totalDup = tr.reduce((a, r) => a + r.duplicateCalls, 0);
      const totalMs = tr.reduce((a, r) => a + r.totalFindSafeMs, 0);
      const dupMs = tr.reduce((a, r) => a + r.duplicateFindSafeMs, 0);
      console.log(
        `REUSE [${tier}] n=${tr.length}: totalBFSCalls=${totalCalls} uniqueConfigs=${totalUnique} duplicateCalls=${totalDup} duplicateRatio=${((totalDup / totalCalls) * 100).toFixed(1)}% ` +
          `totalFindSafeMs=${totalMs.toFixed(1)} duplicateFindSafeMs=${dupMs.toFixed(1)} cacheableShare=${((dupMs / totalMs) * 100).toFixed(1)}%`,
      );
    }

    const totalCalls = complete.reduce((a, r) => a + r.totalBFSCalls, 0);
    const totalUnique = complete.reduce((a, r) => a + r.uniqueConfigs, 0);
    const totalDup = complete.reduce((a, r) => a + r.duplicateCalls, 0);
    const totalMs = complete.reduce((a, r) => a + r.totalFindSafeMs, 0);
    const dupMs = complete.reduce((a, r) => a + r.duplicateFindSafeMs, 0);
    const maxReuse = Math.max(...complete.map((r) => r.maxReuseCount), 0);
    const avgReusePerSolve = complete.map((r) => r.totalBFSCalls / Math.max(1, r.uniqueConfigs));

    console.log(`REUSE [ALL] n=${complete.length}:`);
    console.log(`  total BFS calls (findSafeApplication) = ${totalCalls}`);
    console.log(`  unique configurations = ${totalUnique}`);
    console.log(`  duplicate calls = ${totalDup} (duplicateRatio = ${((totalDup / totalCalls) * 100).toFixed(1)}%)`);
    console.log(`  max reuse count (single config, single solve) = ${maxReuse}`);
    console.log(`  avg reuse count per solve (calls/uniqueConfigs, mean of per-solve ratios) = ${(avgReusePerSolve.reduce((a, b) => a + b, 0) / avgReusePerSolve.length).toFixed(2)}`);
    console.log(`  total findSafeApplication time = ${totalMs.toFixed(1)}ms`);
    console.log(`  time spent in duplicate-configuration calls = ${dupMs.toFixed(1)}ms`);
    console.log(`  theoretical cacheable share of findSafeApplication time = ${((dupMs / totalMs) * 100).toFixed(1)}%`);
    console.log(`  theoretical cache saving per solve (mean) = ${(dupMs / complete.length).toFixed(1)}ms`);

    const ffTotalCalls = complete.reduce((a, r) => a + r.findFinishingCalls, 0);
    const ffTotalDup = complete.reduce((a, r) => a + r.findFinishingDuplicateCalls, 0);
    console.log(`REUSE [findFinishingApplication, for context] totalCalls=${ffTotalCalls} duplicateCalls=${ffTotalDup} duplicateRatio=${((ffTotalDup / Math.max(1, ffTotalCalls)) * 100).toFixed(1)}%`);

    console.log(`REUSE: solveCross-style non-convergence failures = ${failed.length}/${records.length} (${failed.map((r) => `${r.tier}#${r.seed}`).join(", ")})`);

    expect(complete.length).toBeGreaterThan(0);
  }, 600_000);
});
