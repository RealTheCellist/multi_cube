/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1 -- isolated experiment,
 * building on the validated shared-forward Sprint (preserved unchanged).
 * Stop Rule A (this file's own first describe block) MUST pass before any
 * of the correctness/performance gates below it are trusted: does
 * canonicalizing depth12's own raw backward tree at each round give
 * EXACTLY the same canonical key set a standalone canonical BFS would
 * reach at that round?
 *
 * Production change: NONE. Calls only the new, fully isolated
 * shared_backward_verify / solve_cross_shared_backward_fallback Wasm
 * exports -- never solve_cross/solveCrossWasm,
 * solve_cross_symmetry_candidate/solveCrossSymmetryCandidateWasm, or
 * solve_cross_shared_forward_fallback/solveCrossSharedForwardFallbackWasm's
 * own production entry points. megaminxSolver.ts is not touched at all.
 */
import { describe, it, expect } from "vitest";
import { sharedBackwardVerifyWasm, solveCrossSharedBackwardFallbackWasm, solveCrossWasm, solveCrossSymmetryCandidateWasm, solveCrossSharedForwardFallbackWasm } from "./megaminxSearchWasm";
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

const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];
function scrambledFor(seed: number, length: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1: Stop Rule A -- B1..B6 exact canonical set equality", () => {
  it("canonicalize(raw backward BFS at round r) EXACTLY equals a standalone canonical backward BFS at round r, for r=1..6", () => {
    const results = sharedBackwardVerifyWasm(TRACKED_PIECES, 6);
    for (const r of results) {
      console.log(`  round ${r.round}: raw=${r.rawSize} reconstructed=${r.canonReconstructedSize} golden=${r.canonGoldenSize} match=${r.exactMatch} extra=${r.extraInReconstructed} missing=${r.missingFromReconstructed}`);
    }
    const allMatch = results.every((r) => r.exactMatch);
    console.log(`Stop Rule A: ${allMatch ? "PASS -- all rounds exact match" : "FAIL -- mismatch detected, abandon this axis"}`);
    expect(results.length).toBe(6);
    for (const r of results) {
      expect(r.exactMatch, `round ${r.round} mismatch: extra=${r.extraInReconstructed} missing=${r.missingFromReconstructed}`).toBe(true);
    }
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1: smoke test -- single known-rescued fixture", () => {
  it("hard#5 is solved by the shared-backward fallback, replay-verified", () => {
    const scrambled = scrambledFor(5, 70);
    const { seq, stats } = solveCrossSharedBackwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    console.log("smoke test stats:", JSON.stringify(stats));
    expect(seq).not.toBeNull();
    if (seq) {
      const replayed = applySeq(scrambled, seq);
      expect(isCrossSolved(replayed)).toBe(true);
    }
  }, 30_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1: Gate -- 100-scramble correctness", () => {
  it("depth12=90/100, shared-backward fallback=97/100, false solve=0, replay failure=0, residual exactly {normal#28,hard#6,hard#24}", () => {
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

        const { seq } = solveCrossSharedBackwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
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

    console.log(`depth12-only=${depth12Solved}/100 (expect 90), shared-backward fallback=${fallbackSolved}/100 (expect 97)`);
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

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1: Gate -- performance on the 10 depth12-failing scrambles", () => {
  it("compares existing (sequential), shared-forward, and shared-backward fallbacks, per-case timing + peak memory", () => {
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

    function existingFallback(scrambled: MegaminxState): MegaminxTurn[] | null {
      const depth12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
      if (depth12) return depth12;
      const { seq } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
      return seq;
    }

    // Warmup all three paths.
    {
      const warm = scrambledFor(999, 40);
      existingFallback(warm);
      solveCrossSharedForwardFallbackWasm(warm, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      solveCrossSharedBackwardFallbackWasm(warm, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    }

    const memBefore = process.memoryUsage().rss;

    const existingMs: number[] = [];
    const sharedFwdMs: number[] = [];
    const sharedBwdMs: number[] = [];
    const perCase: { key: string; existingMs: number; sharedFwdMs: number; sharedBwdMs: number; sharedBwdStats: string }[] = [];

    for (const { tier, seed } of FAILING) {
      const key = `${tier}#${seed}`;
      const length = TIER_LENGTH[tier];
      const scrambled = scrambledFor(seed, length);

      const t0 = performance.now();
      const exSeq = existingFallback(scrambled);
      const exMs = performance.now() - t0;
      existingMs.push(exMs);

      const t1 = performance.now();
      const sf = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      const sfMs = performance.now() - t1;
      sharedFwdMs.push(sfMs);

      const t2 = performance.now();
      const sb = solveCrossSharedBackwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      const sbMs = performance.now() - t2;
      sharedBwdMs.push(sbMs);

      if (exSeq) expect(isCrossSolved(applySeq(scrambled, exSeq)), `existing ${key}`).toBe(true);
      if (sf.seq) expect(isCrossSolved(applySeq(scrambled, sf.seq)), `shared-forward ${key}`).toBe(true);
      if (sb.seq) expect(isCrossSolved(applySeq(scrambled, sb.seq)), `shared-backward ${key}`).toBe(true);

      perCase.push({ key, existingMs: exMs, sharedFwdMs: sfMs, sharedBwdMs: sbMs, sharedBwdStats: JSON.stringify(sb.stats) });
    }

    const memAfter = process.memoryUsage().rss;

    console.log(`Gate: process RSS before=${(memBefore / 1e6).toFixed(1)}MB after=${(memAfter / 1e6).toFixed(1)}MB delta=${((memAfter - memBefore) / 1e6).toFixed(1)}MB`);
    console.log(`Gate: ${summarize("existing (sequential) fallback", existingMs)}`);
    console.log(`Gate: ${summarize("shared-forward fallback", sharedFwdMs)}`);
    console.log(`Gate: ${summarize("shared-backward fallback", sharedBwdMs)}`);
    for (const c of perCase) {
      console.log(`  ${c.key}: existing=${c.existingMs.toFixed(0)}ms sharedFwd=${c.sharedFwdMs.toFixed(0)}ms sharedBwd=${c.sharedBwdMs.toFixed(0)}ms  stats=${c.sharedBwdStats}`);
    }

    const sortedBwd = [...sharedBwdMs].sort((a, b) => a - b);
    const maxBwd = sortedBwd[sortedBwd.length - 1];
    const overBudget = sharedBwdMs.filter((v) => v >= 3000).length;
    const overInternalTarget = sharedBwdMs.filter((v) => v >= 2900).length;
    console.log(`Gate: shared-backward MAX=${maxBwd.toFixed(0)}ms, ${overBudget}/10 exceeded 3000ms, ${overInternalTarget}/10 exceeded internal 2900ms target`);

    expect(perCase.length).toBe(10);
  }, 900_000);
});
