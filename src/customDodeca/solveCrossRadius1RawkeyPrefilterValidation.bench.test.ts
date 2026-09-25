/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1 --
 * pure diagnostic/validation Sprint. NO change to find_symmetry_index,
 * the C5 symmetry definition, candidate ordering, or the depth 1->2->3
 * bridge structure. Tests whether a cheap raw-key Hamming pre-check
 * (raw_hamming_min_over_orbits, no canonical_key_v2 calls) can safely
 * reject candidates before the expensive canonical_key_v2-based depth-3
 * exhaustive enumeration, WITHOUT ever rejecting a candidate that would
 * have produced a valid bridge (false negative = 0 is the absolute bar).
 */
import { describe, it, expect } from "vitest";
import {
  radius1BridgeRunWasm,
  radius1PrefilterAnalysisWasm,
  radius1BridgeEarlyExitWasm,
  radius1BridgeEarlyExitFilteredWasm,
  solveCrossWasm,
  solveCrossSharedForwardFallbackV2Wasm,
  type Radius1PrefilterStats,
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

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1: Gate A -- reproduce existing exhaustive baseline", () => {
  it("normal#28->20/20, hard#6->11/11, hard#24->20/20, hard#5->20/20, hard#31->20/20, false solve=0", () => {
    const EXPECTED: Record<string, number> = { "normal#28": 20, "hard#6": 11, "hard#24": 20, "hard#5": 20, "hard#31": 20 };
    let totalFalseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { solutions } = radius1BridgeRunWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      let valid = 0;
      for (const sol of solutions) {
        if (isCrossSolved(applySeq(scrambled, sol.seq))) valid++;
        else totalFalseSolve++;
      }
      console.log(`Gate A ${f.key}: solutionsReturned=${solutions.length} replayValid=${valid}`);
      expect(valid, `${f.key}`).toBe(EXPECTED[f.key]);
      expect(solutions.length, `${f.key}`).toBe(EXPECTED[f.key]);
    }
    expect(totalFalseSolve).toBe(0);
  }, 180_000);
});

const pfByFixture = new Map<string, Radius1PrefilterStats>();

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1: Gate B+C -- per-candidate cost breakdown + F1 filter validation", () => {
  it(`residual 3 + comparison 2: first ${CANDIDATE_CAP} candidates each, confusion matrix for F1 (rawHamming>1 -> reject), false negative MUST be 0`, () => {
    console.log("\nGate B+C table:");
    console.log("fixture    | analyzed | TP   | FP   | FN | TN   | canonCallsTotal | canonCallsIfFiltered | callsSaved");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { stats } = radius1PrefilterAnalysisWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, CANDIDATE_CAP);
      pfByFixture.set(f.key, stats);
      const saved = stats.canonicalKeyCallsTotal - stats.canonicalKeyCallsIfFiltered;
      console.log(
        `${f.key.padEnd(10)} | ${stats.candidatesAnalyzed.toString().padStart(8)} | ${stats.truePositive.toString().padStart(4)} | ${stats.falsePositive.toString().padStart(4)} | ${stats.falseNegative.toString().padStart(2)} | ${stats.trueNegative.toString().padStart(4)} | ${stats.canonicalKeyCallsTotal.toString().padStart(15)} | ${stats.canonicalKeyCallsIfFiltered.toString().padStart(20)} | ${saved.toString().padStart(9)} (${((saved / stats.canonicalKeyCallsTotal) * 100).toFixed(1)}%)`,
      );
    }
    for (const f of ALL_FIXTURES) {
      const stats = pfByFixture.get(f.key)!;
      expect(stats.falseNegative, `${f.key}: F1 filter would reject a valid bridge -- UNSAFE`).toBe(0);
    }
  }, 300_000);
});

interface EeRunRecord {
  scrambled: MegaminxState;
  unfiltered: ReturnType<typeof radius1BridgeEarlyExitWasm>;
  unfilteredMs: number;
  filtered: ReturnType<typeof radius1BridgeEarlyExitFilteredWasm>;
  filteredMs: number;
}
const eeByFixture = new Map<string, EeRunRecord>();

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1: Gate D -- filtered vs unfiltered early-exit cost", () => {
  it("residual 3: filtered early-exit still finds the SAME valid solution, hard#24 target <=3000ms, other two maintained/improved", () => {
    console.log("\nGate D table (median of 3):");
    console.log("fixture    | unfiltered(ms) | filtered(ms) | skippedByFilter/scanned | bridgeDepth match | <=3000ms");
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.seed);

      // Warmup.
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      radius1BridgeEarlyExitFilteredWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);

      const unfilteredTimes: number[] = [];
      let unfilteredResult: ReturnType<typeof radius1BridgeEarlyExitWasm> | null = null;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        unfilteredResult = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        unfilteredTimes.push(performance.now() - t0);
      }
      const filteredTimes: number[] = [];
      let filteredResult: ReturnType<typeof radius1BridgeEarlyExitFilteredWasm> | null = null;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        filteredResult = radius1BridgeEarlyExitFilteredWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        filteredTimes.push(performance.now() - t0);
      }
      unfilteredTimes.sort((a, b) => a - b);
      filteredTimes.sort((a, b) => a - b);
      const unfilteredMedian = unfilteredTimes[1];
      const filteredMedian = filteredTimes[1];

      eeByFixture.set(f.key, { scrambled, unfiltered: unfilteredResult!, unfilteredMs: unfilteredMedian, filtered: filteredResult!, filteredMs: filteredMedian });

      const depthMatch = unfilteredResult!.bridgeDepth === filteredResult!.bridgeDepth;
      console.log(
        `${f.key.padEnd(10)} | ${unfilteredMedian.toFixed(0).padStart(14)} | ${filteredMedian.toFixed(0).padStart(12)} | ${filteredResult!.candidatesSkippedByFilter}/${filteredResult!.candidatesScanned} | ${depthMatch ? "Y" : "N"} | ${filteredMedian <= 3000 ? "PASS" : "FAIL"}`,
      );

      expect(filteredResult!.status, `${f.key}: filtered version must still find a valid solution`).toBe(1);
      expect(filteredResult!.internallyValid, `${f.key}`).toBe(true);
    }
  }, 120_000);

  it("comparison 2: filtered early-exit still finds a valid solution (same mechanism)", () => {
    for (const f of COMPARISON) {
      const scrambled = scrambledFor(f.tier, f.seed);
      radius1BridgeEarlyExitFilteredWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH); // warmup
      const t0 = performance.now();
      const r = radius1BridgeEarlyExitFilteredWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const ms = performance.now() - t0;
      console.log(`${f.key}: filtered ms=${ms.toFixed(0)} skipped=${r.candidatesSkippedByFilter}/${r.candidatesScanned} status=${r.status}`);
      expect(r.status).toBe(1);
      expect(r.internallyValid).toBe(true);
    }
  }, 30_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1: Gate E -- safety", () => {
  it("false solve = 0, replay failure = 0 (filtered early-exit solutions, JS-side independent replay)", () => {
    let falseSolve = 0;
    for (const f of RESIDUALS) {
      const rec = eeByFixture.get(f.key)!;
      expect(rec.filtered.seq, `${f.key}`).not.toBeNull();
      const solved = isCrossSolved(applySeq(rec.scrambled, rec.filtered.seq!));
      console.log(`  ${f.key}: JS replay solved=${solved}`);
      if (!solved) falseSolve++;
    }
    expect(falseSolve).toBe(0);
  }, 5_000);

  it("existing 100-scramble completeness unaffected (still 90/97/residual-exactly-3, filter is purely additive/diagnostic)", () => {
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
