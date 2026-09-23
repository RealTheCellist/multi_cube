/**
 * MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1 -- pure measurement Sprint.
 *
 * The prior Sprint (CALL_LEVEL_FIXED_FILTER_VALIDATION_V2) closed the
 * pre-scan filter avenue and reconfirmed that phase2bc x edge x pair-anchor
 * dominates cost, with `fixed_ok` rejection as the near-universal failure
 * mode. That Sprint's own "next steps" flagged a different axis worth
 * dissecting: phase2bc's edge library is built with `maxSupport=10,
 * perSizeCap=80` (other phases use maxSupport=6), directly explaining why
 * this library has ~4,160 (commutator,anchor) pairs vs ~845 elsewhere. This
 * Sprint asks: how much of that maxSupport=10 breadth is actually load-bearing?
 *
 * Key insight this Sprint's instrumentation exploits: `library` is built by
 * buildCommutatorLibrary as buckets 1..maxSupport concatenated in ascending
 * order, and the matching loop scans it start-to-finish, breaking on the
 * FIRST hit. So the winning commutator's own `support.len()` on a successful
 * call ("winningSupportSize") is exactly "the smallest support size that had
 * a working candidate for this call" -- and because the scan breaks on first
 * success, removing all support>N library entries can ONLY affect a call
 * whose winningSupportSize>N (turning it into a failure); it can never
 * change the outcome of a call whose winningSupportSize<=N, since the scan
 * would already have broken before ever reaching the removed entries.
 *
 * This Sprint does NOT change maxSupport anywhere -- it only measures the
 * winningSupportSize distribution (and, for context, a support<=6/>6 cost
 * split of the existing attempted/fixed_ok_fail/blocked tallies) to find out
 * whether a future reduction is even worth considering, per the work order's
 * own explicit instruction: "이 Sprint의 목적은 필요한 최대 support를
 * 발견하는 것이지, 그 support까지만 library를 생성하도록 Production을
 * 변경하는 것이 아닙니다."
 *
 * Absolute constraints honored: no early-exit, no filter, no behavior
 * change. Confirmed identical solve behavior (same cross solution depths as
 * every prior run this session) by rerunning the full 23-test suite before
 * this harness was written.
 */
import { describe, it, expect, vi } from "vitest";
import * as searchWasm from "./megaminxSearchWasm";
import { readReachLog, resetReachLog, type ReachLogEntry } from "./megaminxSearchWasm";
import { solveFirstLayer, solveUpperEdges, solveMiddleLayer, solveLowerLowerEdges, solveLastLayer, isMegaminxFullySolved } from "./megaminxSolver";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

function installTimedSpies() {
  const orig = searchWasm.findSafeApplicationWasm;
  const spy = vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof orig>) => orig(...args));
  return () => spy.mockRestore();
}

interface Rec extends ReachLogEntry {
  tier: "easy" | "normal" | "hard";
  phase: string;
  seed: number;
}

const PHASES: { name: string; fn: (s: MegaminxState) => MegaminxTurn[] }[] = [
  { name: "phase1_firstLayer", fn: solveFirstLayer },
  { name: "phase2a_upperEdges", fn: solveUpperEdges },
  { name: "phase2bc_middleLayer", fn: solveMiddleLayer },
  { name: "phase3a_lowerLowerEdges", fn: solveLowerLowerEdges },
  { name: "phase3bc_lastLayer", fn: solveLastLayer },
];

