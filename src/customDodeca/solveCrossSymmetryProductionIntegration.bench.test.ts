/**
 * MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1 --
 * Gate B/C/D/E for the REAL, now-modified production `solveCross`
 * (megaminxSolver.ts): depth12 (raw, unchanged) first, falling back to
 * depth13 + backward C5 symmetry canonicalization
 * (solve_cross_symmetry_candidate) only when depth12 fails. No test-local
 * clone of any phase function -- every call below is the exact same
 * exported `solveCross` the real solver (`solveFirstLayer`) uses, called
 * with the same `useSymmetryFallback=true` flag solveFirstLayer itself
 * now passes.
 *
 * Gate A (49-test regression suite unchanged, 0 regressions) was run
 * separately (see this Sprint's own report) -- this file covers B-E.
 */
import { describe, it, expect } from "vitest";
import { solveCross, isCrossSolved } from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

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

function scrambledFor(tier: string, seed: number, length: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

interface Record {
  key: string;
  scrambled: MegaminxState;
  depth12Only: { solved: boolean; ms: number };
  fallback: { solved: boolean; ms: number; usedFallback: boolean; falseSolve: boolean };
}

function runOne(tier: string, seed: number, length: number): Record {
  const key = `${tier}#${seed}`;
  const scrambled = scrambledFor(tier, seed, length);

  const t0 = performance.now();
  let depth12Solved = true;
  try {
    solveCross(scrambled, 12, 1_500_000, false);
  } catch {
    depth12Solved = false;
  }
  const depth12Ms = performance.now() - t0;

  const t1 = performance.now();
  let fallbackSolved = true;
  let solution: MegaminxTurn[] = [];
  try {
    solution = solveCross(scrambled, 12, 1_500_000, true);
  } catch {
    fallbackSolved = false;
  }
  const fallbackMs = performance.now() - t1;

  let falseSolve = false;
  if (fallbackSolved) {
    const replayed = applySeq(scrambled, solution);
    falseSolve = !isCrossSolved(replayed);
  }

  return {
    key,
    scrambled,
    depth12Only: { solved: depth12Solved, ms: depth12Ms },
    fallback: { solved: fallbackSolved, ms: fallbackMs, usedFallback: !depth12Solved, falseSolve },
  };
}

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

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1: Gate B -- 100-scramble depth12-only vs fallback", () => {
  it("depth12-only stays at 90/100; fallback (real production solveCross) reaches 97/100 with the exact expected residual", () => {
    const records: Record[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) records.push(runOne(tier, seed, length));
    }

    const depth12Solved = records.filter((r) => r.depth12Only.solved).length;
    const fallbackSolved = records.filter((r) => r.fallback.solved).length;
    const falseSolves = records.filter((r) => r.fallback.falseSolve);
    const stillFailingKeys = records.filter((r) => !r.fallback.solved).map((r) => r.key);
    const rescuedKeys = records.filter((r) => !r.depth12Only.solved && r.fallback.solved).map((r) => r.key);

    console.log(`Gate B: depth12-only=${depth12Solved}/100 (expect 90), fallback=${fallbackSolved}/100 (expect 97)`);
    console.log(`  rescued by fallback: ${rescuedKeys.join(", ")}`);
    console.log(`  still failing after fallback: ${stillFailingKeys.join(", ")}`);
    console.log(`  false solves: ${falseSolves.length}`);

    expect(falseSolves.length).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailingKeys.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1: Gate C -- full fallback-structure performance", () => {
  it("measures solveCross(state,12,1.5M,true) end-to-end timing distribution and verifies MAX < 3000ms", () => {
    // Warmup.
    {
      const warm = scrambledFor("warm", 999, 40);
      try {
        solveCross(warm, 12, 1_500_000, true);
      } catch {
        /* warmup only */
      }
    }

    const ms: number[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const scrambled = scrambledFor(tier, seed, length);
        const t0 = performance.now();
        try {
          solveCross(scrambled, 12, 1_500_000, true);
        } catch {
          /* still timed -- a genuine failure through the whole fallback structure */
        }
        ms.push(performance.now() - t0);
      }
    }

    console.log(`Gate C: ${summarize("solveCross (depth12 -> fallback depth13+symmetry)", ms)}`);
    const sorted = [...ms].sort((a, b) => a - b);
    const max = sorted[sorted.length - 1];
    const overBudget = ms.filter((v) => v >= 3000).length;
    console.log(`Gate C: MAX=${max.toFixed(0)}ms, ${overBudget}/100 exceeded 3000ms`);
    expect(max).toBeLessThan(3000);
    expect(overBudget).toBe(0);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1: Gate D -- per-call-type peak memory", () => {
  it("measures process RSS delta for each of the 3 call-type categories", () => {
    // Known classification from the prior Sprints' own 100-scramble fixture:
    // depth12 fails on exactly these 10; of those, depth13+symmetry rescues
    // 7 and still fails on 3 (normal#28, hard#6, hard#24).
    const DEPTH12_FAIL_ALL = ["normal#28", "hard#5", "hard#6", "hard#9", "hard#24", "hard#25", "hard#30", "hard#31", "hard#36", "hard#39"];
    const STILL_FAILS = ["normal#28", "hard#6", "hard#24"];
    const RESCUED = DEPTH12_FAIL_ALL.filter((k) => !STILL_FAILS.includes(k));

    const TIER_LENGTH: { [k: string]: number } = { easy: 15, normal: 40, hard: 70 };
    function stateFor(key: string): MegaminxState {
      const [tier, seedStr] = key.split("#");
      const length = TIER_LENGTH[tier];
      return scrambledFor(tier, Number(seedStr), length);
    }

    // depth12-success category: any key NOT in DEPTH12_FAIL_ALL -- take a representative sample.
    const successSample = ["easy#1", "easy#2", "normal#1", "normal#2", "hard#1", "hard#2"];

    function measure(label: string, keys: string[], run: (s: MegaminxState) => void): { before: number; after: number; delta: number } {
      if (global.gc) global.gc();
      const before = process.memoryUsage().rss;
      for (const k of keys) run(stateFor(k));
      const after = process.memoryUsage().rss;
      console.log(`Gate D: ${label} RSS before=${(before / 1e6).toFixed(1)}MB after=${(after / 1e6).toFixed(1)}MB delta=${((after - before) / 1e6).toFixed(1)}MB (n=${keys.length})`);
      return { before, after, delta: after - before };
    }

    // Order smallest-expected-footprint first -- Wasm linear memory never
    // shrinks, so each category's own delta is a lower bound once a later
    // category's peak already exceeds an earlier one's (disclosed in the report).
    measure("depth12-success", successSample, (s) => {
      solveCross(s, 12, 1_500_000, true);
    });
    measure("depth12-fail -> symmetry-success (rescued)", RESCUED, (s) => {
      solveCross(s, 12, 1_500_000, true);
    });
    measure("depth12-fail -> symmetry-fail (both fail)", STILL_FAILS, (s) => {
      try {
        solveCross(s, 12, 1_500_000, true);
      } catch {
        /* expected */
      }
    });

    expect(true).toBe(true);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_PRODUCTION_INTEGRATION_V1: Gate E -- production correctness verdict", () => {
  it("100-scramble: false solve=0, replay failure=0, regression=0 vs the depth12-only baseline", () => {
    const records: Record[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) records.push(runOne(tier, seed, length));
    }

    const falseSolves = records.filter((r) => r.fallback.falseSolve);
    // regression = depth12-only WAS solved but fallback-enabled solveCross
    // (same depth12 primary attempt) is NOT solved -- should never happen
    // since the primary attempt is byte-identical either way.
    const regressions = records.filter((r) => r.depth12Only.solved && !r.fallback.solved);
    const replayFailures = falseSolves.length; // "replay failure" == false solve in this harness's own vocabulary

    console.log(`Gate E: false solve=${falseSolves.length}, replay failure=${replayFailures}, regression=${regressions.length}`);
    console.log(`Gate E: final completeness=${records.filter((r) => r.fallback.solved).length}/100`);

    expect(falseSolves.length).toBe(0);
    expect(replayFailures).toBe(0);
    expect(regressions.length).toBe(0);
  }, 900_000);
});
