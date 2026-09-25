/**
 * MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1 -- pure profiling
 * Sprint. canonical_key_v2/conjugate_state_v2/compute_edge_state_key_fast5
 * and try_bridge_canonical_counted are all reused completely UNCHANGED --
 * no state-identity or C5 orbit canonicalization semantics change. Goal:
 * decompose canonical_key_v2's actual cost (already partly measured by
 * the earlier canonicalization micro-opt Sprint's bench_* exports) and
 * measure what share of REAL bridgeDepth=3 candidate testing it actually
 * accounts for, over the residual 3 + comparison 2 fixtures.
 */
import { describe, it, expect } from "vitest";
import {
  benchConjugateStateWasm,
  benchComputeEdgeStateKeyWasm,
  benchStateZeroInitWasm,
  benchCanonicalKeyWasm,
  canonicalKeyV2CostProfileWasm,
  microoptVerifyComprehensiveWasm,
  radius1BridgeEarlyExitWasm,
  solveCrossWasm,
  solveCrossSharedForwardFallbackV2Wasm,
  type CanonicalKeyV2CostProfileRow,
} from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;
const CANDIDATE_CAP = 1500;

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
function isCrossSolved(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledFor(tier: string, seed: number): MegaminxState {
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

type Fixture = { key: string; tier: "normal" | "hard"; seed: number };
const RESIDUALS: Fixture[] = [
  { key: "normal#28", tier: "normal", seed: 28 },
  { key: "hard#6", tier: "hard", seed: 6 },
  { key: "hard#24", tier: "hard", seed: 24 },
];
const COMPARISON: Fixture[] = [
  { key: "hard#5", tier: "hard", seed: 5 },
  { key: "hard#31", tier: "hard", seed: 31 },
];
const ALL_FIXTURES = [...RESIDUALS, ...COMPARISON];

describe("MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1: Stop Rule pre-check -- canonical key correctness unchanged", () => {
  it("microopt comprehensive check still 0 mismatches (canonical_key_v2 itself untouched this Sprint)", () => {
    const mismatches = microoptVerifyComprehensiveWasm(TRACKED_PIECES, null);
    console.log(`canonical key comprehensive check: mismatches=${mismatches}`);
    expect(mismatches).toBe(0);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1: 1-5 -- low-level micro-benchmarks (re-verification)", () => {
  it("A1 conjugate_state V0 vs V2, A5 compute_edge_state_key V0 vs fast5, A2 zero-init, full canonical_key V0/V1/V2", () => {
    const warm = scrambledFor("hard", 31);
    const REPEATS = 200_000;

    benchConjugateStateWasm(warm, 0, 1000);
    benchConjugateStateWasm(warm, 2, 1000);
    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 0, 1000);
    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 1, 1000);
    benchCanonicalKeyWasm(warm, TRACKED_PIECES, 2, 1000);

    const t0a = performance.now();
    benchConjugateStateWasm(warm, 0, REPEATS);
    const conjV0Ms = performance.now() - t0a;
    const t0b = performance.now();
    benchConjugateStateWasm(warm, 2, REPEATS);
    const conjV2Ms = performance.now() - t0b;

    const t1a = performance.now();
    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 0, REPEATS);
    const keyV0Ms = performance.now() - t1a;
    const t1b = performance.now();
    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 1, REPEATS);
    const keyFast5Ms = performance.now() - t1b;

    const t2 = performance.now();
    benchStateZeroInitWasm(REPEATS);
    const zeroInitMs = performance.now() - t2;

    const t3a = performance.now();
    benchCanonicalKeyWasm(warm, TRACKED_PIECES, 0, REPEATS);
    const canonV0Ms = performance.now() - t3a;
    const t3b = performance.now();
    benchCanonicalKeyWasm(warm, TRACKED_PIECES, 2, REPEATS);
    const canonV2Ms = performance.now() - t3b;

    console.log(`A1 conjugate_state: V0=${(conjV0Ms / REPEATS).toFixed(5)}ms V2=${(conjV2Ms / REPEATS).toFixed(5)}ms (V2 is ${((conjV2Ms / canonV2Ms) * 100).toFixed(0)}% of full canonical_key_v2, x4 calls/key)`);
    console.log(`A5 compute_edge_state_key: V0=${(keyV0Ms / REPEATS).toFixed(5)}ms fast5=${(keyFast5Ms / REPEATS).toFixed(5)}ms (fast5 is used x5 calls/key)`);
    console.log(`A2 state zero-init alone: ${(zeroInitMs / REPEATS).toFixed(5)}ms/call (negligible -- included inside A1's own conjugate_state_v2 cost via 'let mut out = SOLVED;')`);
    console.log(`Full canonical_key: V0=${(canonV0Ms / REPEATS).toFixed(5)}ms V2=${(canonV2Ms / REPEATS).toFixed(5)}ms`);
    console.log(`  decomposition estimate: 4x conjugate_state_v2(${(conjV2Ms / REPEATS).toFixed(5)}ms) + 5x compute_edge_state_key_fast5(${(keyFast5Ms / REPEATS).toFixed(5)}ms) = ${(4 * (conjV2Ms / REPEATS) + 5 * (keyFast5Ms / REPEATS)).toFixed(5)}ms (vs measured full=${(canonV2Ms / REPEATS).toFixed(5)}ms)`);
    console.log(`  A1(conjugate) share of full canonical_key_v2 cost: ~${(((4 * (conjV2Ms / REPEATS)) / (canonV2Ms / REPEATS)) * 100).toFixed(0)}%`);
    console.log(`  A5(key packing) share of full canonical_key_v2 cost: ~${(((5 * (keyFast5Ms / REPEATS)) / (canonV2Ms / REPEATS)) * 100).toFixed(0)}%`);

    expect(conjV0Ms).toBeGreaterThan(0);
  }, 60_000);
});

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

