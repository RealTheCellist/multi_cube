/**
 * MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1 -- Gate A/B/C/D/E for
 * the Rust port of the JS-validated backward-only C5 symmetry
 * canonicalization candidate (see wasm-search/src/lib.rs's own
 * symmetry_candidate_search_impl / sym_selftest and
 * megaminxSearchWasm.ts's own solveCrossSymmetryCandidateWasm /
 * symSelftestWasm). Isolated: calls a separate Wasm export
 * (solve_cross_symmetry_candidate), never solve_cross/solveCrossWasm --
 * production's own solveCross/megaminxSolver.ts pipeline is untouched.
 *
 * Absolute constraint carried over from the JS Sprint: every "found"
 * solution is verified by a FULL replay against the real geometric
 * MegaminxState (never just a key/length comparison).
 */
import { describe, it, expect } from "vitest";
import { solveCrossSymmetryCandidateWasm, solveCrossWasm, symSelftestWasm } from "./megaminxSearchWasm";
import { applyMegaminxMove, applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4]; // face 0's own 5 edges -- same as solveCrossWasm's own sortedFirstLayerEdgePositions

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

function isCrossSolved(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate A -- Rust symmetry correctness", () => {
  it("SOLVED-invariant 200/200, order-5 200/200, sequence-conjugation 200/200, move-conjugation 500/500", () => {
    const result = symSelftestWasm(200, 200, 200, 500);
    console.log(`Gate A (Rust): solvedInvariant=${result.solvedInvariant}/200 order5=${result.order5}/200 seqConj=${result.sequenceConjugation}/200 moveConj=${result.moveConjugation}/500`);
    expect(result.solvedInvariant).toBe(200);
    expect(result.order5).toBe(200);
    expect(result.sequenceConjugation).toBe(200);
    expect(result.moveConjugation).toBe(500);
  });
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate B -- correctness on small fixtures", () => {
  it("solves 150 light-to-moderate scrambles (5-40 moves) with the Rust candidate and replay-verifies every solution", () => {
    let falseCount = 0;
    let solvedCount = 0;
    const falseSeeds: number[] = [];
    for (let seed = 1; seed <= 150; seed++) {
      const length = 5 + (seed % 36);
      const turns = randomMegaminxScramble(length, mulberry32(seed * 131 + length * 997));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      const { seq, stats } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 12, 300_000);
      if (!seq) {
        console.log(`  seed ${seed} (len ${length}): NOT SOLVED, term=${stats.terminationReason}`);
        continue;
      }
      solvedCount++;
      const replayed = applySeq(scrambled, seq);
      const ok = isCrossSolved(replayed);
      if (!ok) {
        falseCount++;
        falseSeeds.push(seed);
        console.log(`  seed ${seed}: FALSE SOLVE -- claimed length ${seq.length} but replay does not solve the cross`);
      }
    }
    console.log(`Gate B: solved ${solvedCount}/150, false solves = ${falseCount} ${falseSeeds.length > 0 ? `[${falseSeeds.join(",")}]` : ""}`);
    expect(falseCount).toBe(0);
    expect(solvedCount).toBeGreaterThan(0);
  }, 300_000);
});

