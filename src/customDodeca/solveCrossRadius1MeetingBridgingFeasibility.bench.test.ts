/**
 * MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1 -- pure
 * prototype/diagnostic Sprint. NO new search algorithm, NO production
 * change: radius1BridgeRunWasm re-runs the SAME depth12/depth13
 * diagnostic pipeline (byte-identical to the accepted V2 production
 * search) and only adds a read-only post-hoc question -- among the
 * canonical-key radius-1 pairs the previous Sprint found in abundance, how
 * many correspond to a REAL close state pair, and how many of THOSE are
 * bridgeable by a small (<=3), exhaustively-enumerated fixed sequence of
 * genuine moves? Every "success" is independently replay-verified here in
 * JS from the ORIGINAL scrambled state, not just trusted from Rust-side
 * bookkeeping.
 */
import { describe, it, expect } from "vitest";
import { radius1BridgeRunWasm, diagnosticRunV2Wasm, type Radius1Stats, type Radius1Solution } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;

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

const resultsByFixture = new Map<string, { stats: Radius1Stats; solutions: Radius1Solution[] }>();
const jsVerifiedByFixture = new Map<string, { attempted: number; validSolved: number; falseSolve: number; minBridgeDepth: number | null }>();

function runFixture(f: Fixture): { stats: Radius1Stats; solutions: Radius1Solution[]; scrambled: MegaminxState } {
  const scrambled = scrambledFor(f.tier, f.seed);
  const { stats, solutions } = radius1BridgeRunWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
  resultsByFixture.set(f.key, { stats, solutions });

  let attempted = 0;
  let validSolved = 0;
  let falseSolve = 0;
  let minBridgeDepth: number | null = null;
  for (const sol of solutions) {
    attempted++;
    const replayed = applySeq(scrambled, sol.seq);
    const solved = isCrossSolved(replayed);
    if (solved) {
      validSolved++;
      if (minBridgeDepth === null || sol.bridgeDepth < minBridgeDepth) minBridgeDepth = sol.bridgeDepth;
    } else {
      falseSolve++;
    }
  }
  jsVerifiedByFixture.set(f.key, { attempted, validSolved, falseSolve, minBridgeDepth });
  return { stats, solutions, scrambled };
}

