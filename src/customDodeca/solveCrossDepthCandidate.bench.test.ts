/**
 * MEGAMINX_SOLVECROSS_COMPLETENESS_V1 -- Candidate Gate (Sections 8, 10-12
 * of the work order).
 *
 * The failure census (solveCrossFailureCensus.bench.test.ts) found ALL 26
 * depth-11 failures classify as Type D (policy): bidirectional_search_impl's
 * `for _ in 0..max_half_depth` loop expands only ONE side per round (picking
 * whichever is smaller), for `max_half_depth` ROUNDS TOTAL -- not per side.
 * Diffing against the pre-Wasm-port JS (commit 38f49ed~1) confirms this is
 * the ORIGINAL design, not a porting regression: the JS `bidirectionalSearch`
 * has the exact same `for (let depth = 0; depth < maxHalfDepth; depth++)`
 * shared-round-budget structure. So "maxHalfDepth" is a misleading name --
 * combined reachable solution depth after 11 rounds is ~11 (5-6 each side,
 * confirmed empirically: every failure's own forwardRounds+backwardRounds
 * == 11), not 22.
 *
 * The diagnostic depth sweep (11->12->13->14, SAME unmodified algorithm,
 * just a bigger shared round budget) found: 16/26 rescued at 12, 20/26 at
 * 13, 20/26 at 14 (no further gain -- diminishing returns kick in exactly
 * at 13->14, satisfying the work order's own Stop Rule for going past 13).
 * Cost grows steeply though: depth-12 rescues run at roughly 2x depth-11's
 * own generated-state count; depth-13 rescues balloon to 5-9x (forward tree
 * up to 1.6M states, vs 60-80K at depth 11).
 *
 * This harness gates maxHalfDepth=12 and maxHalfDepth=13 as PRODUCTION
 * CANDIDATES (pure parameter change -- solveCross already exposes
 * maxHalfDepth as an argument, bidirectional_search_impl's own algorithm is
 * completely unchanged) against the full pipeline: solveCross -> ... ->
 * solveLastLayer -> replay -> solved, per the work order's explicit Gate A/
 * B/C requirements (not "solveCross succeeded" alone).
 */
import { describe, it } from "vitest";
import { solveCross, solveFirstLayerCorners, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved } from "./megaminxSolver";
import { readCrossLog, resetCrossLog, type CrossLogEntry } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

/** Line-for-line copy of megaminxSolver.ts's own solveFirstLayer, with the cross-solve's own maxHalfDepth parameterized instead of hardcoded to the default 11 -- see megaminxSolver.ts's own solveFirstLayer for what this mirrors. */
function solveFirstLayerWithCrossDepth(state: MegaminxState, crossMaxHalfDepth: number): MegaminxTurn[] {
  const crossSolution = solveCross(state, crossMaxHalfDepth);
  const afterCross = applySeq(state, crossSolution);
  const cornerSolution = solveFirstLayerCorners(afterCross);
  return [...crossSolution, ...cornerSolution];
}

interface SolveRecord {
  tier: "easy" | "normal" | "hard";
  seed: number;
  crossSolved: boolean;
  crossMs: number;
  crossLog: CrossLogEntry | null;
  solved: boolean;
  totalMs: number;
  replayOk: boolean | null;
  laterPhaseError?: string;
}

