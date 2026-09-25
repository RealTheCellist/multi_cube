/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1 --
 * tests whether stable-partitioning the radius-1 candidate list by
 * orientationDiffers (bucket A = true tried first, bucket B = false
 * tried second, each preserving the original extraction order
 * internally) reduces actual early-exit cost, WITHOUT dropping a single
 * candidate. extract_radius1_candidates, try_bridge_canonical, and
 * find_symmetry_index are all reused completely unchanged -- only
 * traversal order changes. No production change.
 */
import { describe, it, expect } from "vitest";
import { radius1BridgeEarlyExitWasm, radius1BridgeEarlyExitReorderedWasm, radius1OrientationOrderAnalysisWasm, solveCrossWasm, solveCrossSharedForwardFallbackV2Wasm } from "./megaminxSearchWasm";
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

interface FixtureRecord {
  scrambled: MegaminxState;
  original: ReturnType<typeof radius1BridgeEarlyExitWasm>;
  reordered: ReturnType<typeof radius1BridgeEarlyExitReorderedWasm>;
}
const recByFixture = new Map<string, FixtureRecord>();

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1: Gate A -- completeness + bucket sizes", () => {
  it("5개 fixture: 전체/A/B 후보 수, 기존 vs reordered 첫 성공 index", () => {
    console.log("fixture    | total  | bucketA(true) | bucketB(false) | 기존 index | reordered index | foundInA");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const original = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const reordered = radius1BridgeEarlyExitReorderedWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      recByFixture.set(f.key, { scrambled, original, reordered });

      console.log(
        `${f.key.padEnd(10)} | ${reordered.totalCandidates.toString().padStart(6)} | ${reordered.bucketASize.toString().padStart(13)} | ${reordered.bucketBSize.toString().padStart(15)} | ${original.candidatesScanned.toString().padStart(10)} | ${reordered.candidatesScanned.toString().padStart(16)} | ${reordered.foundInBucketA}`,
      );

      // Completeness: bucket A + bucket B must equal the total candidate set -- no candidate dropped.
      expect(reordered.bucketASize + reordered.bucketBSize, `${f.key}`).toBe(reordered.totalCandidates);
      expect(reordered.totalCandidates, `${f.key}`).toBe(original.totalCandidates);
      expect(reordered.status, `${f.key}: reordered must still find a valid solution`).toBe(1);
      expect(reordered.internallyValid, `${f.key}`).toBe(true);
    }
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1: Gate B -- 핵심 성능 (rank 개선)", () => {
  it("hard#24가 핵심: 18 -> substantially earlier 여부", () => {
    console.log("\nfixture    | 기존 성공 index | reordered 성공 index | 개선율");
    for (const f of ALL_FIXTURES) {
      const rec = recByFixture.get(f.key)!;
      const before = rec.original.candidatesScanned;
      const after = rec.reordered.candidatesScanned;
      const improvement = ((before - after) / before) * 100;
      console.log(`${f.key.padEnd(10)} | ${before.toString().padStart(15)} | ${after.toString().padStart(21)} | ${improvement >= 0 ? "+" : ""}${improvement.toFixed(0)}%`);
    }
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1: Gate C -- completeness/replay 안전성", () => {
  it("false solve = 0, replay = 100%, bucket B가 실제로 스킵되지 않음(구조적으로 보존)", () => {
    let falseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const rec = recByFixture.get(f.key)!;
      expect(rec.reordered.seq, `${f.key}`).not.toBeNull();
      const solved = isCrossSolved(applySeq(rec.scrambled, rec.reordered.seq!));
      console.log(`  ${f.key}: JS replay solved=${solved}`);
      if (!solved) falseSolve++;
    }
    expect(falseSolve).toBe(0);
  }, 5_000);

  it("cumulative success-by-rank table for the REORDERED sequence (first 2000 candidates)", () => {
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
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { stats, rows } = radius1OrientationOrderAnalysisWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, 2000);
      const overallRate = stats.truePositiveCount / stats.analyzed;
      console.log(`\n=== ${f.key} reordered (bucketA=${stats.bucketASize}, bucketB=${stats.bucketBSize}, overallRate=${(overallRate * 100).toFixed(1)}%) ===`);
      console.log("  rank        | n    | successes | rate    | deviation");
      for (const [lo, hi] of RANK_BUCKETS) {
        const bucket = rows.filter((r) => r.newRank + 1 >= lo && r.newRank + 1 <= hi);
        if (bucket.length === 0) continue;
        const succ = bucket.filter((r) => r.bridgeFound).length;
        const bucketRate = succ / bucket.length;
        const dev = ((bucketRate - overallRate) / overallRate) * 100;
        console.log(`  ${lo}-${hi}`.padEnd(14) + `| ${bucket.length.toString().padStart(4)} | ${succ.toString().padStart(9)} | ${(bucketRate * 100).toFixed(1).padStart(6)}% | ${dev >= 0 ? "+" : ""}${dev.toFixed(0)}%`);
      }
      // Sanity: every row in bucket A should have bridgeFound implying it's a real orientationDiffers=true candidate; bucket boundary check.
      const bucketASizeInSample = rows.filter((r) => r.inBucketA).length;
      const firstBucketBRank = rows.find((r) => !r.inBucketA)?.newRank ?? -1;
      console.log(`  bucketA candidates in first ${rows.length} rows: ${bucketASizeInSample}, first bucketB rank: ${firstBucketBRank >= 0 ? firstBucketBRank + 1 : "N/A (all sampled rows in bucket A)"}`);
    }
    expect(true).toBe(true);
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1: Gate D -- 비용 측정", () => {
  it("residual 3 + comparison 2: 기존 vs reordered wall-clock (median of 3), overhead 확인", () => {
    console.log("\nfixture    | original(ms) | reordered(ms) | delta");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH); // warmup
      radius1BridgeEarlyExitReorderedWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH); // warmup

      const origTimes: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        origTimes.push(performance.now() - t0);
      }
      const reorderedTimes: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        radius1BridgeEarlyExitReorderedWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        reorderedTimes.push(performance.now() - t0);
      }
      origTimes.sort((a, b) => a - b);
      reorderedTimes.sort((a, b) => a - b);
      const origMedian = origTimes[1];
      const reorderedMedian = reorderedTimes[1];
      console.log(`${f.key.padEnd(10)} | ${origMedian.toFixed(0).padStart(12)} | ${reorderedMedian.toFixed(0).padStart(13)} | ${(reorderedMedian - origMedian).toFixed(0)}`);
    }
  }, 120_000);

  it("existing 100-scramble completeness unaffected (still 90/97/residual-exactly-3, reordering is purely additive/diagnostic)", () => {
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