describe("MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1: Gate A -- radius-1 candidate extraction", () => {
  it("residual 3 + comparison 2: candidates reproduced, slot histogram, distribution", () => {
    for (const f of ALL_FIXTURES) {
      const { stats } = runFixture(f);
      const uniqueChangedSlots = stats.slotHistogram.filter((c) => c > 0).length;
      console.log(
        `Gate A ${f.key}: exactMeetingAlreadyFound=${stats.exactMeetingAlreadyFound} totalRadius1Candidates=${stats.totalRadius1Candidates} truncated=${stats.candidatesTruncated} uniqueChangedSlots=${uniqueChangedSlots}/5 slotHistogram=[${stats.slotHistogram.join(",")}] forwardFinal=${stats.forwardFinalSize} backwardFinal=${stats.backwardFinalSize}`,
      );
      expect(stats.totalRadius1Candidates, `${f.key}: expected radius-1 candidates to be reproduced`).toBeGreaterThan(0);
    }
  }, 180_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1: Gate B+C -- real-space hamming + bridge-depth distribution", () => {
  it("residual 3 + comparison 2: realHamming breakdown, bridge success rate", () => {
    console.log("\nGate B+C table:");
    console.log("fixture    | candidates | h=1(real) | h=2 | h=3 | h=4 | h5+ | bridge d1 | d2 | d3 | notFound | validSolutions");
    for (const f of ALL_FIXTURES) {
      const r = resultsByFixture.get(f.key)!;
      const s = r.stats;
      console.log(
        `${f.key.padEnd(10)} | ${s.totalRadius1Candidates.toString().padStart(10)} | ${s.realHammingCounts.h1.toString().padStart(9)} | ${s.realHammingCounts.h2.toString().padStart(3)} | ${s.realHammingCounts.h3.toString().padStart(3)} | ${s.realHammingCounts.h4.toString().padStart(3)} | ${s.realHammingCounts.h5Plus.toString().padStart(3)} | ${s.bridgeDepthCounts.d1.toString().padStart(9)} | ${s.bridgeDepthCounts.d2.toString().padStart(2)} | ${s.bridgeDepthCounts.d3.toString().padStart(2)} | ${s.bridgeNotFoundCount.toString().padStart(8)} | ${s.totalInternallyVerifiedSolutions}`,
      );
    }
    for (const f of ALL_FIXTURES) {
      const s = resultsByFixture.get(f.key)!.stats;
      expect(s.candidatesTested).toBe(s.realHammingCounts.h1);
      expect(s.realHammingCounts.h1).toBe(s.bridgeDepthCounts.d1 + s.bridgeDepthCounts.d2 + s.bridgeDepthCounts.d3 + s.bridgeNotFoundCount);
    }
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1: Gate D -- reconstruction + JS-side replay verification", () => {
  it("every internally-verified solution replays correctly from the ORIGINAL scrambled state (false solve = 0)", () => {
    console.log("\nGate D replay verification:");
    let totalFalseSolve = 0;
    let totalValid = 0;
    for (const f of ALL_FIXTURES) {
      const v = jsVerifiedByFixture.get(f.key)!;
      console.log(`  ${f.key}: solutionsReturned=${v.attempted} jsReplayValid=${v.validSolved} falseSolve=${v.falseSolve} minBridgeDepth=${v.minBridgeDepth ?? "N/A"}`);
      totalFalseSolve += v.falseSolve;
      totalValid += v.validSolved;
    }
    console.log(`  TOTAL: validSolved=${totalValid} falseSolve=${totalFalseSolve}`);
    expect(totalFalseSolve).toBe(0);

    for (const f of RESIDUALS) {
      const v = jsVerifiedByFixture.get(f.key)!;
      console.log(`  residual ${f.key}: rescued via bridge = ${v.validSolved > 0}`);
    }
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1: Gate E -- cost measurement vs depth14 reference", () => {
  it("T_depth13_existing vs T_radius1_total (extraction+bridge+reconstruction overhead by difference)", () => {
    console.log("\nGate E cost measurement (residual 3 only, depth14 reference = ~6,460ms/fixture from the prior Sprint's Gate F):");
    console.log("fixture    | T_depth13_existing(ms) | T_radius1_total(ms) | overhead_est(ms)");
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.seed);

      // Warmup (JIT/wasm instance already warm from earlier gates, but keep explicit for this isolated measurement).
      diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
      radius1BridgeRunWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);

      const t0 = performance.now();
      diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
      const tDepth13 = performance.now() - t0;

      const t1 = performance.now();
      radius1BridgeRunWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const tRadius1Total = performance.now() - t1;

      const overhead = tRadius1Total - tDepth13;
      console.log(`${f.key.padEnd(10)} | ${tDepth13.toFixed(0).padStart(22)} | ${tRadius1Total.toFixed(0).padStart(19)} | ${overhead.toFixed(0).padStart(15)}`);
    }
    console.log("  (T_radius1_total re-runs phase1+phase2 from scratch internally, same as T_depth13_existing -- overhead_est = extraction+bridge-test+reconstruction cost by subtraction, not an internal Rust-side timer breakdown, since wasm32-unknown-unknown has no working clock; this project's established convention for all prior tail-cost Sprints.)");
    expect(true).toBe(true);
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1: Gate F -- safety", () => {
  it("false solve = 0, replay failure = 0 (same data as Gate D), existing 97/100 completeness regression = 0", () => {
    let totalFalseSolve = 0;
    for (const f of ALL_FIXTURES) totalFalseSolve += jsVerifiedByFixture.get(f.key)!.falseSolve;
    expect(totalFalseSolve).toBe(0);
  }, 5_000);

  it("existing 100-scramble completeness unaffected (still 90/97/residual-exactly-3, confirming no side effects from this Sprint's additions)", async () => {
    const { solveCrossWasm, solveCrossSharedForwardFallbackV2Wasm } = await import("./megaminxSearchWasm");
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
    console.log(`Gate F regression: depth12=${depth12Solved}/100, V2 fallback=${fallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});