const PLAN: { tier: SolveRecord["tier"]; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

function runFullSolve(tier: SolveRecord["tier"], seed: number, scrambleLength: number, crossMaxHalfDepth: number): SolveRecord {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
  const solution: MegaminxTurn[] = [];
  let current: MegaminxState = scrambled;
  const totalStart = performance.now();

  resetCrossLog();
  const crossStart = performance.now();
  let crossSolved = true;
  try {
    const seq = solveFirstLayerWithCrossDepth(current, crossMaxHalfDepth);
    solution.push(...seq);
    current = applySeq(current, seq);
  } catch {
    crossSolved = false;
  }
  const crossMs = performance.now() - crossStart;
  const log = readCrossLog();
  const crossLog = log.length > 0 ? log[log.length - 1] : null;

  if (!crossSolved) {
    return { tier, seed, crossSolved: false, crossMs, crossLog, solved: false, totalMs: performance.now() - totalStart, replayOk: null };
  }

  let laterPhaseError: string | undefined;
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
  } catch (e) {
    laterPhaseError = e instanceof Error ? e.message : String(e);
  }

  const totalMs = performance.now() - totalStart;
  const solved = laterPhaseError === undefined && isMegaminxFullySolved(current);
  const replayOk = solved ? isMegaminxFullySolved(applySeq(scrambled, solution)) : null;
  return { tier, seed, crossSolved: true, crossMs, crossLog, solved, totalMs, replayOk, laterPhaseError };
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

function runPolicy(depth: number): SolveRecord[] {
  const records: SolveRecord[] = [];
  for (const { tier, length, count } of PLAN) {
    for (let seed = 1; seed <= count; seed++) records.push(runFullSolve(tier, seed, length, depth));
  }
  return records;
}

function key(r: { tier: string; seed: number }): string {
  return `${r.tier}#${r.seed}`;
}

describe("MEGAMINX_SOLVECROSS_COMPLETENESS_V1: candidate gate (maxHalfDepth 12/13)", () => {
  it("gates maxHalfDepth=12 and 13 candidates against the real full pipeline: correctness / completeness regression / runtime / memory proxy", () => {
    const memBefore = process.memoryUsage().rss;

    console.log("=== RUNNING baseline (maxHalfDepth=11) ===");
    const r11 = runPolicy(11);
    console.log("=== RUNNING candidate maxHalfDepth=12 ===");
    const r12 = runPolicy(12);
    console.log("=== RUNNING candidate maxHalfDepth=13 ===");
    const r13 = runPolicy(13);

    const memAfter = process.memoryUsage().rss;
    console.log(`\nProcess RSS before=${(memBefore / 1e6).toFixed(1)}MB after=${(memAfter / 1e6).toFixed(1)}MB delta=${((memAfter - memBefore) / 1e6).toFixed(1)}MB (rough proxy only -- includes GC noise across all 3 policies combined)`);

    const byKey11 = new Map(r11.map((r) => [key(r), r]));
    const byKey12 = new Map(r12.map((r) => [key(r), r]));
    const byKey13 = new Map(r13.map((r) => [key(r), r]));

    for (const [label, records] of [["11", r11], ["12", r12], ["13", r13]] as const) {
      const solved = records.filter((r) => r.solved);
      console.log(`\nmaxHalfDepth=${label}: solved ${solved.length}/100`);
    }

    // ---- Gate A: correctness ----
    for (const [label, records] of [["11", r11], ["12", r12], ["13", r13]] as const) {
      const claimed = records.filter((r) => r.solved);
      const falseSolves = claimed.filter((r) => r.replayOk !== true);
      console.log(`\n=== GATE A (correctness) maxHalfDepth=${label}: claimed solved=${claimed.length}, false solves (replay mismatch)=${falseSolves.length} ===`);
      if (falseSolves.length > 0) console.log(`  FALSE SOLVE DETAIL: ${falseSolves.map((r) => key(r)).join(", ")}`);
    }

    // ---- Gate B: regression + rescue ----
    const baselineSolvedKeys = new Set(r11.filter((r) => r.solved).map((r) => key(r)));
    const baselineFailedKeys = new Set(r11.filter((r) => !r.solved).map((r) => key(r)));
    console.log(`\n=== GATE B (completeness) baseline: solved=${baselineSolvedKeys.size}/100, failed=${baselineFailedKeys.size}/100 ===`);
    for (const [label, byKeyMap] of [["12", byKey12], ["13", byKey13]] as const) {
      let regressions = 0;
      const regressionKeys: string[] = [];
      for (const k of baselineSolvedKeys) {
        const c = byKeyMap.get(k)!;
        if (!c.solved) {
          regressions++;
          regressionKeys.push(k);
        }
      }
      let rescued = 0;
      const rescuedKeys: string[] = [];
      for (const k of baselineFailedKeys) {
        const c = byKeyMap.get(k)!;
        if (c.solved) {
          rescued++;
          rescuedKeys.push(k);
        }
      }
      console.log(`  maxHalfDepth=${label}: regressions vs baseline=${regressions}/${baselineSolvedKeys.size}${regressions > 0 ? ` [${regressionKeys.join(", ")}]` : ""}, rescued from baseline failures=${rescued}/${baselineFailedKeys.size} [${rescuedKeys.join(", ")}]`);
      console.log(`    net completeness: ${baselineSolvedKeys.size - regressions + rescued}/100 (baseline was ${baselineSolvedKeys.size}/100)`);
    }

    // ---- Gate C: runtime + memory proxy ----
    for (const [label, records] of [["11", r11], ["12", r12], ["13", r13]] as const) {
      const solvedRecords = records.filter((r) => r.solved);
      console.log(`\n=== GATE C (runtime) maxHalfDepth=${label} ===`);
      console.log(`  ${summarize("cross-phase wall time (all 100, incl. failures)", records.map((r) => r.crossMs))}`);
      console.log(`  ${summarize("total solve wall time (solved only)", solvedRecords.map((r) => r.totalMs))}`);
      const logs = records.map((r) => r.crossLog).filter((l): l is CrossLogEntry => l !== null);
      const maxForwardSize = Math.max(...logs.map((l) => l.forwardFinalSize));
      const maxBackwardSize = Math.max(...logs.map((l) => l.backwardFinalSize));
      const avgGenerated = logs.reduce((a, l) => a + l.totalGenerated, 0) / logs.length;
      console.log(`  memory proxy (CROSS_LOG tree sizes): max forwardFinalSize=${maxForwardSize}, max backwardFinalSize=${maxBackwardSize}, avg totalGenerated/call=${avgGenerated.toFixed(0)}`);
    }

    // Still-unsolved-at-13 detail, for the report's Decision D discussion.
    const stillFailingAt13 = [...baselineFailedKeys].filter((k) => !byKey13.get(k)!.solved);
    console.log(`\n=== Failures that remain unsolved even at maxHalfDepth=13: ${stillFailingAt13.length}/${baselineFailedKeys.size} -- ${stillFailingAt13.join(", ")} ===`);
  }, 900_000);
});