const RESIDUAL_6 = ["normal#28", "hard#6", "hard#24", "hard#30", "hard#31", "hard#39"];
const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledStateFor(key: string): MegaminxState {
  const [tier, seedStr] = key.split("#");
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(Number(seedStr) * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate B2 -- the 6 residual fixtures", () => {
  it("runs the Rust candidate (maxHalfDepth=13, maxFrontierSize=1,500,000 -- matching production) against all 6 structural-residual fixtures and replay-verifies any solution found", () => {
    let rescued = 0;
    let falseCount = 0;
    for (const key of RESIDUAL_6) {
      const scrambled = scrambledStateFor(key);
      const t0 = performance.now();
      const { seq, stats } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
      const ms = performance.now() - t0;
      if (!seq) {
        console.log(`  ${key}: NOT SOLVED, term=${stats.terminationReason}, roundsCompleted=${stats.roundsCompleted}, fwdRounds=${stats.forwardRounds}, bwdRounds=${stats.backwardRounds}, fwdFinal=${stats.forwardFinalSize}, bwdCanonFinal=${stats.backwardCanonicalFinalSize}, peakFwd=${stats.peakForwardFrontier}, peakBwd=${stats.peakBackwardFrontier}, ${ms.toFixed(0)}ms`);
        continue;
      }
      const replayed = applySeq(scrambled, seq);
      const ok = isCrossSolved(replayed);
      console.log(`  ${key}: ${ok ? "SOLVED" : "FALSE SOLVE"} solLen=${seq.length} roundsCompleted=${stats.roundsCompleted} fwdRounds=${stats.forwardRounds} bwdRounds=${stats.backwardRounds} fwdFinal=${stats.forwardFinalSize} bwdCanonFinal=${stats.backwardCanonicalFinalSize} peakFwd=${stats.peakForwardFrontier} peakBwd=${stats.peakBackwardFrontier} ${ms.toFixed(0)}ms`);
      if (ok) rescued++;
      else falseCount++;
    }
    console.log(`Gate B2: rescued ${rescued}/6, false solves = ${falseCount}`);
    expect(falseCount).toBe(0);
  }, 900_000);
});

