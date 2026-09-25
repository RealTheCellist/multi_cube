/**
 * MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1 -- canonical_key_v2
 * itself, try_bridge_canonical, extract_radius1_candidates, and solve_cross
 * are all reused completely UNCHANGED. V3 ("edges-only") and V4 ("direct",
 * no state materialization) are new, isolated candidate implementations,
 * verified bit-for-bit against the EXISTING, trusted canonical_key_v2
 * before any speed claim is trusted (Gate A gates everything else).
 */
import { describe, it, expect } from "vitest";
import {
  canonicalKeyV2TargetedOptVerifyWasm,
  benchCanonicalKeyV2TargetedWasm,
  benchConjugateStateTargetedWasm,
  radius1BridgeEarlyExitWasm,
  radius1BridgeEarlyExitDirectWasm,
  solveCrossWasm,
  solveCrossSharedForwardFallbackV2Wasm,
} from "./megaminxSearchWasm";
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

describe("MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1: Gate A -- canonical-key equivalence (STOP A gate)", () => {
  it("solved_state() + orbit invariance + 50,000 random states per root (9 roots): V3 and V4 must match canonical_key_v2 exactly, 0 mismatches", () => {
    let totalEdgesOnly = 0;
    let totalDirect = 0;
    let totalChecked = 0;

    {
      const scrambled = scrambledFor("hard", 999);
      const r = canonicalKeyV2TargetedOptVerifyWasm(scrambled, 12345, 50_000, true);
      console.log(`base (hard#999 root): edgesOnlyMismatches=${r.edgesOnlyMismatches} directMismatches=${r.directMismatches} checked=${r.statesChecked}`);
      totalEdgesOnly += r.edgesOnlyMismatches;
      totalDirect += r.directMismatches;
      totalChecked += r.statesChecked;
    }

    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const r = canonicalKeyV2TargetedOptVerifyWasm(scrambled, f.seed * 7919 + 1, 50_000, true);
      console.log(`${f.key}: edgesOnlyMismatches=${r.edgesOnlyMismatches} directMismatches=${r.directMismatches} checked=${r.statesChecked}`);
      totalEdgesOnly += r.edgesOnlyMismatches;
      totalDirect += r.directMismatches;
      totalChecked += r.statesChecked;
    }

    // A few extra light/easy roots for diversity.
    for (const seed of [1, 42, 777]) {
      const scrambled = scrambledFor("easy", seed);
      const r = canonicalKeyV2TargetedOptVerifyWasm(scrambled, seed * 31 + 5, 50_000, true);
      console.log(`easy#${seed}: edgesOnlyMismatches=${r.edgesOnlyMismatches} directMismatches=${r.directMismatches} checked=${r.statesChecked}`);
      totalEdgesOnly += r.edgesOnlyMismatches;
      totalDirect += r.directMismatches;
      totalChecked += r.statesChecked;
    }

    console.log(`TOTAL: checked=${totalChecked} edgesOnlyMismatches=${totalEdgesOnly} directMismatches=${totalDirect}`);
    expect(totalEdgesOnly, "V3 (edges-only) must be bit-for-bit identical to canonical_key_v2").toBe(0);
    expect(totalDirect, "V4 (direct, no materialization) must be bit-for-bit identical to canonical_key_v2").toBe(0);
  }, 180_000);
});

interface GateBRecord {
  scrambled: MegaminxState;
  v0: ReturnType<typeof radius1BridgeEarlyExitWasm>;
  v4: ReturnType<typeof radius1BridgeEarlyExitDirectWasm>;
}
const gateBByFixture = new Map<string, GateBRecord>();

describe("MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1: Gate B -- real candidate outcome identical (V0 vs V4)", () => {
  it("5개 fixture: found/notFound, bridgeDepth, winning candidate(scanned index), replay 전부 동일해야 함", () => {
    console.log("fixture    | V0 status/scanned/depth | V4 status/scanned/depth | seq 일치");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const v0 = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const v4 = radius1BridgeEarlyExitDirectWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      gateBByFixture.set(f.key, { scrambled, v0, v4 });

      const seqMatch = JSON.stringify(v0.seq) === JSON.stringify(v4.seq);
      console.log(`${f.key.padEnd(10)} | ${v0.status}/${v0.candidatesScanned}/${v0.bridgeDepth}                 | ${v4.status}/${v4.candidatesScanned}/${v4.bridgeDepth}                 | ${seqMatch}`);

      expect(v4.status, `${f.key}: V4 status must match V0`).toBe(v0.status);
      expect(v4.candidatesScanned, `${f.key}: winning candidate index must match`).toBe(v0.candidatesScanned);
      expect(v4.bridgeDepth, `${f.key}: bridgeDepth must match`).toBe(v0.bridgeDepth);
      expect(seqMatch, `${f.key}: solution sequence must be byte-identical`).toBe(true);
      expect(v4.internallyValid, `${f.key}`).toBe(true);

      const replayed = applySeq(scrambled, v4.seq!);
      expect(isCrossSolved(replayed), `${f.key}: V4 replay from original scrambled state`).toBe(true);
    }
  }, 60_000);
});

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

