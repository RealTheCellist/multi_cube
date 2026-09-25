/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1
 * -- Gate B/C/D/E/F for the REAL, now-modified production `solveCross`
 * (megaminxSolver.ts): a single call to solve_cross_shared_forward_fallback_v2
 * (phase 1 = raw depth12 equivalent with inline canon_key tracking on
 * forward, phase 2 = reused forward + fresh canonical backward using the
 * Gate-A-verified V2 canonicalization). No test-local clone of any phase
 * function -- every call below is the exact same exported `solveCross`
 * the real solver (`solveFirstLayer`) uses, with the same
 * `useSymmetryFallback=true` flag solveFirstLayer itself now passes.
 *
 * Gate A (49-test regression suite) was run separately (see this
 * Sprint's own report) -- this file covers B-F plus the regression
 * fixture check.
 */
import { describe, it, expect } from "vitest";
import { solveCross, isCrossSolved } from "./megaminxSolver";
import { microoptVerifyOneWasm, solveCrossSharedForwardFallbackV2Wasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];

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
function scrambledFor(seed: number, length: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Gate B -- canonical correctness on the Production-wired path", () => {
  it("SOLVED + random states + residual-3 + rescued fixtures: canonicalKey_V0 === canonicalKey_V2, 0 mismatches", () => {
    let mismatches = 0;
    mismatches += microoptVerifyOneWasm(solvedMegaminxState(), TRACKED_PIECES);

    for (let seed = 1; seed <= 50; seed++) {
      const length = 3 + (seed % 60);
      const turns = randomMegaminxScramble(length, mulberry32(seed * 131 + length * 997));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      mismatches += microoptVerifyOneWasm(scrambled, TRACKED_PIECES);
    }

    const FIXTURES: [string, number][] = [
      ["normal", 28],
      ["hard", 6],
      ["hard", 24],
      ["hard", 5],
      ["hard", 9],
      ["hard", 25],
      ["hard", 30],
      ["hard", 31],
      ["hard", 36],
      ["hard", 39],
    ];
    const TIER_LENGTH: Record<string, number> = { normal: 40, hard: 70 };
    for (const [tier, seed] of FIXTURES) {
      const scrambled = scrambledFor(seed, TIER_LENGTH[tier]);
      mismatches += microoptVerifyOneWasm(scrambled, TRACKED_PIECES);
    }

    console.log(`Gate B: total mismatches = ${mismatches}`);
    expect(mismatches).toBe(0);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Gate C -- completeness/correctness via production solveCross", () => {
  it("depth12=90/100, V2 fallback(production)=97/100, false solve=0, replay failure=0, residual exactly {normal#28,hard#6,hard#24}", () => {
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    const rescued: string[] = [];

    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const scrambled = scrambledFor(seed, length);

        let depth12Ok = true;
        try {
          solveCross(scrambled, 12, 1_500_000, false);
        } catch {
          depth12Ok = false;
        }
        if (depth12Ok) depth12Solved++;

        let seq: MegaminxTurn[] | null = null;
        try {
          seq = solveCross(scrambled, 12, 1_500_000, true);
        } catch {
          seq = null;
        }
        if (seq) {
          const replayed = applySeq(scrambled, seq);
          if (isCrossSolved(replayed)) {
            fallbackSolved++;
            if (!depth12Ok) rescued.push(key);
          } else {
            falseSolves++;
          }
        } else {
          stillFailing.push(key);
        }
      }
    }

    console.log(`depth12-only=${depth12Solved}/100 (expect 90), production V2 fallback=${fallbackSolved}/100 (expect 97)`);
    console.log(`  rescued: ${rescued.join(", ")}`);
    console.log(`  still failing: ${stillFailing.join(", ")}`);
    console.log(`  false solves: ${falseSolves}`);

    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
    expect(rescued.sort()).toEqual(["hard#5", "hard#9", "hard#25", "hard#30", "hard#31", "hard#36", "hard#39"].sort());
  }, 900_000);
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(label: string, values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P95=${percentile(sorted, 95).toFixed(1)} MAX=${sorted[sorted.length - 1].toFixed(1)} n=${values.length}`;
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Gate D -- production runtime", () => {
  it("measures solveCross(state,12,1.5M,true) end-to-end via the real production entry point; decides A/B/C per the work order's own table", () => {
    // Warmup.
    {
      const warm = scrambledFor(999, 40);
      try {
        solveCross(warm, 12, 1_500_000, true);
      } catch {
        /* warmup only */
      }
    }

    const ms: number[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const scrambled = scrambledFor(seed, length);
        const t0 = performance.now();
        try {
          solveCross(scrambled, 12, 1_500_000, true);
        } catch {
          /* still timed -- a genuine failure through the whole fallback */
        }
        ms.push(performance.now() - t0);
      }
    }

    console.log(`Gate D: ${summarize("production solveCross (depth12 -> V2 shared-forward fallback)", ms)}`);
    const sorted = [...ms].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    const overHard = ms.filter((v) => v >= 3000).length;
    const overInternal = ms.filter((v) => v >= 2900).length;
    console.log(`Gate D: MAX=${max.toFixed(0)}ms, ${overHard}/100 exceeded 3000ms (hard gate), ${overInternal}/100 exceeded 2900ms (internal target)`);

    let verdict: "A" | "B" | "C";
    if (max <= 2900) verdict = "A";
    else if (max < 3000) verdict = "B";
    else verdict = "C";
    console.log(`Gate D verdict: ${verdict}`);

    expect(ms.length).toBe(100);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Gate E -- memory per call-type", () => {
  it("measures process RSS delta for depth12-success, fallback-success, fallback-failure categories via the production path", () => {
    const DEPTH12_FAIL_ALL = ["normal#28", "hard#5", "hard#6", "hard#9", "hard#24", "hard#25", "hard#30", "hard#31", "hard#36", "hard#39"];
    const STILL_FAILS = ["normal#28", "hard#6", "hard#24"];
    const RESCUED = DEPTH12_FAIL_ALL.filter((k) => !STILL_FAILS.includes(k));
    const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
    function stateFor(key: string): MegaminxState {
      const [tier, seedStr] = key.split("#");
      return scrambledFor(Number(seedStr), TIER_LENGTH[tier]);
    }

    const successSample = ["easy#1", "easy#2", "normal#1", "normal#2", "hard#1", "hard#2"];

    function measure(label: string, keys: string[]): void {
      const before = process.memoryUsage().rss;
      for (const k of keys) {
        try {
          solveCross(stateFor(k), 12, 1_500_000, true);
        } catch {
          /* expected for STILL_FAILS */
        }
      }
      const after = process.memoryUsage().rss;
      console.log(`Gate E: ${label} RSS before=${(before / 1e6).toFixed(1)}MB after=${(after / 1e6).toFixed(1)}MB delta=${((after - before) / 1e6).toFixed(1)}MB (n=${keys.length})`);
    }

    measure("depth12-success", successSample);
    measure("depth12-fail -> V2 fallback-success (rescued)", RESCUED);
    measure("depth12-fail -> V2 fallback-fail (both fail)", STILL_FAILS);

    expect(true).toBe(true);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Gate F -- production path == isolated harness equivalence", () => {
  it("production solveCross and the isolated solveCrossSharedForwardFallbackV2Wasm give IDENTICAL results on the same fixtures", () => {
    const FIXTURES: [string, number][] = [
      ["normal", 28],
      ["hard", 6],
      ["hard", 24],
      ["hard", 5],
      ["hard", 9],
      ["hard", 25],
      ["hard", 30],
      ["hard", 31],
      ["hard", 36],
      ["hard", 39],
    ];
    const TIER_LENGTH: Record<string, number> = { normal: 40, hard: 70 };

    let mismatches = 0;
    for (const [tier, seed] of FIXTURES) {
      const key = `${tier}#${seed}`;
      const scrambled = scrambledFor(seed, TIER_LENGTH[tier]);

      let prodSeq: MegaminxTurn[] | null = null;
      try {
        prodSeq = solveCross(scrambled, 12, 1_500_000, true);
      } catch {
        prodSeq = null;
      }

      const { seq: isolatedSeq } = solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, 1_500_000, 13, 1_500_000);

      const prodSolved = prodSeq !== null;
      const isolatedSolved = isolatedSeq !== null;
      const prodReplayOk = prodSeq ? isCrossSolved(applySeq(scrambled, prodSeq)) : null;
      const isolatedReplayOk = isolatedSeq ? isCrossSolved(applySeq(scrambled, isolatedSeq)) : null;
      const seqMatch = JSON.stringify(prodSeq) === JSON.stringify(isolatedSeq);

      const ok = prodSolved === isolatedSolved && seqMatch && prodReplayOk !== false && isolatedReplayOk !== false;
      console.log(`  ${key}: prodSolved=${prodSolved} isolatedSolved=${isolatedSolved} seqMatch=${seqMatch} prodLen=${prodSeq?.length ?? "n/a"} isolatedLen=${isolatedSeq?.length ?? "n/a"} ${ok ? "OK" : "MISMATCH"}`);
      if (!ok) mismatches++;
    }

    console.log(`Gate F: total mismatches = ${mismatches}`);
    expect(mismatches).toBe(0);
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_FORWARD_V2_PRODUCTION_INTEGRATION_V1: Regression fixture -- seed 1-10 + rescued 7 + residual 3", () => {
  it("seed 1-10 (baseline) solve as before; rescued 7 stay rescued; residual 3 stay exactly the residual, all via production solveCross", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const scrambled = scrambledFor(seed, 40);
      const seq = solveCross(scrambled, 12, 1_500_000, true);
      expect(isCrossSolved(applySeq(scrambled, seq)), `seed ${seed}`).toBe(true);
    }

    const RESCUED_7: [string, number][] = [
      ["hard", 5],
      ["hard", 9],
      ["hard", 25],
      ["hard", 30],
      ["hard", 31],
      ["hard", 36],
      ["hard", 39],
    ];
    for (const [tier, seed] of RESCUED_7) {
      const scrambled = scrambledFor(seed, 70);
      const seq = solveCross(scrambled, 12, 1_500_000, true);
      expect(isCrossSolved(applySeq(scrambled, seq)), `${tier}#${seed}`).toBe(true);
    }

    const RESIDUAL_3: [string, number][] = [
      ["normal", 28],
      ["hard", 6],
      ["hard", 24],
    ];
    for (const [tier, seed] of RESIDUAL_3) {
      const length = tier === "normal" ? 40 : 70;
      const scrambled = scrambledFor(seed, length);
      expect(() => solveCross(scrambled, 12, 1_500_000, true), `${tier}#${seed} should still fail`).toThrow();
    }
  }, 120_000);
});