const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate C -- 100-scramble regression at production maxHalfDepth=12", () => {
  it("matches or beats the production baseline's 90/100 completeness, with 0 false solves, across the full fixture set", () => {
    let solved = 0;
    let falseCount = 0;
    const failedKeys: string[] = [];
    const falseKeys: string[] = [];
    const t0 = performance.now();
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        const { seq } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
        if (!seq) {
          failedKeys.push(`${tier}#${seed}`);
          continue;
        }
        const replayed = applySeq(scrambled, seq);
        if (isCrossSolved(replayed)) {
          solved++;
        } else {
          falseCount++;
          falseKeys.push(`${tier}#${seed}`);
        }
      }
    }
    const totalMs = performance.now() - t0;
    console.log(`Gate C: solved ${solved}/100 (production baseline: 90/100), false solves = ${falseCount}, total wall ${(totalMs / 1000).toFixed(1)}s`);
    if (falseKeys.length > 0) console.log(`  FALSE SOLVES: ${falseKeys.join(", ")}`);
    console.log(`  failed (not solved): ${failedKeys.join(", ")}`);
    expect(falseCount).toBe(0);
    expect(solved).toBeGreaterThanOrEqual(90);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate D -- full 100-scramble at maxHalfDepth=13 (completeness reproduction)", () => {
  it("targets 97/100 with the Rust candidate, expecting the residual to be exactly {normal#28, hard#6, hard#24} -- matching the JS prototype's own Gate C2 result", () => {
    let solved = 0;
    let falseCount = 0;
    const failedKeys: string[] = [];
    const falseKeys: string[] = [];
    const perScrambleMs: number[] = [];
    const t0 = performance.now();
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        const ts0 = performance.now();
        const { seq } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
        perScrambleMs.push(performance.now() - ts0);
        if (!seq) {
          failedKeys.push(`${tier}#${seed}`);
          continue;
        }
        const replayed = applySeq(scrambled, seq);
        if (isCrossSolved(replayed)) {
          solved++;
        } else {
          falseCount++;
          falseKeys.push(`${tier}#${seed}`);
        }
      }
    }
    const totalMs = performance.now() - t0;
    perScrambleMs.sort((a, b) => a - b);
    const avg = perScrambleMs.reduce((a, b) => a + b, 0) / perScrambleMs.length;
    const p95 = perScrambleMs[Math.floor(perScrambleMs.length * 0.95)];
    const max = perScrambleMs[perScrambleMs.length - 1];
    console.log(`Gate D: solved ${solved}/100 at maxHalfDepth=13 with Rust canonicalized backward, false solves = ${falseCount}, total wall ${(totalMs / 1000).toFixed(1)}s`);
    console.log(`  per-scramble ms: avg=${avg.toFixed(0)} p95=${p95.toFixed(0)} max=${max.toFixed(0)}`);
    if (falseKeys.length > 0) console.log(`  FALSE SOLVES: ${falseKeys.join(", ")}`);
    console.log(`  failed (not solved): ${failedKeys.join(", ")}`);
    expect(falseCount).toBe(0);
    expect(failedKeys.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
    expect(solved).toBe(97);
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
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P90=${percentile(sorted, 90).toFixed(1)} P95=${percentile(sorted, 95).toFixed(1)} MAX=${sorted[sorted.length - 1].toFixed(1)} n=${values.length}`;
}

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1: Gate E -- production performance", () => {
  it("measures Rust candidate timing/memory/frontier against production solveCrossWasm baselines (depth12 and depth13-no-symmetry)", () => {
    const memBefore = process.memoryUsage().rss;

    // Warmup (JIT/allocator warmup, matches this project's own established convention).
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      solveCrossSymmetryCandidateWasm(warm, TRACKED_PIECES, 13, 1_500_000);
      solveCrossWasm(warm, TRACKED_PIECES, 12, 1_500_000);
    }

    const candidateMs: number[] = [];
    const baselineDepth12Ms: number[] = [];
    const baselineDepth13Ms: number[] = [];
    let peakFwdFrontier = 0;
    let peakBwdFrontier = 0;
    let candidateSolved = 0;
    let baseline12Solved = 0;
    let baseline13Solved = 0;

    for (const { length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);

        const t0 = performance.now();
        const { seq: candSeq, stats } = solveCrossSymmetryCandidateWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
        candidateMs.push(performance.now() - t0);
        if (candSeq) candidateSolved++;
        peakFwdFrontier = Math.max(peakFwdFrontier, stats.peakForwardFrontier);
        peakBwdFrontier = Math.max(peakBwdFrontier, stats.peakBackwardFrontier);

        const t1 = performance.now();
        const base12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, 1_500_000);
        baselineDepth12Ms.push(performance.now() - t1);
        if (base12) baseline12Solved++;

        const t2 = performance.now();
        const base13 = solveCrossWasm(scrambled, TRACKED_PIECES, 13, 1_500_000);
        baselineDepth13Ms.push(performance.now() - t2);
        if (base13) baseline13Solved++;
      }
    }

    const memAfter = process.memoryUsage().rss;

    console.log(`Gate E: process RSS before=${(memBefore / 1e6).toFixed(1)}MB after=${(memAfter / 1e6).toFixed(1)}MB delta=${((memAfter - memBefore) / 1e6).toFixed(1)}MB`);
    console.log(`Gate E: ${summarize("candidate (depth13+symmetry)", candidateMs)}`);
    console.log(`Gate E: ${summarize("baseline (depth12, production)", baselineDepth12Ms)}`);
    console.log(`Gate E: ${summarize("baseline (depth13, no symmetry)", baselineDepth13Ms)}`);
    console.log(`Gate E: solved -- candidate=${candidateSolved}/100 baseline12=${baseline12Solved}/100 baseline13=${baseline13Solved}/100`);
    console.log(`Gate E: peak forward frontier=${peakFwdFrontier} peak backward (canonical) frontier=${peakBwdFrontier}`);

    const sortedCandidate = [...candidateMs].sort((a, b) => a - b);
    const maxCandidateMs = sortedCandidate[sortedCandidate.length - 1];
    const overBudget = candidateMs.filter((ms) => ms >= 3000).length;
    console.log(`Gate E: candidate MAX=${maxCandidateMs.toFixed(0)}ms (3000ms budget), ${overBudget}/100 scrambles exceeded 3000ms`);
    // Not asserted pass/fail here -- the 3s-budget verdict belongs in this
    // Sprint's own Decision (A/B/C/D), not a hard test failure, since a
    // miss here is a real, reportable finding rather than a test bug.
    expect(candidateSolved).toBeGreaterThan(0);
  }, 900_000);
});
