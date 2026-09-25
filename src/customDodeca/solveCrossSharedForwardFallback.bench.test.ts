/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1 -- isolated
 * experiment: does reusing depth12's own (raw, failed) forward tree as
 * the depth13+symmetry candidate's own forward starting point eliminate
 * the duplicate forward-generation cost the SEQUENTIAL fallback (from the
 * prior MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1
 * Sprint) pays? That Sprint found the sequential structure's own MAX was
 * 3337ms (9/100 scrambles over the 3000ms budget) even though the
 * candidate alone (no preceding depth12 attempt) had MAX 2765ms -- this
 * Sprint tests whether sharing forward closes that gap.
 *
 * Production change: NONE. This calls only the new, fully isolated
 * solve_cross_shared_forward_fallback Wasm export (see
 * wasm-search/src/lib.rs's own dev notes) -- never solve_cross/solveCrossWasm
 * or solve_cross_symmetry_candidate/solveCrossSymmetryCandidateWasm's own
 * production entry points, and megaminxSolver.ts is not touched at all.
 */
import { describe, it, expect } from "vitest";
import { solveCrossWasm, solveCrossSymmetryCandidateWasm, solveCrossSharedForwardFallbackWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4]; // face 0's own 5 edges

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
function scrambledFor(seed: number, length: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

// Existing (sequential) fallback -- the exact structure the prior
// Production Integration Sprint measured (MAX 3337ms).
function existingFallback(scrambled: MegaminxState): { seq: MegaminxTurn[] | null; usedFallback: boolean } {
  const depth12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
  if (depth12) return { seq: depth12, usedFallback: false };
  const { seq } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
  return { seq, usedFallback: true };
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1: smoke test -- single known-rescued fixture", () => {
  it("hard#5 (rescued by the sequential candidate) is also solved by the shared-forward fallback, replay-verified", () => {
    const scrambled = scrambledFor(5, 70);
    const { seq, stats } = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    console.log("smoke test stats:", JSON.stringify(stats));
    expect(seq).not.toBeNull();
    if (seq) {
      const replayed = applySeq(scrambled, seq);
      expect(isCrossSolved(replayed)).toBe(true);
    }
    expect(stats.phase1Termination).toBe(2); // rounds exhausted at phase 1, captured, phase 2 ran
  }, 30_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1: Gate -- 100-scramble correctness", () => {
  it("depth12=90/100, shared-forward fallback=97/100, false solve=0, replay failure=0, residual exactly {normal#28,hard#6,hard#24}", () => {
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    const rescued: string[] = [];

    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(seed, length);

        const depth12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
        const depth12Ok = depth12 !== null;
        if (depth12Ok) depth12Solved++;

        const { seq } = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
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

    console.log(`depth12-only=${depth12Solved}/100 (expect 90), shared-forward fallback=${fallbackSolved}/100 (expect 97)`);
    console.log(`  rescued: ${rescued.join(", ")}`);
    console.log(`  still failing: ${stillFailing.join(", ")}`);
    console.log(`  false solves: ${falseSolves}`);

    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});

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

describe("MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1: Gate -- performance on the 10 depth12-failing scrambles", () => {
  it("compares existing (sequential) fallback vs shared-forward fallback, per-case timing + peak memory", () => {
    // Known depth12-failing set from the prior Sprints' own fixture.
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
    const TIER_LENGTH: Record<string, number> = { normal: 40, hard: 70 };

    // Warmup both paths.
    {
      const warm = scrambledFor(999, 40);
      existingFallback(warm);
      solveCrossSharedForwardFallbackWasm(warm, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    }

    const memBefore = process.memoryUsage().rss;

    const existingMs: number[] = [];
    const sharedMs: number[] = [];
    const perCase: { key: string; existingMs: number; sharedMs: number; sharedStats: string }[] = [];

    for (const { tier, seed } of FAILING) {
      const key = `${tier}#${seed}`;
      const length = TIER_LENGTH[tier];
      const scrambled = scrambledFor(seed, length);

      const t0 = performance.now();
      const ex = existingFallback(scrambled);
      const exMs = performance.now() - t0;
      existingMs.push(exMs);

      const t1 = performance.now();
      const sf = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      const sfMs = performance.now() - t1;
      sharedMs.push(sfMs);

      // Replay-verify both.
      if (ex.seq) expect(isCrossSolved(applySeq(scrambled, ex.seq)), `existing ${key}`).toBe(true);
      if (sf.seq) expect(isCrossSolved(applySeq(scrambled, sf.seq)), `shared-forward ${key}`).toBe(true);

      perCase.push({ key, existingMs: exMs, sharedMs: sfMs, sharedStats: JSON.stringify(sf.stats) });
    }

    const memAfter = process.memoryUsage().rss;

    console.log(`Gate: process RSS before=${(memBefore / 1e6).toFixed(1)}MB after=${(memAfter / 1e6).toFixed(1)}MB delta=${((memAfter - memBefore) / 1e6).toFixed(1)}MB`);
    console.log(`Gate: ${summarize("existing (sequential) fallback", existingMs)}`);
    console.log(`Gate: ${summarize("shared-forward fallback", sharedMs)}`);
    for (const c of perCase) {
      console.log(`  ${c.key}: existing=${c.existingMs.toFixed(0)}ms shared=${c.sharedMs.toFixed(0)}ms delta=${(c.existingMs - c.sharedMs).toFixed(0)}ms  stats=${c.sharedStats}`);
    }

    const sortedShared = [...sharedMs].sort((a, b) => a - b);
    const maxShared = sortedShared[sortedShared.length - 1];
    const overBudget = sharedMs.filter((v) => v >= 3000).length;
    console.log(`Gate: shared-forward MAX=${maxShared.toFixed(0)}ms, ${overBudget}/10 exceeded 3000ms`);

    expect(perCase.length).toBe(10);
  }, 900_000);
});
