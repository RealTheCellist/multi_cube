/**
 * MEGAMINX_3SEC_BOTTLENECK_DECOMPOSITION_V1 -- pure measurement Sprint.
 *
 * Absolute principle: zero production/algorithm/library/Wasm-algorithm
 * changes. All instrumentation is done from OUTSIDE, via vi.spyOn on the
 * already-exported Wasm binding functions (megaminxSearchWasm.ts) --
 * confirmed by a standalone spike that this correctly intercepts calls
 * made internally by megaminxSolver.ts while still calling straight
 * through to the real implementation (identical results, identical code
 * path, only a timer/counter wrapped around it). Phase-level timing calls
 * the same 5 already-exported phase functions solveMegaminx() itself
 * calls, in the same order -- not a reimplementation of solve logic.
 */
import { describe, it, expect, vi } from "vitest";
import * as searchWasm from "./megaminxSearchWasm";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved } from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

interface FnStats {
  calls: number;
  totalMs: number;
}

function freshFnStats(): Record<"findSafe" | "findFinishing" | "solveCross" | "uploadLibrary", FnStats> {
  return {
    findSafe: { calls: 0, totalMs: 0 },
    findFinishing: { calls: 0, totalMs: 0 },
    solveCross: { calls: 0, totalMs: 0 },
    uploadLibrary: { calls: 0, totalMs: 0 },
  };
}

/** Wraps the real exported Wasm-binding functions with timing, calling straight through -- see this file's own top comment. */
function installSpies(stats: ReturnType<typeof freshFnStats>) {
  const origFindSafe = searchWasm.findSafeApplicationWasm;
  const origFindFinishing = searchWasm.findFinishingApplicationWasm;
  const origSolveCross = searchWasm.solveCrossWasm;
  const origUpload = searchWasm.uploadLibraryWasm;

  const spies = [
    vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof origFindSafe>) => {
      const t0 = performance.now();
      const r = origFindSafe(...args);
      stats.findSafe.calls++;
      stats.findSafe.totalMs += performance.now() - t0;
      return r;
    }),
    vi.spyOn(searchWasm, "findFinishingApplicationWasm").mockImplementation((...args: Parameters<typeof origFindFinishing>) => {
      const t0 = performance.now();
      const r = origFindFinishing(...args);
      stats.findFinishing.calls++;
      stats.findFinishing.totalMs += performance.now() - t0;
      return r;
    }),
    vi.spyOn(searchWasm, "solveCrossWasm").mockImplementation((...args: Parameters<typeof origSolveCross>) => {
      const t0 = performance.now();
      const r = origSolveCross(...args);
      stats.solveCross.calls++;
      stats.solveCross.totalMs += performance.now() - t0;
      return r;
    }),
    vi.spyOn(searchWasm, "uploadLibraryWasm").mockImplementation((...args: Parameters<typeof origUpload>) => {
      const t0 = performance.now();
      const r = origUpload(...args);
      stats.uploadLibrary.calls++;
      stats.uploadLibrary.totalMs += performance.now() - t0;
      return r;
    }),
  ];
  return () => spies.forEach((s) => s.mockRestore());
}

interface PhaseRecord {
  name: string;
  ms: number;
  fn: ReturnType<typeof freshFnStats>;
}

interface SolveRecord {
  tier: "easy" | "normal" | "hard";
  seed: number;
  totalMs: number;
  phases: PhaseRecord[];
  solved: boolean;
  error?: string;
}

