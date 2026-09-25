/**
 * MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1 -- pure low-level
 * implementation experiment. NO search-algorithm change: canonical_key's
 * MATH is reproduced exactly by V1/V2, only the IMPLEMENTATION cost is
 * reduced (see wasm-search/src/lib.rs's own dev notes for the exact
 * derivation of each variant). Gate A (exact equivalence) gates
 * everything else -- a mismatch anywhere means the candidate is
 * disqualified regardless of speed.
 */
import { describe, it, expect } from "vitest";
import {
  microoptVerifyOneWasm,
  microoptVerifyComprehensiveWasm,
  benchConjugateStateWasm,
  benchComputeEdgeStateKeyWasm,
  benchStateZeroInitWasm,
  benchCanonicalKeyWasm,
  solveCrossSharedForwardFallbackV2Wasm,
  solveCrossWasm,
  solveCrossSharedForwardFallbackWasm,
} from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];

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

describe("MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1: Gate A -- canonical key exact equivalence", () => {
  it("SOLVED and many random states: V0 == V1 == V2, 0 mismatches", () => {
    let mismatches = 0;
    let checked = 0;

    // SOLVED.
    mismatches += microoptVerifyOneWasm(solvedMegaminxState(), TRACKED_PIECES);
    checked++;

    // Many diverse scrambled states (light to heavy).
    for (let seed = 1; seed <= 100; seed++) {
      const length = 3 + (seed % 60);
      const turns = randomMegaminxScramble(length, mulberry32(seed * 131 + length * 997));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      const mask = microoptVerifyOneWasm(scrambled, TRACKED_PIECES);
      if (mask !== 0) console.log(`  seed ${seed} (len ${length}): mismatch mask=${mask}`);
      mismatches += mask;
      checked++;
    }

    console.log(`Gate A (single-state): checked ${checked} states, total mismatches = ${mismatches}`);
    expect(mismatches).toBe(0);
  }, 60_000);

  it("comprehensive: SOLVED + all raw backward states through round 7 (B1..B7) + forward states from residual-3 and 2 rescued fixtures", () => {
    // Backward is scramble-independent, so a single comprehensive call
    // (forwardRootProvided=false) covers SOLVED + B1..B7 once.
    const backwardMismatches = microoptVerifyComprehensiveWasm(TRACKED_PIECES, null);
    console.log(`Gate A (comprehensive, SOLVED + B1..B7): mismatches = ${backwardMismatches}`);
    expect(backwardMismatches).toBe(0);

    const FIXTURES: [string, number][] = [
      ["normal", 28],
      ["hard", 6],
      ["hard", 24],
      ["hard", 31],
      ["hard", 39],
    ];
    let forwardMismatches = 0;
    for (const [tier, seed] of FIXTURES) {
      const root = scrambledFor(tier, seed);
      const m = microoptVerifyComprehensiveWasm(TRACKED_PIECES, root);
      console.log(`  ${tier}#${seed} (+forward 1..6 rounds): mismatches = ${m}`);
      forwardMismatches += m;
    }
    console.log(`Gate A (comprehensive, forward): total mismatches = ${forwardMismatches}`);
    expect(forwardMismatches).toBe(0);
  }, 120_000);
});

function timeCall<T>(fn: () => T): { result: T; ms: number } {
  const t0 = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t0 };
}

describe("MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1: Gate C -- micro-benchmark timing V0 vs V1 vs V2", () => {
  it("isolated per-call costs for conjugate_state, compute_edge_state_key, state-init, and full canonical_key", () => {
    const scrambled = scrambledFor("hard", 31);
    const REPEATS = 200_000;

    // Warmup.
    benchConjugateStateWasm(scrambled, 0, 1000);
    benchConjugateStateWasm(scrambled, 2, 1000);
    benchComputeEdgeStateKeyWasm(scrambled, TRACKED_PIECES, 0, 1000);
    benchComputeEdgeStateKeyWasm(scrambled, TRACKED_PIECES, 1, 1000);
    benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 0, 1000);
    benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 1, 1000);
    benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 2, 1000);

    const conjV0 = timeCall(() => benchConjugateStateWasm(scrambled, 0, REPEATS));
    const conjV2 = timeCall(() => benchConjugateStateWasm(scrambled, 2, REPEATS));
    console.log(`A1 conjugate_state: V0=${(conjV0.ms / REPEATS).toFixed(5)}ms/call V2=${(conjV2.ms / REPEATS).toFixed(5)}ms/call speedup=${(conjV0.ms / conjV2.ms).toFixed(2)}x`);

    const keyV0 = timeCall(() => benchComputeEdgeStateKeyWasm(scrambled, TRACKED_PIECES, 0, REPEATS));
    const keyV1 = timeCall(() => benchComputeEdgeStateKeyWasm(scrambled, TRACKED_PIECES, 1, REPEATS));
    console.log(`A5 compute_edge_state_key: V0=${(keyV0.ms / REPEATS).toFixed(5)}ms/call V1=${(keyV1.ms / REPEATS).toFixed(5)}ms/call speedup=${(keyV0.ms / keyV1.ms).toFixed(2)}x`);

    const zeroInit = timeCall(() => benchStateZeroInitWasm(REPEATS));
    console.log(`A2 state zero-init alone: ${(zeroInit.ms / REPEATS).toFixed(5)}ms/call (context, not a variant comparison)`);

    const canonV0 = timeCall(() => benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 0, REPEATS));
    const canonV1 = timeCall(() => benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 1, REPEATS));
    const canonV2 = timeCall(() => benchCanonicalKeyWasm(scrambled, TRACKED_PIECES, 2, REPEATS));
    console.log(`Full canonical_key: V0=${(canonV0.ms / REPEATS).toFixed(5)}ms/call V1=${(canonV1.ms / REPEATS).toFixed(5)}ms/call V2=${(canonV2.ms / REPEATS).toFixed(5)}ms/call`);
    console.log(`  speedup V1/V0=${(canonV0.ms / canonV1.ms).toFixed(2)}x  V2/V0=${(canonV0.ms / canonV2.ms).toFixed(2)}x`);

    expect(conjV0.ms).toBeGreaterThan(0);
  }, 120_000);
});