function runOne(tier: Rec["tier"], seed: number, scrambleLength: number, out: Rec[]): { solved: boolean } {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  let current: MegaminxState = applyMegaminxScramble(solvedMegaminxState(), turns);

  for (const { name, fn } of PHASES) {
    resetReachLog();
    const uninstall = installTimedSpies();
    let seq: MegaminxTurn[];
    try {
      seq = fn(current);
    } catch {
      uninstall();
      return { solved: false };
    }
    uninstall();
    current = applySeq(current, seq);

    const log = readReachLog();
    for (const e of log) if (e.callerTag === 0 || e.callerTag === 1) out.push({ ...e, tier, phase: name, seed });
  }
  return { solved: isMegaminxFullySolved(current) };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Section 2-3 of the work order: per-exact-support-size (6/7/8/9/10) success distribution. */
function analyzeSuccessBySupport(label: string, recs: Rec[]): void {
  const successes = recs.filter((r) => r.winningSupportSize !== null);
  console.log(`\n=== ${label}: SUCCESS candidates by winningSupportSize (n=${successes.length} successful calls) ===`);
  if (successes.length === 0) return;

  const bySupport = new Map<number, Rec[]>();
  for (const r of successes) {
    const s = r.winningSupportSize as number;
    if (!bySupport.has(s)) bySupport.set(s, []);
    bySupport.get(s)!.push(r);
  }
  const sizes = [...bySupport.keys()].sort((a, b) => a - b);
  console.log("  support | count | % of successes | avg successVisitIndex | P50 | P90 | P99");
  for (const s of sizes) {
    const group = bySupport.get(s)!;
    const svi = group.map((r) => r.successVisitIndex as number).sort((a, b) => a - b);
    console.log(
      `  ${s.toString().padStart(7)} | ${group.length.toString().padStart(5)} | ${((group.length / successes.length) * 100).toFixed(1).padStart(6)}% | ${mean(svi).toFixed(1).padStart(6)} | ${percentile(svi, 50).toFixed(0).padStart(4)} | ${percentile(svi, 90).toFixed(0).padStart(4)} | ${percentile(svi, 99).toFixed(0)}`,
    );
  }

  const le6 = successes.filter((r) => (r.winningSupportSize as number) <= 6).length;
  const gt6 = successes.length - le6;
  console.log(`  ROLLUP: winningSupportSize<=6: ${le6} (${((le6 / successes.length) * 100).toFixed(1)}%), >6: ${gt6} (${((gt6 / successes.length) * 100).toFixed(1)}%)`);
  console.log(`  -> if maxSupport were reduced to 6, these ${gt6} successful calls would become FAILURES (their winning candidate would no longer exist, and per this Sprint's scan-order argument, no earlier-order support<=6 candidate could have succeeded instead -- it would already have been tried and rejected before the scan ever reached the actual winner).`);
}

/** Section 4-5 of the work order: failure-call cost/attempt breakdown at the support<=6 / >6 boundary. */
function analyzeFailureCost(label: string, recs: Rec[]): void {
  const failures = recs.filter((r) => r.winningSupportSize === null);
  console.log(`\n=== ${label}: FAILURE calls, support<=6 vs >6 breakdown (n=${failures.length} failed calls) ===`);
  if (failures.length === 0) return;

  const sum = (f: (r: Rec) => number) => failures.reduce((a, r) => a + f(r), 0);
  const attemptedLe6 = sum((r) => r.attemptedLe6);
  const attemptedGt6 = sum((r) => r.attemptedGt6);
  const fixedFailLe6 = sum((r) => r.fixedFailLe6);
  const fixedFailGt6 = sum((r) => r.fixedFailGt6);
  const blockedLe6 = sum((r) => r.blockedLe6);
  const blockedGt6 = sum((r) => r.blockedGt6);
  console.log("  bucket   | attempted | fixed_ok_fail | blocked | (all failure calls scan to completion -- no break -- so attempted == full library's own pair count in that bucket)");
  console.log(`  <=6      | ${attemptedLe6.toString().padStart(9)} | ${fixedFailLe6.toString().padStart(13)} | ${blockedLe6.toString().padStart(7)}`);
  console.log(`  >6       | ${attemptedGt6.toString().padStart(9)} | ${fixedFailGt6.toString().padStart(13)} | ${blockedGt6.toString().padStart(7)}`);
  const totalAttempted = attemptedLe6 + attemptedGt6;
  console.log(`  -> support>6 candidates are ${((attemptedGt6 / totalAttempted) * 100).toFixed(1)}% of the scan's own per-call attempt volume on failure calls (these calls fail either way -- this only quantifies the SCAN COST a maxSupport=6 restriction would avoid on calls that were never going to succeed regardless).`);
}

describe("MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1", () => {
  it("measures the winning/attempted support-size distribution for phase2bc x edge x pair-anchor to evaluate maxSupport=10 necessity", () => {
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      for (const { fn } of PHASES) s = applySeq(s, fn(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    // Same 2x-scale fixture as the prior (V2) Sprint, for direct comparability.
    const plan: { tier: Rec["tier"]; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 20 },
      { tier: "normal", length: 40, count: 40 },
      { tier: "hard", length: 70, count: 40 },
    ];

    const all: Rec[] = [];
    let solvedCount = 0;
    let failedCount = 0;
    for (const { tier, length, count } of plan) {
      for (let seed = 1; seed <= count; seed++) {
        const r = runOne(tier, seed, length, all);
        if (r.solved) solvedCount++;
        else failedCount++;
      }
    }
    console.log(`SUPPORT_NECESSITY_V1: solved ${solvedCount}/${solvedCount + failedCount} (solveCross-style failures, tracked not fixed: ${failedCount})`);
    console.log(`SUPPORT_NECESSITY_V1: total findSafeApplication calls collected = ${all.length}`);

    const primary = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const otherPhaseEdgePair = all.filter((r) => r.phase !== "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const phase2bcCornerPair = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 0 && r.callerTag === 1);

    console.log(`SUPPORT_NECESSITY_V1: group sizes -- primary(phase2bc x edge x pair)=${primary.length}, other-phase edge-pair=${otherPhaseEdgePair.length}, phase2bc corner-pair=${phase2bcCornerPair.length}`);

    analyzeSuccessBySupport("PRIMARY: phase2bc x edge x pair-anchor", primary);
    analyzeFailureCost("PRIMARY: phase2bc x edge x pair-anchor", primary);

    analyzeSuccessBySupport("GENERALIZATION: other phases x edge x pair-anchor", otherPhaseEdgePair);
    analyzeSuccessBySupport("BOUNDARY: phase2bc x corner x pair-anchor", phase2bcCornerPair);

    // Whole-dataset rollup, for the report's headline numbers.
    analyzeSuccessBySupport("ALL findSafeApplication calls", all);

    expect(primary.length).toBeGreaterThan(0);
  }, 900_000);
});
