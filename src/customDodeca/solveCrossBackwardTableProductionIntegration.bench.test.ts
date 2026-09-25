/**
 * MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1 -- verifies
 * the actual PRODUCTION solveCross()/solveFirstLayer() entry points
 * (megaminxSolver.ts, just wired in this Sprint to call
 * solve_cross_cached_backward_v1 instead of the dynamic
 * solve_cross_shared_forward_fallback_v2 -- see megaminxSolver.ts's own
 * dev notes above solveCross). solve_cross_shared_forward_fallback_v2
 * itself is left completely UNCHANGED in wasm-search/src/lib.rs and is
 * used here, via its own TS binding, ONLY as this test suite's oracle --
 * production code no longer calls it. No commit/push.
 */
import { describe, it, expect } from "vitest";
import { solveCross, solveFirstLayer, isCrossSolved, isFirstLayerSolved } from "./megaminxSolver";
import { solveCrossSharedForwardFallbackV2Wasm, solveCrossWasm, wasmMemoryBytesWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
function isCrossSolvedByPieces(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];
function scrambledFor(tier: string, length: number, seed: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

const fallbackFixtures: { key: string; scrambled: MegaminxState }[] = [];

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: item 1+2 -- depth12 path preserved, cached fallback triggers via production solveCross()", () => {
  it("identify fallback-triggering scrambles (depth12-only fails) via the actual production solveCross(state) [no fallback]", () => {
    const memBefore = wasmMemoryBytesWasm();
    let depth12Solved = 0;
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(tier, length, seed);
        try {
          const sol = solveCross(scrambled, 12, PRODUCTION_CAP, false);
          const solved = isCrossSolved(applySeq(scrambled, sol));
          if (solved) {
            depth12Solved++;
            continue;
          }
        } catch {
          // falls through to fallback bucket below
        }
        fallbackFixtures.push({ key, scrambled });
      }
    }
    console.log(`\ndepth12Solved(production, no fallback)=${depth12Solved}/100, fallback-triggering=${fallbackFixtures.length}`);
    expect(depth12Solved).toBe(90);
    expect(fallbackFixtures.length).toBe(10);

    console.log("\nproduction solveCross(state, 12, cap, true) [cached backward] on each fallback fixture:");
    for (const f of fallbackFixtures) {
      let solved = false;
      let len = -1;
      try {
        const sol = solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
        len = sol.length;
        solved = isCrossSolved(applySeq(f.scrambled, sol));
      } catch {
        solved = false;
      }
      console.log(`  ${f.key.padEnd(10)} solved=${solved} len=${len}`);
      // normal#28/hard#6/hard#24 are the known, still-unsolved residual 3
      if (!["normal#28", "hard#6", "hard#24"].includes(f.key)) {
        expect(solved).toBe(true);
      } else {
        expect(solved).toBe(false);
      }
    }

    const memAfter = wasmMemoryBytesWasm();
    console.log(`\nwasm memory (production path): before=${(memBefore / 1024 / 1024).toFixed(2)}MB after=${(memAfter / 1024 / 1024).toFixed(2)}MB delta=${((memAfter - memBefore) / 1024 / 1024).toFixed(2)}MB`);
  }, 180_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: item 3+5 -- dynamic oracle re-verification through the production entry point", () => {
  it("production solveCross(..., true) output byte-identical to the dynamic oracle (solveCrossSharedForwardFallbackV2Wasm) for all 10 fallback fixtures", () => {
    console.log("\nfixture    | oracle(found/len) | production(found/len) | seq identical");
    for (const f of fallbackFixtures) {
      const oracle = solveCrossSharedForwardFallbackV2Wasm(f.scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);

      let prodSeq: MegaminxTurn[] | null = null;
      try {
        prodSeq = solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
      } catch {
        prodSeq = null;
      }

      const oracleFound = oracle.seq !== null;
      const prodFound = prodSeq !== null;
      const seqIdentical = JSON.stringify(oracle.seq) === JSON.stringify(prodSeq);

      console.log(`${f.key.padEnd(10)} | ${String(oracleFound).padEnd(6)}/${String(oracle.seq?.length ?? "-").padEnd(4)} | ${String(prodFound).padEnd(6)}/${String(prodSeq?.length ?? "-").padEnd(4)} | ${seqIdentical}`);

      expect(oracleFound).toBe(prodFound);
      expect(seqIdentical).toBe(true);
    }
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: item 6+7+8 -- full 100-scramble regression via production entry", () => {
  it("depth12=90/100, cached-fallback=97/100, residual={normal#28,hard#6,hard#24}, false solve=0, replay=100%", () => {
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];

    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(tier, length, seed);

        if (solveCrossWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP) !== null) depth12Solved++;

        try {
          const sol = solveCross(scrambled, 12, PRODUCTION_CAP, true);
          const after = applySeq(scrambled, sol);
          if (isCrossSolved(after) && isCrossSolvedByPieces(after)) {
            fallbackSolved++;
          } else {
            falseSolves++;
          }
        } catch {
          stillFailing.push(key);
        }
      }
    }

    console.log(`\nproduction regression: depth12=${depth12Solved}/100, fallback=${fallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(depth12Solved).toBe(90);
    expect(falseSolves).toBe(0);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 180_000);

  it("solveFirstLayer(state) end-to-end sanity check on 3 fallback-triggering fixtures (cross+corners)", () => {
    const sample = fallbackFixtures.filter((f) => !["normal#28", "hard#6", "hard#24"].includes(f.key)).slice(0, 3);
    expect(sample.length).toBe(3);
    for (const f of sample) {
      const sol = solveFirstLayer(f.scrambled);
      const after = applySeq(f.scrambled, sol);
      expect(isFirstLayerSolved(after), f.key).toBe(true);
    }
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: item 9 -- warm MAX < 3s through production entry", () => {
  it("production solveCross(..., true) warm mean/P90/P95/MAX across all 10 fallback fixtures x 3 reps", () => {
    // warmup
    for (const f of fallbackFixtures) {
      try {
        solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
      } catch {
        /* residual 3 throw by design */
      }
    }

    const times: number[] = [];
    for (let rep = 0; rep < 3; rep++) {
      for (const f of fallbackFixtures) {
        const t0 = performance.now();
        try {
          solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
        } catch {
          /* residual 3 throw by design -- still timed, still must be fast */
        }
        times.push(performance.now() - t0);
      }
    }

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    console.log(`\nproduction solveCross warm (n=${times.length}): mean=${mean.toFixed(1)}ms median=${median(times).toFixed(1)}ms P90=${percentile(times, 90).toFixed(1)}ms P95=${percentile(times, 95).toFixed(1)}ms MAX=${max.toFixed(1)}ms`);

    expect(max).toBeLessThan(3000);
  }, 60_000);
});