function runInstrumentedSolve(tier: SolveRecord["tier"], seed: number, scrambleLength: number): SolveRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);

  const phases: PhaseRecord[] = [];
  let current: MegaminxState = scrambled;
  const totalStart = performance.now();

  const runPhase = (name: string, fn: (s: MegaminxState) => MegaminxTurn[]) => {
    const stats = freshFnStats();
    const uninstall = installSpies(stats);
    let seq: MegaminxTurn[];
    let ms: number;
    try {
      const t0 = performance.now();
      seq = fn(current);
      ms = performance.now() - t0;
    } finally {
      // MUST run even when fn() throws -- otherwise this spy is never
      // restored, and the NEXT solve's installSpies() wraps an already-
      // mocked function instead of the true original, compounding one
      // extra recursion layer per leaked failure until the stack blows.
      uninstall();
    }
    current = applySeq(current, seq);
    phases.push({ name, ms, fn: stats });
  };

  try {
    runPhase("phase1_firstLayer", solveFirstLayer);
    runPhase("phase2a_upperEdges", solveUpperEdges);
    runPhase("phase2bc_middleLayer", solveMiddleLayer);
    runPhase("phase3a_lowerLowerEdges", solveLowerLowerEdges);
    runPhase("phase3bc_lastLayer", solveLastLayer);
  } catch (e) {
    const totalMs = performance.now() - totalStart;
    return { tier, seed, totalMs, phases, solved: false, error: e instanceof Error ? e.message : String(e) };
  }

  const totalMs = performance.now() - totalStart;
  return { tier, seed, totalMs, phases, solved: isMegaminxFullySolved(current) };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label: string, values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const max = sorted[sorted.length - 1] ?? 0;
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P90=${percentile(sorted, 90).toFixed(1)} P95=${percentile(sorted, 95).toFixed(1)} MAX=${max.toFixed(1)} n=${values.length}`;
}

describe("MEGAMINX_3SEC_BOTTLENECK_DECOMPOSITION_V1", () => {
  it("decomposes real solve() wall time by phase and by Wasm-boundary function across 50 scrambles (10 easy / 20 normal / 20 hard)", () => {
    // Warmup: force every phase's lazy commutator library to build/cache
    // BEFORE any timed measurement, so one-time library-build cost never
    // contaminates a scramble's own numbers.
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      s = applySeq(s, solveFirstLayer(s));
      s = applySeq(s, solveUpperEdges(s));
      s = applySeq(s, solveMiddleLayer(s));
      s = applySeq(s, solveLowerLowerEdges(s));
      s = applySeq(s, solveLastLayer(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    const plan: { tier: SolveRecord["tier"]; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 10 },
      { tier: "normal", length: 40, count: 20 },
      { tier: "hard", length: 70, count: 20 },
    ];

    const records: SolveRecord[] = [];
    for (const { tier, length, count } of plan) {
      for (let seed = 1; seed <= count; seed++) {
        records.push(runInstrumentedSolve(tier, seed, length));
      }
    }

    const failed = records.filter((r) => !r.solved);
    console.log("BOTTLENECK: solved", records.length - failed.length, "/", records.length);
    if (failed.length > 0) console.log("BOTTLENECK: failures:", failed.map((r) => `${r.tier}#${r.seed}${r.error ? ` (${r.error})` : ""}`).join("; "));

    // Only fully-completed (all 5 phases ran) records feed the phase/function breakdown below.
    const complete = records.filter((r) => r.phases.length === 5);

    // Aggregate: total solve time, per tier (completed solves only).
    for (const tier of ["easy", "normal", "hard"] as const) {
      const totals = complete.filter((r) => r.tier === tier).map((r) => r.totalMs);
      console.log("BOTTLENECK:", summarize(`total (${tier})`, totals));
    }
    console.log("BOTTLENECK:", summarize("total (all)", complete.map((r) => r.totalMs)));

    // Aggregate: per-phase wall time, across all completed records.
    const phaseNames = complete[0].phases.map((p) => p.name);
    for (const name of phaseNames) {
      const values = complete.map((r) => r.phases.find((p) => p.name === name)!.ms);
      console.log("BOTTLENECK:", summarize(`phase ${name}`, values));
    }

    // Aggregate: per Wasm-function totals, summed across ALL phases of ALL completed records (global share of total runtime).
    const grandTotalMs = complete.reduce((a, r) => a + r.totalMs, 0);
    const fnKeys = ["findSafe", "findFinishing", "solveCross", "uploadLibrary"] as const;
    for (const key of fnKeys) {
      let sumMs = 0;
      let sumCalls = 0;
      for (const r of complete) for (const p of r.phases) { sumMs += p.fn[key].totalMs; sumCalls += p.fn[key].calls; }
      console.log(`BOTTLENECK: fn ${key} totalMs=${sumMs.toFixed(1)} (${((sumMs / grandTotalMs) * 100).toFixed(1)}% of grand total) calls=${sumCalls} avgMsPerCall=${(sumMs / Math.max(1, sumCalls)).toFixed(3)}`);
    }
    const knownMs = fnKeys.reduce((a, key) => a + complete.reduce((b, r) => b + r.phases.reduce((c, p) => c + p.fn[key].totalMs, 0), 0), 0);
    console.log(`BOTTLENECK: residual (state construction / replay / JS glue, NOT inside any Wasm-boundary call) = ${(grandTotalMs - knownMs).toFixed(1)}ms (${(((grandTotalMs - knownMs) / grandTotalMs) * 100).toFixed(1)}% of grand total)`);

    // Per-phase x per-function breakdown (the full cross table).
    console.log("BOTTLENECK: phase x function breakdown (ms, share of that phase's own time)");
    for (const name of phaseNames) {
      const phaseRecords = complete.map((r) => r.phases.find((p) => p.name === name)!);
      const phaseTotalMs = phaseRecords.reduce((a, p) => a + p.ms, 0);
      const parts = fnKeys.map((key) => {
        const ms = phaseRecords.reduce((a, p) => a + p.fn[key].totalMs, 0);
        return `${key}=${ms.toFixed(1)}ms(${((ms / phaseTotalMs) * 100).toFixed(0)}%)`;
      });
      console.log(`  ${name}: total=${phaseTotalMs.toFixed(1)}ms -- ${parts.join(" ")}`);
    }

    // This Sprint is pure measurement, not a correctness gate -- a
    // solveCross maxHalfDepth=11 non-convergence turned out to be a real,
    // reproducible, non-rare finding (see report), not a harness bug, so
    // this is a soft sanity check (catches an actual regression like the
    // earlier leaked-spy stack overflow), not a strict correctness gate.
    expect(complete.length).toBeGreaterThan(0);
  }, 600_000);
});
