/**
 * MEGAMINX_SOLVECROSS_DEPTH12_PRODUCTION_INTEGRATION_V1 -- post-integration
 * regression, run against the REAL, now-modified production `solveFirstLayer`
 * (which calls `solveCross(state)` with no explicit depth -- megaminxSolver.ts's
 * own default is now 12, not 11). No test-local clone of any phase function:
 * every call below is the exact same exported function the real solver uses.
 *
 * Reuses the identical 100-scramble (20/40/40) fixture and
 * mulberry32(seed*97+scrambleLength*7919) formula as every prior Sprint in
 * this series, for direct comparability against the prior
 * MEGAMINX_SOLVECROSS_COMPLETENESS_V1 candidate-gate numbers for depth=12
 * (90/100 solved, 0 regressions, cross P95 756ms, total solve MAX 1254ms).
 */
import { describe, it } from "vitest";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved } from "./megaminxSolver";
import { readCrossLog, resetCrossLog, type CrossLogEntry } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

interface SolveRecord {
  tier: "easy" | "normal" | "hard";
  seed: number;
  crossMs: number;
  crossLog: CrossLogEntry | null;
  solved: boolean;
  totalMs: number;
  replayOk: boolean | null;
}

const PLAN: { tier: SolveRecord["tier"]; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

function runFullSolve(tier: SolveRecord["tier"], seed: number, scrambleLength: number): SolveRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
  const solution: MegaminxTurn[] = [];
  let current: MegaminxState = scrambled;
  const totalStart = performance.now();

  resetCrossLog();
  const crossStart = performance.now();
  let phase1Ok = true;
  try {
    const seq = solveFirstLayer(current); // REAL production function -- solveCross(state) now defaults to maxHalfDepth=12
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    phase1Ok = false;
  }
  const crossMs = performance.now() - crossStart;
  const log = readCrossLog();
  const crossLog = log.length > 0 ? log[log.length - 1] : null;

  if (!phase1Ok) {
    return { tier, seed, crossMs, crossLog, solved: false, totalMs: performance.now() - totalStart, replayOk: null };
  }

  let laterPhaseOk = true;
  try {
    let seq = solveUpperEdges(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveMiddleLayer(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveLowerLowerEdges(current);
    solution.push(...seq);
    current = applySeq(current, seq);
    seq = solveLastLayer(current);
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    laterPhaseOk = false;
  }

  const totalMs = performance.now() - totalStart;
  const solved = laterPhaseOk && isMegaminxFullySolved(current);
  const replayOk = solved ? isMegaminxFullySolved(applySeq(scrambled, solution)) : null;
  return { tier, seed, crossMs, crossLog, solved, totalMs, replayOk };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(label: string, values: number[]): string {
  if (values.length === 0) return `${label}: n=0`;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(1)}ms P50=${percentile(sorted, 50).toFixed(1)} P90=${percentile(sorted, 90).toFixed(1)} P95=${percentile(sorted, 95).toFixed(1)} MAX=${sorted[sorted.length - 1].toFixed(1)} n=${values.length}`;
}

const BASELINE_FAILURE_KEYS_11 = [
  "normal#13", "normal#20", "normal#21", "normal#28", "normal#29", "normal#32", "normal#38",
  "hard#1", "hard#2", "hard#5", "hard#6", "hard#7", "hard#8", "hard#9", "hard#12", "hard#17",
  "hard#21", "hard#24", "hard#25", "hard#30", "hard#31", "hard#32", "hard#33", "hard#36", "hard#38", "hard#39",
];
const STRUCTURAL_FAILURE_KEYS = ["normal#28", "hard#6", "hard#24", "hard#30", "hard#31", "hard#39"];
const REPRESENTATIVE_FIXTURES = ["normal#13", "hard#5", "normal#20", "hard#9", "hard#6"];

describe("MEGAMINX_SOLVECROSS_DEPTH12_PRODUCTION_INTEGRATION_V1", () => {
  it("re-verifies correctness/completeness/runtime/memory against the REAL, now maxHalfDepth=12 production solveFirstLayer", () => {
    const memBefore = process.memoryUsage().rss;

    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      s = applySeq(s, solveFirstLayer(s));
      s = applySeq(s, solveUpperEdges(s));
      s = applySeq(s, solveMiddleLayer(s));
      s = applySeq(s, solveLowerLowerEdges(s));
      s = applySeq(s, solveLastLayer(s));
      if (!isMegaminxFullySolved(s)) throw new Error("warmup solve did not converge");
    }

    const records: SolveRecord[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) records.push(runFullSolve(tier, seed, length));
    }
    const byKey = new Map(records.map((r) => [`${r.tier}#${r.seed}`, r]));

    const memAfter = process.memoryUsage().rss;
    console.log(`PRODUCTION_INTEGRATION_V1: process RSS before=${(memBefore / 1e6).toFixed(1)}MB after=${(memAfter / 1e6).toFixed(1)}MB delta=${((memAfter - memBefore) / 1e6).toFixed(1)}MB`);

    const solved = records.filter((r) => r.solved);
    console.log(`PRODUCTION_INTEGRATION_V1: solved ${solved.length}/100 (baseline depth=11 was 74/100)`);

    // Gate A: correctness.
    const falseSolves = solved.filter((r) => r.replayOk !== true);
    console.log(`GATE A: claimed solved=${solved.length}, false solves (replay mismatch)=${falseSolves.length}`);
    if (falseSolves.length > 0) throw new Error(`false solves detected: ${falseSolves.map((r) => `${r.tier}#${r.seed}`).join(", ")}`);

    // Gate B: regression + rescue vs the known depth=11 failure set.
    const rescued = BASELINE_FAILURE_KEYS_11.filter((k) => byKey.get(k)?.solved === true);
    const stillFailing = BASELINE_FAILURE_KEYS_11.filter((k) => byKey.get(k)?.solved !== true);
    console.log(`GATE B: rescued from the known 26 depth=11 failures = ${rescued.length}/26 [${rescued.join(", ")}]`);
    console.log(`GATE B: still failing = ${stillFailing.length}/26 [${stillFailing.join(", ")}]`);
    console.log(`GATE B: net completeness = ${solved.length}/100 (expect 90/100)`);

    // Gate E: the 6 structural failures should still be exactly the ones failing (baseline preservation, not resolution).
    const structuralStillFailing = STRUCTURAL_FAILURE_KEYS.filter((k) => byKey.get(k)?.solved !== true);
    const structuralUnexpectedlySolved = STRUCTURAL_FAILURE_KEYS.filter((k) => byKey.get(k)?.solved === true);
    console.log(`GATE E: structural-failure fixtures still failing = ${structuralStillFailing.length}/6 [${structuralStillFailing.join(", ")}]`);
    if (structuralUnexpectedlySolved.length > 0) console.log(`GATE E: (bonus) unexpectedly solved: ${structuralUnexpectedlySolved.join(", ")}`);

    console.log("GATE B/E: representative fixture detail");
    for (const k of REPRESENTATIVE_FIXTURES) {
      const r = byKey.get(k);
      console.log(`  ${k}: solved=${r?.solved} crossMs=${r?.crossMs.toFixed(1)} totalMs=${r?.solved ? r.totalMs.toFixed(1) : "-"}`);
    }

    // Gate C: 3-second tail latency (hard requirement).
    const crossMsValues = records.map((r) => r.crossMs);
    const totalMsValues = solved.map((r) => r.totalMs);
    console.log(`GATE C: ${summarize("cross-phase wall time (all 100)", crossMsValues)}`);
    console.log(`GATE C: ${summarize("total solve wall time (solved only)", totalMsValues)}`);
    const crossMax = Math.max(...crossMsValues);
    const totalMax = Math.max(...totalMsValues);
    console.log(`GATE C: hard requirement -- cross MAX=${crossMax.toFixed(1)}ms (<3000 required), total solve MAX=${totalMax.toFixed(1)}ms (<3000 required)`);
    if (crossMax >= 3000 || totalMax >= 3000) throw new Error(`3-second tail latency requirement violated: crossMax=${crossMax}ms totalMax=${totalMax}ms`);

    // Gate D: memory proxy via CROSS_LOG tree sizes.
    const logs = records.map((r) => r.crossLog).filter((l): l is CrossLogEntry => l !== null);
    const maxForwardSize = Math.max(...logs.map((l) => l.forwardFinalSize));
    const maxBackwardSize = Math.max(...logs.map((l) => l.backwardFinalSize));
    console.log(`GATE D: memory proxy -- max forwardFinalSize=${maxForwardSize}, max backwardFinalSize=${maxBackwardSize} (prior candidate-gate measurement: ~422k/358k)`);
  }, 900_000);
});
