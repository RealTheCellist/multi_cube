/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGE_PIPELINE_COST_PROFILE_V1 -- pure
 * measurement Sprint. No optimization performed, no production code
 * touched, V4 (canonical_key_direct) NOT wired into production,
 * orientationDiffers NOT revisited, canonical_key itself NOT touched
 * further. phase1_raw_capture_forward_v2_impl, phase2_diagnostic_v2_impl,
 * extract_radius1_candidates, apply_move, apply_seq, reconstruct_generic,
 * canonical_key_direct, and try_bridge_direct are all reused completely
 * UNCHANGED from prior Sprints; only new, isolated instrumentation/
 * benchmark exports are used here.
 */
import { describe, it, expect } from "vitest";
import {
  radius1BridgePipelineCostProfileWasm,
  radius1BridgeEarlyExitDirectWasm,
  benchApplyMoveTargetedWasm,
  benchCanonicalKeyV2TargetedWasm,
  benchReconstructGenericTargetedWasm,
  benchApplySeqTargetedWasm,
  noopFfiBenchWasm,
} from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;
const CANDIDATE_CAP = 1500;

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

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function timedMedian(fn: () => void, n: number): number {
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  return median(times);
}

// Populated by the first test, read by the second (both in the same
// describe run, vitest runs `it`s in this file sequentially).
let perCallApplyMoveMs = 0;
let perCallCanonicalKeyDirectMs = 0;
let perCallFfiMs = 0;

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGE_PIPELINE_COST_PROFILE_V1: isolated per-operation micro-benchmarks", () => {
  it("apply_move, canonical_key_direct, reconstruct_generic/apply_seq (representative path lengths), FFI boundary", () => {
    const warm = scrambledFor("hard", 31);
    const REPS = 1_000_000;

    benchApplyMoveTargetedWasm(warm, 1000);
    benchCanonicalKeyV2TargetedWasm(warm, 4, 1000);
    benchReconstructGenericTargetedWasm(12, 1000);
    benchApplySeqTargetedWasm(warm, 12, 1000);

    const t0 = performance.now();
    benchApplyMoveTargetedWasm(warm, REPS);
    const moveMs = performance.now() - t0;
    perCallApplyMoveMs = moveMs / REPS;

    const t1 = performance.now();
    benchCanonicalKeyV2TargetedWasm(warm, 4, REPS);
    const ckdMs = performance.now() - t1;
    perCallCanonicalKeyDirectMs = ckdMs / REPS;

    const t2 = performance.now();
    benchReconstructGenericTargetedWasm(12, REPS);
    const reconMs = performance.now() - t2;
    const perCallReconMs = reconMs / REPS;

    const t3 = performance.now();
    benchApplySeqTargetedWasm(warm, 12, REPS);
    const applySeqMs = performance.now() - t3;
    const perCallApplySeqMs = applySeqMs / REPS;

    const FFI_REPS = 1_000_000;
    const t4 = performance.now();
    for (let i = 0; i < FFI_REPS; i++) noopFfiBenchWasm();
    const ffiMs = performance.now() - t4;
    perCallFfiMs = ffiMs / FFI_REPS;

    console.log("\n== isolated per-operation costs (1,000,000-call scale, path_len=12 for reconstruct/apply_seq) ==");
    console.log(`apply_move:               ${moveMs.toFixed(1)}ms total, ${perCallApplyMoveMs.toFixed(6)}ms/call`);
    console.log(`canonical_key_direct(V4): ${ckdMs.toFixed(1)}ms total, ${perCallCanonicalKeyDirectMs.toFixed(6)}ms/call`);
    console.log(`reconstruct_generic:      ${reconMs.toFixed(1)}ms total, ${perCallReconMs.toFixed(6)}ms/call`);
    console.log(`apply_seq:                ${applySeqMs.toFixed(1)}ms total, ${perCallApplySeqMs.toFixed(6)}ms/call`);
    console.log(`FFI boundary (noop):      ${ffiMs.toFixed(1)}ms total, ${perCallFfiMs.toFixed(6)}ms/call`);

    expect(perCallApplyMoveMs).toBeGreaterThan(0);
    expect(perCallCanonicalKeyDirectMs).toBeGreaterThan(0);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGE_PIPELINE_COST_PROFILE_V1: pipeline stage decomposition + real candidate cost", () => {
  it("stage0/1/2 wall-clock, cat0-3 breakdown (first 1500 candidates), real candidatesScanned extrapolation -- 5 fixtures", () => {
    console.log("\n== per-fixture stage wall-clock (median of 5 for stage0/1, single run for stage2 @ candidateCap=1500) ==");

    type Row = { key: string; tSetup: number; tPhase12: number; tExtract: number; tLoop1500: number; analyzed: number; totalCkd: number; totalMv: number; avgFpathLen: number; realScanned: number; realBridgeDepth: number; tTotalReal: number; byCat: Record<number, { n: number; ckd: number; mv: number }> };
    const rows: Row[] = [];

    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);

      // warmup (lazy table init etc.)
      radius1BridgePipelineCostProfileWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, 0, 0);

      const tPhase12 = timedMedian(() => {
        radius1BridgePipelineCostProfileWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, 0, 0);
      }, 5);
      const tSetup = timedMedian(() => {
        radius1BridgePipelineCostProfileWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, 0, 1);
      }, 5);

      const t0 = performance.now();
      const stage2 = radius1BridgePipelineCostProfileWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH, CANDIDATE_CAP, 2);
      const tFull1500 = performance.now() - t0;
      const tLoop1500 = tFull1500 - tSetup;

      const byCat: Record<number, { n: number; ckd: number; mv: number }> = { 0: { n: 0, ckd: 0, mv: 0 }, 1: { n: 0, ckd: 0, mv: 0 }, 2: { n: 0, ckd: 0, mv: 0 }, 3: { n: 0, ckd: 0, mv: 0 } };
      for (const r of stage2.rows) {
        byCat[r.category].n++;
        byCat[r.category].ckd += r.ckdCalls;
        byCat[r.category].mv += r.moveCalls;
      }

      const real = radius1BridgeEarlyExitDirectWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const tTotalReal = timedMedian(() => {
        radius1BridgeEarlyExitDirectWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      }, 3);

      const row: Row = {
        key: f.key,
        tSetup,
        tPhase12,
        tExtract: tSetup - tPhase12,
        tLoop1500,
        analyzed: stage2.stats.analyzed,
        totalCkd: stage2.stats.totalCkdCalls,
        totalMv: stage2.stats.totalMoveCalls,
        avgFpathLen: stage2.stats.totalFpathLen / Math.max(1, stage2.stats.analyzed),
        realScanned: real.candidatesScanned,
        realBridgeDepth: real.bridgeDepth,
        tTotalReal,
        byCat,
      };
      rows.push(row);

      console.log(`\n-- ${f.key} --`);
      console.log(`stage0 (phase1+phase2 BFS construction):        ${tPhase12.toFixed(1)}ms (median5)`);
      console.log(`stage1 (+ extract_radius1_candidates/HashMap):  ${tSetup.toFixed(1)}ms (median5)  -> extract alone: ${row.tExtract.toFixed(1)}ms`);
      console.log(`stage2 (+ first ${CANDIDATE_CAP} candidates, single run): full=${tFull1500.toFixed(1)}ms -> loop alone: ${tLoop1500.toFixed(1)}ms`);
      console.log(`  analyzed=${row.analyzed} totalCkdCalls=${row.totalCkd} totalMoveCalls=${row.totalMv} avgFpathLen=${row.avgFpathLen.toFixed(2)}`);
      for (const cat of [0, 1, 2, 3] as const) {
        const c = byCat[cat];
        console.log(`  cat${cat}(${cat === 0 ? "notFound" : "bridgeDepth=" + cat}): n=${c.n} totalCkd=${c.ckd} totalMv=${c.mv}`);
      }
      console.log(`REAL solve: candidatesScanned=${row.realScanned} bridgeDepth=${row.realBridgeDepth} totalReal(median3)=${tTotalReal.toFixed(1)}ms`);
    }

    console.log("\n== assembled decomposition (per fixture) ==");
    console.log("fixture    | T_total(real) | T_setup(phase1+2+extract) | setup% | T_loop_est(canon+move+construct, extrapolated to real candidatesScanned) | loop_est% | residual%");
    for (const row of rows) {
      const avgCkdPerCand = row.totalCkd / Math.max(1, row.analyzed);
      const avgMvPerCand = row.totalMv / Math.max(1, row.analyzed);
      const estRealCkdCalls = avgCkdPerCand * row.realScanned;
      const estRealMvCalls = avgMvPerCand * row.realScanned;

      // reconstruct_generic + apply_seq at this fixture's own average fpath length
      const pathLen = Math.max(1, Math.round(row.avgFpathLen));
      const reconRepeats = 200_000;
      const t0 = performance.now();
      benchReconstructGenericTargetedWasm(pathLen, reconRepeats);
      const perCallReconMs = (performance.now() - t0) / reconRepeats;
      const t1 = performance.now();
      benchApplySeqTargetedWasm(scrambledFor("hard", 1), pathLen, reconRepeats);
      const perCallApplySeqMs = (performance.now() - t1) / reconRepeats;

      const estCanonicalKeyMs = estRealCkdCalls * perCallCanonicalKeyDirectMs;
      const estMoveApplyMs = estRealMvCalls * perCallApplyMoveMs;
      const estConstructionMs = row.realScanned * (perCallReconMs + perCallApplySeqMs);
      const estLoopMs = estCanonicalKeyMs + estMoveApplyMs + estConstructionMs;

      const setupPct = (row.tSetup / row.tTotalReal) * 100;
      const loopPct = (estLoopMs / row.tTotalReal) * 100;
      const residualPct = 100 - setupPct - loopPct;

      console.log(
        `${row.key.padEnd(10)} | ${row.tTotalReal.toFixed(0).padStart(13)} | ${row.tSetup.toFixed(0).padStart(25)} | ${setupPct.toFixed(1).padStart(5)}% | ${estLoopMs.toFixed(2).padStart(10)}ms (canon=${estCanonicalKeyMs.toFixed(2)} move=${estMoveApplyMs.toFixed(2)} constr=${estConstructionMs.toFixed(2)}) | ${loopPct.toFixed(2).padStart(6)}% | ${residualPct.toFixed(1)}%`,
      );
    }

    console.log(`\nFFI boundary: this Sprint's entire per-candidate loop runs inside ONE wasm call (not one call per candidate), so FFI overhead per solve = 1 x ${perCallFfiMs.toFixed(6)}ms, negligible relative to ~3000ms total.`);

    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(row.tSetup).toBeGreaterThan(0);
      expect(row.analyzed).toBeGreaterThan(0);
    }
  }, 300_000);
});