describe("MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1: Gate C -- micro-benchmark (1M+ calls)", () => {
  it("conjugate/state V0 vs V3, canonical key V0 vs V3 vs V4, 1,000,000-call scale", () => {
    const warm = scrambledFor("hard", 31);
    const REPEATS = 1_000_000;

    benchConjugateStateTargetedWasm(warm, 0, 1000);
    benchConjugateStateTargetedWasm(warm, 3, 1000);
    benchCanonicalKeyV2TargetedWasm(warm, 0, 1000);
    benchCanonicalKeyV2TargetedWasm(warm, 3, 1000);
    benchCanonicalKeyV2TargetedWasm(warm, 4, 1000);

    const t0 = performance.now();
    benchConjugateStateTargetedWasm(warm, 0, REPEATS);
    const conjV0Ms = performance.now() - t0;
    const t1 = performance.now();
    benchConjugateStateTargetedWasm(warm, 3, REPEATS);
    const conjV3Ms = performance.now() - t1;

    const t2 = performance.now();
    benchCanonicalKeyV2TargetedWasm(warm, 0, REPEATS);
    const canonV0Ms = performance.now() - t2;
    const t3 = performance.now();
    benchCanonicalKeyV2TargetedWasm(warm, 3, REPEATS);
    const canonV3Ms = performance.now() - t3;
    const t4 = performance.now();
    benchCanonicalKeyV2TargetedWasm(warm, 4, REPEATS);
    const canonV4Ms = performance.now() - t4;

    console.log("\nMetric              | V0            | V3(edges-only) | V4(direct)     | V3 변화 | V4 변화");
    console.log(
      `conjugate/state (${REPEATS.toLocaleString()} calls) | ${conjV0Ms.toFixed(1)}ms | ${conjV3Ms.toFixed(1)}ms | N/A (no materialization) | ${(((conjV0Ms - conjV3Ms) / conjV0Ms) * 100).toFixed(1)}% |`,
    );
    console.log(
      `canonical key (${REPEATS.toLocaleString()} calls)    | ${canonV0Ms.toFixed(1)}ms | ${canonV3Ms.toFixed(1)}ms | ${canonV4Ms.toFixed(1)}ms | ${(((canonV0Ms - canonV3Ms) / canonV0Ms) * 100).toFixed(1)}% | ${(((canonV0Ms - canonV4Ms) / canonV0Ms) * 100).toFixed(1)}%`,
    );
    console.log(`per-call: V0=${(canonV0Ms / REPEATS).toFixed(6)}ms V3=${(canonV3Ms / REPEATS).toFixed(6)}ms V4=${(canonV4Ms / REPEATS).toFixed(6)}ms`);

    expect(canonV0Ms).toBeGreaterThan(0);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1: Gate D -- 실제 3초 tail (residual 3 + comparison 2)", () => {
  it("V0 vs V4 early-exit end-to-end wall-clock (median of 5), residual 3개 핵심 비교", () => {
    console.log("\nfixture    | V0(ms, median5) | V4(ms, median5) | 개선율 | V0 all | V4 all");
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      radius1BridgeEarlyExitDirectWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);

      const v0Times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        v0Times.push(performance.now() - t0);
      }
      const v4Times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        radius1BridgeEarlyExitDirectWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        v4Times.push(performance.now() - t0);
      }
      const v0Median = median(v0Times);
      const v4Median = median(v4Times);
      const improvement = ((v0Median - v4Median) / v0Median) * 100;
      console.log(
        `${f.key.padEnd(10)} | ${v0Median.toFixed(0).padStart(15)} | ${v4Median.toFixed(0).padStart(15)} | ${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}% | ${v0Times.map((t) => t.toFixed(0)).join(",")} | ${v4Times.map((t) => t.toFixed(0)).join(",")}`,
      );
    }
  }, 180_000);

  it("false solve = 0, replay = 100% (V4 solutions, same data as Gate B), existing 97/100 regression unaffected", () => {
    let falseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const rec = gateBByFixture.get(f.key)!;
      const solved = rec.v4.seq !== null && isCrossSolved(applySeq(rec.scrambled, rec.v4.seq));
      if (!solved) falseSolve++;
    }
    expect(falseSolve).toBe(0);

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
