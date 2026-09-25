/**
 * MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1 (rigor
 * follow-up) -- the actual production wiring (megaminxSolver.ts's
 * solveCross() calling solve_cross_cached_backward_v1) was already done
 * and validated in an earlier pass of this same Sprint name. This file
 * adds the specific Gate C (cold vs warm, split) and Gate D (memory RSS
 * at multiple checkpoints, growth-over-repeated-solves) rigor requested
 * afterward, plus a quick Gate A/B/E re-confirmation, all through the
 * actual production solveCross()/solveFirstLayer() entry points. No
 * further code change, no commit/push. Depth13/14 are NOT touched --
 * residual 3 stays fixed as-is per explicit instruction.
 */
import { describe, it, expect } from "vitest";
import { solveCross, isCrossSolved } from "./megaminxSolver";
import { solveCrossWasm, wasmMemoryBytesWasm, precomputedBackwardTableEnsureBuiltWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
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
function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + "MB";
}

const fallbackFixtures: { key: string; scrambled: MegaminxState }[] = [];

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: Gate A+B -- quick re-confirmation via production entry", () => {
  it("depth12=90/100, cached-fallback=97/100, false solve=0, replay=100%, residual identified", () => {
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];

    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(tier, length, seed);

        const isDepth12 = solveCrossWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP) !== null;
        if (isDepth12) depth12Solved++;
        else fallbackFixtures.push({ key, scrambled });

        try {
          const sol = solveCross(scrambled, 12, PRODUCTION_CAP, true);
          const after = applySeq(scrambled, sol);
          if (isCrossSolved(after)) fallbackSolved++;
          else falseSolves++;
        } catch {
          stillFailing.push(key);
        }
      }
    }

    console.log(`\nGate A+B: depth12=${depth12Solved}/100, fallback=${fallbackSolved}/100, false solves=${falseSolves}, residual=${stillFailing.join(", ")}`);
    expect(depth12Solved).toBe(90);
    expect(falseSolves).toBe(0);
    expect(fallbackSolved).toBe(97);
    expect(fallbackFixtures.length).toBe(10);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 180_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: Gate C -- cold vs warm, split, via production entry", () => {
  it("cold (table build + first fallback solve, bundled) vs warm (subsequent fallback solves), all via production solveCross()", () => {
    // At this point in the file, no cached-backward call has happened yet in
    // THIS wasm module instance (this describe block runs before any other
    // test file's fallback path touches the module) -- but Gate A+B above
    // ALREADY triggered the table build via production solveCross(...) on
    // the first fallback fixture it hit. So "cold" here is re-measured via
    // a fresh accounting: table build time alone (already-built -> instant)
    // vs the FIRST production solveCross call of THIS test's own run.
    // To get a true from-scratch cold number, we measure table-build alone
    // via precomputedBackwardTableEnsureBuiltWasm() (idempotent: returns
    // immediately if already built) and report both numbers with the
    // caveat made explicit.
    const memBeforeBuild = wasmMemoryBytesWasm();
    const t0 = performance.now();
    const totalNodes = precomputedBackwardTableEnsureBuiltWasm();
    const buildAloneMs = performance.now() - t0;
    const memAfterBuild = wasmMemoryBytesWasm();

    console.log(`\nGate C: table build (idempotent call, already-built from Gate A+B if this is the 2nd+ time in this process): ${buildAloneMs.toFixed(1)}ms, totalNodes=${totalNodes}`);
    console.log(`memory before/after this call: ${mb(memBeforeBuild)} / ${mb(memAfterBuild)}`);

    // Fixture #1 of fallbackFixtures, excluding the 3 residuals (which
    // throw by design and would muddy the "solve time" number) -- this is
    // effectively the second real fallback solve this process has ever
    // done (Gate A+B's own scan already did the true first one), so we
    // label it honestly as "first solve in THIS gate" rather than
    // re-claiming "cold" for a table that's already warm.
    const solvable = fallbackFixtures.filter((f) => !["normal#28", "hard#6", "hard#24"].includes(f.key));
    expect(solvable.length).toBe(7);

    const t1 = performance.now();
    const sol1 = solveCross(solvable[0].scrambled, 12, PRODUCTION_CAP, true);
    const firstSolveMs = performance.now() - t1;
    expect(isCrossSolved(applySeq(solvable[0].scrambled, sol1))).toBe(true);
    console.log(`first fallback solve in this gate (table already warm): ${firstSolveMs.toFixed(1)}ms (fixture=${solvable[0].key})`);

    // warm: remaining 6 fixtures x 5 reps each
    const warmTimes: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      for (const f of solvable.slice(1)) {
        const t = performance.now();
        const sol = solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
        warmTimes.push(performance.now() - t);
        expect(isCrossSolved(applySeq(f.scrambled, sol))).toBe(true);
      }
    }
    const mean = warmTimes.reduce((a, b) => a + b, 0) / warmTimes.length;
    console.log(`\nwarm (n=${warmTimes.length}, 6 fixtures x 5 reps): mean=${mean.toFixed(1)}ms median=${median(warmTimes).toFixed(1)}ms P90=${percentile(warmTimes, 90).toFixed(1)}ms P95=${percentile(warmTimes, 95).toFixed(1)}ms MAX=${Math.max(...warmTimes).toFixed(1)}ms`);

    expect(Math.max(...warmTimes)).toBeLessThan(3000);
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: Gate D -- memory RSS at checkpoints, growth over repeated solves", () => {
  it("memory checkpoints: after table build (already happened), after 10 solves once, after 100 more solves", () => {
    const memAfterTableBuild = wasmMemoryBytesWasm(); // table already built by Gate A+B/C above

    const solvable = fallbackFixtures.filter((f) => !["normal#28", "hard#6", "hard#24"].includes(f.key));
    for (const f of solvable) {
      const sol = solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
      expect(isCrossSolved(applySeq(f.scrambled, sol))).toBe(true);
    }
    const memAfter10 = wasmMemoryBytesWasm();

    for (let rep = 0; rep < 15; rep++) {
      for (const f of solvable) {
        solveCross(f.scrambled, 12, PRODUCTION_CAP, true);
      }
    }
    const memAfter100More = wasmMemoryBytesWasm();

    console.log("\nGate D: memory checkpoints");
    console.log(`after table build (already done earlier in this process): ${mb(memAfterTableBuild)}`);
    console.log(`after 7 solves (1 pass over solvable fixtures):            ${mb(memAfter10)}  (delta from prev: ${mb(memAfter10 - memAfterTableBuild)})`);
    console.log(`after 105 more solves (15 more passes):                    ${mb(memAfter100More)}  (delta from prev: ${mb(memAfter100More - memAfter10)})`);

    // The table build itself is a one-time cost; repeated solves should not
    // keep growing wasm memory materially (no per-solve leak).
    const growthPerHundredSolves = memAfter100More - memAfter10;
    console.log(`\ngrowth over 105 additional solves: ${mb(growthPerHundredSolves)} (expect small/near-zero -- no per-solve leak)`);
  }, 180_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRODUCTION_INTEGRATION_V1: Gate E -- residual stays fixed, no depth escalation", () => {
  it("residual is exactly {normal#28, hard#6, hard#24}, depth12MaxHalfDepth/totalMaxHalfDepth untouched", () => {
    const residualKeys = ["normal#28", "hard#6", "hard#24"];
    for (const key of residualKeys) {
      const f = fallbackFixtures.find((x) => x.key === key)!;
      expect(f).toBeDefined();
      expect(() => solveCross(f.scrambled, 12, PRODUCTION_CAP, true)).toThrow();
    }
    console.log(`\nGate E: residual confirmed fixed at {${residualKeys.join(", ")}}. No depth13/14/15 attempted (out of this Sprint's scope).`);
  });
});
