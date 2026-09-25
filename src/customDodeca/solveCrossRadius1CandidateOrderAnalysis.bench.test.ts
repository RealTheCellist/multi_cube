/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1 --
 * pure measurement Sprint. NO candidate sorting change, NO new heuristic
 * search, NO bridge-depth change, NO canonicalization change, NO
 * production/depth14 change. Asks whether information already present
 * per radius-1 candidate (rank, canonical C5 power, discovery order,
 * permutation-vs-orientation mismatch type) correlates with bridge
 * success, i.e. whether a FUTURE reordering Sprint would have real signal
 * to exploit, or whether success is already close to uniformly
 * distributed across the existing candidate order.
 */
import { describe, it, expect } from "vitest";
import { radius1BridgeEarlyExitWasm, radius1CandidateOrderAnalysisWasm, type Radius1CandidateOrderRow } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;
const CANDIDATE_CAP = 2000;

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

const EXPECTED_EARLY_EXIT_INDEX: Record<string, number> = { "normal#28": 4, "hard#6": 11, "hard#24": 18, "hard#5": 3, "hard#31": 2 };

const rowsByFixture = new Map<string, Radius1CandidateOrderRow[]>();

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1: Gate A -- baseline reproduction", () => {
  it("early-exit winning candidate index reproduced exactly: normal#28=4, hard#6=11, hard#24=18, hard#5=3, hard#31=2", () => {
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const r = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      console.log(`Gate A ${f.key}: candidatesScanned=${r.candidatesScanned}/${r.totalCandidates} bridgeDepth=${r.bridgeDepth} status=${r.status}`);
      expect(r.status, `${f.key}`).toBe(1);
      expect(r.candidatesScanned, `${f.key}`).toBe(EXPECTED_EARLY_EXIT_INDEX[f.key]);
    }
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1: Gate B -- feature collection (no extra search)", () => {
  it(`residual 3 + comparison 2: first ${CANDIDATE_CAP} candidates each, feature set + ground truth`, () => {
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { stats, rows } = radius1CandidateOrderAnalysisWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, CANDIDATE_CAP);
      rowsByFixture.set(f.key, rows);
      console.log(`Gate B ${f.key}: analyzed=${stats.analyzed}/${stats.totalCandidates} truePositive=${stats.truePositiveCount} (${((stats.truePositiveCount / stats.analyzed) * 100).toFixed(1)}%)`);
      expect(rows.length).toBe(stats.analyzed);
    }
    expect(rowsByFixture.size).toBe(5);
  }, 300_000);
});

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function rate(xs: boolean[]): number {
  return xs.length === 0 ? NaN : xs.filter(Boolean).length / xs.length;
}

