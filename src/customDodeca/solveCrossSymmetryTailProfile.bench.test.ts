/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1 -- pure profiling
 * Sprint: NO algorithm change. Decomposes shared-forward's own validated
 * pipeline into separately-timeable phases (see wasm-search/src/lib.rs's
 * own tail_profile_* dev notes for the T1..T7 breakdown definition) to
 * find out which part of the ~2889-3067ms MAX actually costs the time,
 * before choosing a next optimization axis.
 *
 * Production change: NONE. Calls only the new, fully isolated
 * tail_profile_* Wasm exports (plus solveCrossWasm/solveCrossSymmetryCandidateWasm/
 * solveCrossSharedForwardFallbackWasm as READ-ONLY comparison baselines,
 * never modified). megaminxSolver.ts is not touched at all.
 */
import { describe, it, expect } from "vitest";
import { tailProfilePhase1Wasm, tailProfileRunToRoundWasm, tailProfileMeetingScanWasm, tailProfileReconstructWasm, solveCrossWasm, solveCrossSharedForwardFallbackWasm } from "./megaminxSearchWasm";
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

const TIER_LENGTH: Record<string, number> = { normal: 40, hard: 70 };
function scrambledFor(tier: string, seed: number): MegaminxState {
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface TailProfile {
  key: string;
  t1: number;
  t2Delta: number;
  t3: number;
  t4: number | null; // null if already found/exceeded by end of T3
  t5PerCall: number;
  t6PerCall: number | null; // null if this fixture never finds a match
  fullPipelineMs: number;
  found: boolean;
}

function profileOne(tier: string, seed: number, runs: number): TailProfile {
  const key = `${tier}#${seed}`;
  const scrambled = scrambledFor(tier, seed);

  // T1: phase 1 (raw depth12, forward tracks canon_key inline), median of `runs`.
  const t1Samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const status = tailProfilePhase1Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
    t1Samples.push(performance.now() - t0);
    expect(status, `phase1 status for ${key}`).toBe(0); // 0 = captured, ready for phase2 (this fixture is a known depth12 failure)
  }
  const t1 = median(t1Samples);

  // T2 delta: plain production depth12 (no canon_key tracking) for comparison.
  const t2Samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
    t2Samples.push(performance.now() - t0);
  }
  const plainDepth12 = median(t2Samples);
  const t2Delta = t1 - plainDepth12;

  // Re-run phase1 once more (T1/T2 measurements above each re-ran phase1
  // fresh each time, discarding the resumable state after superseding it --
  // now capture the FINAL phase1 state that T3/T4 will resume from).
  tailProfilePhase1Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000);

  // T3: rounds up to 12 total (this fixture's own backward-only B1..B6 continuation).
  const t3Samples: number[] = [];
  let statusAfterT3 = 0;
  for (let i = 0; i < runs; i++) {
    tailProfilePhase1Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000); // reset resumable state
    const t0 = performance.now();
    const r = tailProfileRunToRoundWasm(TRACKED_PIECES, 12, 1_500_000);
    t3Samples.push(performance.now() - t0);
    statusAfterT3 = r.status;
  }
  const t3 = median(t3Samples);

  // T4: round 13 alone (B7), continuing from T3's own end state -- only
  // meaningful if T3 didn't already find/exceed.
  let t4: number | null = null;
  let found = statusAfterT3 === 1;
  if (statusAfterT3 === 0) {
    const t4Samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      // Rebuild up through round 12 fresh each repeat, then time ONLY round 13.
      tailProfilePhase1Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
      tailProfileRunToRoundWasm(TRACKED_PIECES, 12, 1_500_000);
      const t0 = performance.now();
      const r = tailProfileRunToRoundWasm(TRACKED_PIECES, 13, 1_500_000);
      t4Samples.push(performance.now() - t0);
      found = r.status === 1;
    }
    t4 = median(t4Samples);
  }

  // Leave the resumable state at its FINAL (post round-13) position for T5/T6.
  tailProfilePhase1Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
  tailProfileRunToRoundWasm(TRACKED_PIECES, 12, 1_500_000);
  tailProfileRunToRoundWasm(TRACKED_PIECES, 13, 1_500_000);

  // T5: meeting-scan cost alone, averaged over many repeats (a single scan is too fast to time on its own).
  const scanRepeats = 200;
  const t5t0 = performance.now();
  tailProfileMeetingScanWasm(TRACKED_PIECES, scanRepeats);
  const t5PerCall = (performance.now() - t5t0) / scanRepeats;

  // T6: reconstruction cost alone (scan excluded, see this fn's own Rust dev notes), only if found.
  let t6PerCall: number | null = null;
  if (found) {
    const reconstructRepeats = 2000;
    const t6t0 = performance.now();
    tailProfileReconstructWasm(TRACKED_PIECES, reconstructRepeats);
    t6PerCall = (performance.now() - t6t0) / reconstructRepeats;
  }

  // Full pipeline (shared-forward), for comparison against T1+T3+T4 sum, median of `runs`.
  const fullSamples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
    fullSamples.push(performance.now() - t0);
  }
  const fullPipelineMs = median(fullSamples);

  return { key, t1, t2Delta, t3, t4, t5PerCall, t6PerCall, fullPipelineMs, found };
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1: sanity -- profiled outcome matches shared-forward's own known result", () => {
  it("hard#31 and hard#39 (both >3s, both solve) plus normal#28 (never solves) reproduce the already-validated outcomes", () => {
    for (const [tier, seed, expectFound] of [
      ["hard", 31, true],
      ["hard", 39, true],
      ["normal", 28, false],
    ] as const) {
      const scrambled = scrambledFor(tier, seed);
      const { seq } = solveCrossSharedForwardFallbackWasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);
      if (expectFound) {
        expect(seq, `${tier}#${seed}`).not.toBeNull();
        if (seq) expect(isCrossSolved(applySeq(scrambled, seq)), `${tier}#${seed} replay`).toBe(true);
      } else {
        expect(seq, `${tier}#${seed}`).toBeNull();
      }
    }
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1: T1-T7 breakdown", () => {
  it("profiles hard#31, hard#39 (>3s, solve) and normal#28 (>3s, never solves) with 3 repeats each", () => {
    const targets: [string, number][] = [
      ["hard", 31],
      ["hard", 39],
      ["normal", 28],
    ];
    const results: TailProfile[] = [];
    for (const [tier, seed] of targets) {
      const p = profileOne(tier, seed, 3);
      results.push(p);
      const t3t4Sum = p.t1 + p.t3 + (p.t4 ?? 0);
      const t7 = p.fullPipelineMs - t3t4Sum;
      console.log(`${p.key}: T1(phase1)=${p.t1.toFixed(0)}ms T2delta(canon_key premium)=${p.t2Delta.toFixed(0)}ms T3(B1-B6)=${p.t3.toFixed(0)}ms T4(B7 alone)=${p.t4 !== null ? p.t4.toFixed(0) + "ms" : "n/a (found by T3)"} T5(meeting scan, per-call)=${p.t5PerCall.toFixed(3)}ms T6(reconstruct, per-call)=${p.t6PerCall !== null ? p.t6PerCall.toFixed(4) + "ms" : "n/a (never found)"} | full pipeline=${p.fullPipelineMs.toFixed(0)}ms | T1+T3+T4=${t3t4Sum.toFixed(0)}ms | T7(residual)=${t7.toFixed(0)}ms`);
    }

    console.log("\nSummary table:");
    console.log("key       T1      T3      T4      full    T1+T3+T4  T7(residual)");
    for (const p of results) {
      const t3t4Sum = p.t1 + p.t3 + (p.t4 ?? 0);
      const t7 = p.fullPipelineMs - t3t4Sum;
      console.log(`${p.key.padEnd(10)}${p.t1.toFixed(0).padStart(6)}  ${p.t3.toFixed(0).padStart(6)}  ${(p.t4 ?? 0).toFixed(0).padStart(6)}  ${p.fullPipelineMs.toFixed(0).padStart(6)}  ${t3t4Sum.toFixed(0).padStart(8)}  ${t7.toFixed(0).padStart(6)}`);
    }

    expect(results.length).toBe(3);
  }, 300_000);
});