describe("MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1: 1,6,7 -- per-candidate call count + bridgeDepth=3 cost share", () => {
  it(`residual 3 + comparison 2: first ${CANDIDATE_CAP} candidates each, canonical_key_v2 calls by category, P50/P95, bridgeDepth=3 share`, () => {
    console.log("\nfixture    | analyzed | totalCalls  | cat0(notFound) n/calls/P50/P95 | cat1 n/calls | cat2 n/calls | cat3 n/calls/P50/P95");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { stats, rows } = canonicalKeyV2CostProfileWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, CANDIDATE_CAP);

      const byCat = new Map<number, CanonicalKeyV2CostProfileRow[]>();
      for (const r of rows) {
        if (!byCat.has(r.category)) byCat.set(r.category, []);
        byCat.get(r.category)!.push(r);
      }
      const totalCalls = rows.reduce((a, r) => a + r.canonicalKeyCalls, 0);

      const cat0 = byCat.get(0) ?? [];
      const cat1 = byCat.get(1) ?? [];
      const cat2 = byCat.get(2) ?? [];
      const cat3 = byCat.get(3) ?? [];

      const cat0Calls = cat0.map((r) => r.canonicalKeyCalls);
      const cat3Calls = cat3.map((r) => r.canonicalKeyCalls);
      cat0Calls.sort((a, b) => a - b);
      cat3Calls.sort((a, b) => a - b);

      const cat0Total = cat0Calls.reduce((a, b) => a + b, 0);
      const cat1Total = cat1.reduce((a, r) => a + r.canonicalKeyCalls, 0);
      const cat2Total = cat2.reduce((a, r) => a + r.canonicalKeyCalls, 0);
      const cat3Total = cat3Calls.reduce((a, b) => a + b, 0);

      console.log(
        `${f.key.padEnd(10)} | ${stats.analyzed.toString().padStart(8)} | ${totalCalls.toString().padStart(11)} | n=${cat0.length} calls=${cat0Total} P50=${median(cat0Calls).toFixed(0)} P95=${percentile(cat0Calls, 95).toFixed(0)} | n=${cat1.length} calls=${cat1Total} | n=${cat2.length} calls=${cat2Total} | n=${cat3.length} calls=${cat3Total} P50=${median(cat3Calls).toFixed(0)} P95=${percentile(cat3Calls, 95).toFixed(0)}`,
      );

      const depth3ShareIncludingNotFound = ((cat3Total + cat0Total) / totalCalls) * 100;
      const depth3ShareFoundOnly = (cat3Total / totalCalls) * 100;
      console.log(`  -> bridgeDepth=3(found) share of total calls: ${depth3ShareFoundOnly.toFixed(1)}%   bridgeDepth=3(found)+notFound(both exhaust depth-3 sweep) share: ${depth3ShareIncludingNotFound.toFixed(1)}%`);

      expect(rows.length).toBe(stats.analyzed);
    }
  }, 300_000);
});

describe("MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1: Stop Rule safety -- false solve / replay / regression", () => {
  it("false solve = 0, replay = 0 failures (radius1 early-exit, unchanged, reconfirmed for all 5 fixtures)", () => {
    let falseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const r = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      expect(r.status, `${f.key}`).toBe(1);
      const solved = r.seq !== null && isCrossSolved(applySeq(scrambled, r.seq));
      if (!solved) falseSolve++;
      console.log(`  ${f.key}: replay solved=${solved}`);
    }
    expect(falseSolve).toBe(0);
  }, 60_000);

  it("existing 97/100 completeness + residual exactly {normal#28, hard#6, hard#24} unaffected (this Sprint is pure profiling, no Rust function modified)", () => {
    const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 20 },
      { tier: "normal", length: 40, count: 40 },
      { tier: "hard", length: 70, count: 40 },
    ];
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        if (solveCrossWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP) !== null) depth12Solved++;
        const { seq } = solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
        if (seq) {
          if (isCrossSolved(applySeq(scrambled, seq))) fallbackSolved++;
          else falseSolves++;
        } else {
          stillFailing.push(key);
        }
      }
    }
    console.log(`regression: depth12=${depth12Solved}/100, V2 fallback=${fallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});