const RANK_BUCKETS: [number, number][] = [
  [1, 5],
  [6, 10],
  [11, 20],
  [21, 50],
  [51, 100],
  [101, 250],
  [251, 500],
  [501, 1000],
  [1001, 2000],
];

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1: Gate C -- success distribution + feature comparison", () => {
  it("compares valid-bridge vs invalid candidates' features, and success rate by rank bucket, per fixture", () => {
    for (const f of ALL_FIXTURES) {
      const rows = rowsByFixture.get(f.key)!;
      const ok = rows.filter((r) => r.bridgeFound);
      const bad = rows.filter((r) => !r.bridgeFound);

      console.log(`\n=== ${f.key} (analyzed=${rows.length}, valid=${ok.length}, invalid=${bad.length}) ===`);
      console.log("feature                    | valid-bridge mean/rate | invalid mean/rate");
      console.log(`forwardDepth                | ${mean(ok.map((r) => r.forwardDepth)).toFixed(2).padStart(20)}   | ${mean(bad.map((r) => r.forwardDepth)).toFixed(2)}`);
      console.log(`backwardDepth               | ${mean(ok.map((r) => r.backwardDepth)).toFixed(2).padStart(20)}   | ${mean(bad.map((r) => r.backwardDepth)).toFixed(2)}`);
      console.log(`changedSlot                 | ${mean(ok.map((r) => r.changedSlot)).toFixed(2).padStart(20)}   | ${mean(bad.map((r) => r.changedSlot)).toFixed(2)}`);
      console.log(`forwardCanonicalPower       | ${mean(ok.map((r) => r.forwardCanonicalPower)).toFixed(2).padStart(20)}   | ${mean(bad.map((r) => r.forwardCanonicalPower)).toFixed(2)}`);
      console.log(`backwardCanonicalPower      | ${mean(ok.map((r) => r.backwardCanonicalPower)).toFixed(2).padStart(20)}   | ${mean(bad.map((r) => r.backwardCanonicalPower)).toFixed(2)}`);
      console.log(`permutationDiffers rate     | ${(rate(ok.map((r) => r.permutationDiffers)) * 100).toFixed(1).padStart(19)}% | ${(rate(bad.map((r) => r.permutationDiffers)) * 100).toFixed(1)}%`);
      console.log(`orientationDiffers rate     | ${(rate(ok.map((r) => r.orientationDiffers)) * 100).toFixed(1).padStart(19)}% | ${(rate(bad.map((r) => r.orientationDiffers)) * 100).toFixed(1)}%`);
      console.log(`forwardDiscoveryIndex(fid)  | ${mean(ok.map((r) => r.forwardDiscoveryIndex)).toFixed(0).padStart(20)}   | ${mean(bad.map((r) => r.forwardDiscoveryIndex)).toFixed(0)}`);
      console.log(`backwardDiscoveryIndex(bid) | ${mean(ok.map((r) => r.backwardDiscoveryIndex)).toFixed(0).padStart(20)}   | ${mean(bad.map((r) => r.backwardDiscoveryIndex)).toFixed(0)}`);

      const overallRate = ok.length / rows.length;
      console.log(`\nrank bucket success rate (overall=${(overallRate * 100).toFixed(1)}%):`);
      console.log("  rank        | n    | successes | rate    | deviation from overall");
      for (const [lo, hi] of RANK_BUCKETS) {
        const bucket = rows.filter((r) => r.candidateIndex + 1 >= lo && r.candidateIndex + 1 <= hi);
        if (bucket.length === 0) continue;
        const succ = bucket.filter((r) => r.bridgeFound).length;
        const bucketRate = succ / bucket.length;
        const dev = ((bucketRate - overallRate) / overallRate) * 100;
        console.log(`  ${lo}-${hi}`.padEnd(14) + `| ${bucket.length.toString().padStart(4)} | ${succ.toString().padStart(9)} | ${(bucketRate * 100).toFixed(1).padStart(6)}% | ${dev >= 0 ? "+" : ""}${dev.toFixed(0)}%`);
      }

      const p = overallRate;
      const expectedFirstSuccessIndex = 1 / p;
      const observed = EXPECTED_EARLY_EXIT_INDEX[f.key];
      console.log(`\nExpected first-success index under uniform Bernoulli(p=${(p * 100).toFixed(1)}%) model: ${expectedFirstSuccessIndex.toFixed(1)}`);
      console.log(`Observed early-exit index: ${observed}  (ratio observed/expected = ${(observed / expectedFirstSuccessIndex).toFixed(2)}x)`);
    }
    expect(rowsByFixture.size).toBe(5);
  }, 10_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1: Gate D -- Stop Rule verdict", () => {
  it("computes whether rank-bucket success rate deviates meaningfully from a flat/uniform baseline (no ordering/sorting performed)", () => {
    console.log("\nGate D summary (max |deviation from overall rate| across buckets with n>=20, per fixture):");
    for (const f of ALL_FIXTURES) {
      const rows = rowsByFixture.get(f.key)!;
      const overallRate = rows.filter((r) => r.bridgeFound).length / rows.length;
      let maxDev = 0;
      for (const [lo, hi] of RANK_BUCKETS) {
        const bucket = rows.filter((r) => r.candidateIndex + 1 >= lo && r.candidateIndex + 1 <= hi);
        if (bucket.length < 20) continue;
        const bucketRate = bucket.filter((r) => r.bridgeFound).length / bucket.length;
        const dev = Math.abs((bucketRate - overallRate) / overallRate);
        if (dev > maxDev) maxDev = dev;
      }
      console.log(`  ${f.key}: overallRate=${(overallRate * 100).toFixed(1)}% maxBucketDeviation=${(maxDev * 100).toFixed(0)}%`);
    }
    // No sorting, no algorithm change -- this test only prints the summary for the report; no pass/fail signal is meaningful here beyond "did Gate B/C run".
    expect(rowsByFixture.size).toBe(5);
  }, 5_000);
});