const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

describe("MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1: Gate B -- V2 pipeline solver regression", () => {
  it("depth12=90/100, V2 shared-forward fallback=97/100, false solve=0, replay failure=0, residual exactly {normal#28,hard#6,hard#24}", () => {
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    const rescued: string[] = [];

    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);

        const depth12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
        const depth12Ok = depth12 !== null;
        if (depth12Ok) depth12Solved++;

        const { seq } = solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
        if (seq) {
          const replayed = applySeq(scrambled, seq);
          if (isCrossSolved(replayed)) {
            fallbackSolved++;
            if (!depth12Ok) rescued.push(key);
          } else {
            falseSolves++;
          }
        } else {
          stillFailing.push(key);
        }
      }
    }

    console.log(`depth12-only=${depth12Solved}/100 (expect 90), V2 fallback=${fallbackSolved}/100 (expect 97)`);
    console.log(`  rescued: ${rescued.join(", ")}`);
    console.log(`  still failing: ${stillFailing.join(", ")}`);
    console.log(`  false solves: ${falseSolves}`);

    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(label: string, values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P95=${percentile(sorted, 95).toFixed(1)} MAX=${sorted[sorted.length - 1].toFixed(1)} n=${values.length}`;
}

describe("MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1: Gate C -- full fallback end-to-end, V0 vs V2", () => {
  it("measures the 10 depth12-failing scrambles with V0 (baseline shared-forward) vs V2 (canonicalization micro-opt), plus full 100-scramble MAX", () => {
    const FAILING: { tier: "normal" | "hard"; seed: number }[] = [
      { tier: "normal", seed: 28 },
      { tier: "hard", seed: 5 },
      { tier: "hard", seed: 6 },
      { tier: "hard", seed: 9 },
      { tier: "hard", seed: 24 },
      { tier: "hard", seed: 25 },
      { tier: "hard", seed: 30 },
      { tier: "hard", seed: 31 },
      { tier: "hard", seed: 36 },
      { tier: "hard", seed: 39 },
    ];
    const TIER_LEN: Record<string, number> = { normal: 40, hard: 70 };

    // Warmup.
    {
      const warm = scrambledFor("normal", 999);
      solveCrossSharedForwardFallbackWasm(warm, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      solveCrossSharedForwardFallbackV2Wasm(warm, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    }

    const v0Ms: number[] = [];
    const v2Ms: number[] = [];
    for (const { tier, seed } of FAILING) {
      const length = TIER_LEN[tier];
      const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);

      const t0 = performance.now();
      const v0 = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      const v0Time = performance.now() - t0;
      v0Ms.push(v0Time);

      const t1 = performance.now();
      const v2 = solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      const v2Time = performance.now() - t1;
      v2Ms.push(v2Time);

      if (v0.seq) expect(isCrossSolved(applySeq(scrambled, v0.seq)), `V0 ${tier}#${seed}`).toBe(true);
      if (v2.seq) expect(isCrossSolved(applySeq(scrambled, v2.seq)), `V2 ${tier}#${seed}`).toBe(true);
      expect(v0.seq === null, `V0/V2 outcome mismatch on ${tier}#${seed}`).toBe(v2.seq === null);

      console.log(`  ${tier}#${seed}: V0=${v0Time.toFixed(0)}ms V2=${v2Time.toFixed(0)}ms speedup=${(v0Time / v2Time).toFixed(2)}x`);
    }

    console.log(`Gate C (10 failing): ${summarize("V0 (baseline)", v0Ms)}`);
    console.log(`Gate C (10 failing): ${summarize("V2 (micro-opt)", v2Ms)}`);

    // Full 100-scramble MAX (V2 only, for the real Production-relevant number).
    const fullMs: number[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        const t0 = performance.now();
        solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
        fullMs.push(performance.now() - t0);
      }
    }
    console.log(`Gate C (full 100): ${summarize("V2 full fallback", fullMs)}`);
    const sortedFull = [...fullMs].sort((a, b) => a - b);
    const maxFull = sortedFull[sortedFull.length - 1];
    const overBudget = fullMs.filter((v) => v >= 3000).length;
    const overInternalTarget = fullMs.filter((v) => v >= 2900).length;
    console.log(`Gate C: V2 full-100 MAX=${maxFull.toFixed(0)}ms, ${overBudget}/100 exceeded 3000ms, ${overInternalTarget}/100 exceeded internal 2900ms target`);

    expect(v0Ms.length).toBe(10);
  }, 600_000);
});
