/**
 * MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1 -- prototype only.
 * No production change, no commit/push. Builds the fixture-independent
 * canonical backward BFS (established by the prior Sprint) ONCE into a
 * static table and replaces phase2's per-solve backward reconstruction
 * with a single pass over forward's own nodes. solve_cross_shared_
 * forward_fallback_v2 (the existing, already-validated dynamic pipeline)
 * is reused UNCHANGED as this Sprint's own correctness oracle.
 */
import { describe, it, expect } from "vitest";
import {
  precomputedBackwardTableEnsureBuiltWasm,
  precomputedBackwardTableStatsWasm,
  solveCrossCachedBackwardV1Wasm,
  solveCrossSharedForwardFallbackV2Wasm,
  solveCrossWasm,
  wasmMemoryBytesWasm,
  benchFastmapLookupOnlyTargetedWasm,
} from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const DEPTH12_MAX_HALF_DEPTH = 12;
const TOTAL_MAX_HALF_DEPTH = 13;

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
function isCrossSolved(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

function scrambledFor(tier: string, length: number, seed: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

// Populated by the first test (cold build), reused by later tests.
const fallbackFixtures: { key: string; scrambled: MegaminxState }[] = [];

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1: Gate B0 -- cold table build", () => {
  it("cold build time, memory delta, table shape (nodesPerRound, total=415,396)", () => {
    const memBefore = wasmMemoryBytesWasm();

    const t0 = performance.now();
    const totalNodes = precomputedBackwardTableEnsureBuiltWasm();
    const coldBuildMs = performance.now() - t0;

    const memAfter = wasmMemoryBytesWasm();
    const stats = precomputedBackwardTableStatsWasm();

    console.log("\n== Gate B0: cold table build ==");
    console.log(`table build time: ${coldBuildMs.toFixed(1)}ms`);
    console.log(`wasm memory: before=${(memBefore / 1024 / 1024).toFixed(2)}MB after=${(memAfter / 1024 / 1024).toFixed(2)}MB delta=${((memAfter - memBefore) / 1024 / 1024).toFixed(2)}MB`);
    console.log(`totalNodes=${totalNodes} nodesPerRound=${JSON.stringify(stats.nodesPerRound)} maxRoundReached=${stats.maxRoundReached} frontierCapHit=${stats.frontierCapHit}`);

    expect(stats.frontierCapHit).toBe(false);
    expect(stats.maxRoundReached).toBe(7);
    expect(totalNodes).toBe(415396);
    expect(stats.nodesPerRound.slice(1, 8)).toEqual([4, 23, 177, 1353, 9502, 60631, 343705]);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1: Gate A -- correctness (STOP A gate)", () => {
  it("identify all fallback-triggering scrambles in the 100-scramble suite, dynamic vs cached must match byte-for-byte", () => {
    let depth12Solved = 0;
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(tier, length, seed);
        if (solveCrossWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP) !== null) {
          depth12Solved++;
          continue;
        }
        fallbackFixtures.push({ key, scrambled });
      }
    }
    console.log(`\ndepth12Solved=${depth12Solved}/100, fallback-triggering count=${fallbackFixtures.length}`);
    expect(depth12Solved).toBe(90);
    expect(fallbackFixtures.length).toBe(10);

    console.log("\nfixture    | dynamic(found/len) | cached(found/len/matchRound) | seq identical | tableInsufficientDepth");
    for (const f of fallbackFixtures) {
      const dyn = solveCrossSharedForwardFallbackV2Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH, PRODUCTION_CAP);
      const cached = solveCrossCachedBackwardV1Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);

      const dynFound = dyn.seq !== null;
      const cachedFound = cached.seq !== null;
      const seqIdentical = JSON.stringify(dyn.seq) === JSON.stringify(cached.seq);

      console.log(`${f.key.padEnd(10)} | ${String(dynFound).padEnd(6)}/${String(dyn.seq?.length ?? "-").padEnd(4)} | ${String(cachedFound).padEnd(6)}/${String(cached.seq?.length ?? "-").padEnd(4)}/${String(cached.matchRound).padEnd(2)} | ${seqIdentical} | ${cached.tableInsufficientDepth}`);

      expect(cached.tableInsufficientDepth).toBe(false);
      expect(dynFound).toBe(cachedFound);
      expect(seqIdentical).toBe(true);
      if (dyn.seq) {
        expect(cached.seq).toEqual(dyn.seq);
      }
    }
  }, 180_000);

  it("false solve = 0, replay = 100% for cached solutions", () => {
    let falseSolve = 0;
    for (const f of fallbackFixtures) {
      const cached = solveCrossCachedBackwardV1Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);
      if (cached.seq === null) continue;
      const solved = isCrossSolved(applySeq(f.scrambled, cached.seq));
      if (!solved) falseSolve++;
    }
    expect(falseSolve).toBe(0);
  }, 60_000);

  it("full 100-scramble regression with cached backward replacing dynamic fallback: identical to established 90/97/residual/0", () => {
    let depth12Solved = 0;
    let cachedFallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(tier, length, seed);
        if (solveCrossWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP) !== null) depth12Solved++;
        const cached = solveCrossCachedBackwardV1Wasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);
        if (cached.seq) {
          if (isCrossSolved(applySeq(scrambled, cached.seq))) cachedFallbackSolved++;
          else falseSolves++;
        } else {
          stillFailing.push(key);
        }
      }
    }
    console.log(`\ncached regression: depth12=${depth12Solved}/100, cached fallback=${cachedFallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(depth12Solved).toBe(90);
    expect(falseSolves).toBe(0);
    expect(cachedFallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 180_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1: Gate B -- warm performance", () => {
  it("warm solve mean/P90/P95/MAX (dynamic vs cached, all 10 fallback fixtures x 3 reps), isolated lookup cost", () => {
    const dynTimes: number[] = [];
    const cachedTimes: number[] = [];

    // warmup
    for (const f of fallbackFixtures) {
      solveCrossSharedForwardFallbackV2Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH, PRODUCTION_CAP);
      solveCrossCachedBackwardV1Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);
    }

    for (let rep = 0; rep < 3; rep++) {
      for (const f of fallbackFixtures) {
        const t0 = performance.now();
        solveCrossSharedForwardFallbackV2Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH, PRODUCTION_CAP);
        dynTimes.push(performance.now() - t0);

        const t1 = performance.now();
        const r = solveCrossCachedBackwardV1Wasm(f.scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);
        cachedTimes.push(performance.now() - t1);
        expect(r.tableAlreadyBuilt).toBe(true); // must be warm for every one of these calls
      }
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log("\n== Gate B: warm performance (n=30 each) ==");
    console.log(`dynamic:  mean=${mean(dynTimes).toFixed(1)}ms median=${median(dynTimes).toFixed(1)}ms P90=${percentile(dynTimes, 90).toFixed(1)}ms P95=${percentile(dynTimes, 95).toFixed(1)}ms MAX=${Math.max(...dynTimes).toFixed(1)}ms`);
    console.log(`cached:   mean=${mean(cachedTimes).toFixed(1)}ms median=${median(cachedTimes).toFixed(1)}ms P90=${percentile(cachedTimes, 90).toFixed(1)}ms P95=${percentile(cachedTimes, 95).toFixed(1)}ms MAX=${Math.max(...cachedTimes).toFixed(1)}ms`);
    console.log(`improvement (mean): ${(((mean(dynTimes) - mean(cachedTimes)) / mean(dynTimes)) * 100).toFixed(1)}%`);
    console.log(`improvement (MAX):  ${(((Math.max(...dynTimes) - Math.max(...cachedTimes)) / Math.max(...dynTimes)) * 100).toFixed(1)}%`);

    // isolated backward lookup cost at real table scale
    const LOOKUP_PREPOP = 415_396;
    const LOOKUP_REPS = 400_000; // ~ typical forward tree size (297,986-419,506 per Sprint 10's log)
    const tL0 = performance.now();
    benchFastmapLookupOnlyTargetedWasm(LOOKUP_PREPOP, LOOKUP_REPS);
    const lookupMs = performance.now() - tL0;
    console.log(`\nisolated backward lookup cost @ table size ${LOOKUP_PREPOP.toLocaleString()}: ${lookupMs.toFixed(1)}ms for ${LOOKUP_REPS.toLocaleString()} lookups (${(lookupMs / LOOKUP_REPS).toFixed(6)}ms/lookup) -- this approximates the single-pass scan cost over forward's own nodes`);

    expect(mean(cachedTimes)).toBeGreaterThan(0);
  }, 120_000);
});
