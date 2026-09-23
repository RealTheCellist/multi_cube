/**
 * MEGAMINX_3SEC_FAILED_CANDIDATE_REASON_ANALYSIS_V1 -- pure measurement Sprint.
 *
 * try_candidate has exactly two rejection points in the current code (no
 * new categories invented for this Sprint):
 *   1. fixed_ok fails -- the candidate's full setup+commutator+inverse-
 *      setup sequence touched a position that must stay fixed.
 *   2. blocked -- fixed_ok passed, but wrong_after didn't improve (or
 *      maintain, depending on requireImprovement) relative to wrong_before.
 * This Sprint tallies which of these two actually fires, for the 919
 * full-scan failures in phase2bc x edge x pair-anchor identified by
 * PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1, and compares against the 445
 * successful calls in the same group.
 *
 * Absolute constraints honored: try_candidate's own logic and return
 * values are unchanged -- only two counters were added, incremented at
 * the exact two `return None` sites that already existed. Confirmed
 * identical solve behavior (same cross solution depths as every prior
 * run this session) by rerunning the full 23-test suite.
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
  const origFindSafe = searchWasm.findSafeApplicationWasm;
  const spy = vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof origFindSafe>) => origFindSafe(...args));
  return () => spy.mockRestore();
}

interface Rec extends ReachLogEntry {
  tier: "easy" | "normal" | "hard";
  phase: string;
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
    for (const e of log) if (e.callerTag === 0 || e.callerTag === 1) out.push({ ...e, tier, phase: name });
  }
  return { solved: isMegaminxFullySolved(current) };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}
function summarize(label: string, values: number[]): string {
  if (values.length === 0) return `${label}: n=0`;
  const s = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(1)} P50=${percentile(s, 50).toFixed(1)} P90=${percentile(s, 90).toFixed(1)} MAX=${s[s.length - 1].toFixed(1)} n=${values.length}`;
}

function analyzeRejectionFunnel(label: string, recs: Rec[]): void {
  console.log(`\n=== ${label} (n=${recs.length}) ===`);
  if (recs.length === 0) return;

  const totalHit = recs.reduce((a, r) => a + r.candidatesHit, 0);
  const totalFixedOkFail = recs.reduce((a, r) => a + r.rejectFixedOkFail, 0);
  const totalBlocked = recs.reduce((a, r) => a + r.rejectBlocked, 0);
  const totalSuccess = recs.filter((r) => r.successVisitIndex !== null).length;
  const accountedFor = totalFixedOkFail + totalBlocked + totalSuccess;

  console.log(`  A. Rejection funnel (candidates_hit -> reject reasons -> success):`);
  console.log(`     candidates_hit total       = ${totalHit}`);
  console.log(`     reject: fixed_ok_fail       = ${totalFixedOkFail} (${((totalFixedOkFail / totalHit) * 100).toFixed(1)}%, cum ${((totalFixedOkFail / totalHit) * 100).toFixed(1)}%)`);
  console.log(`     reject: blocked             = ${totalBlocked} (${((totalBlocked / totalHit) * 100).toFixed(1)}%, cum ${(((totalFixedOkFail + totalBlocked) / totalHit) * 100).toFixed(1)}%)`);
  console.log(`     success                     = ${totalSuccess} (${((totalSuccess / totalHit) * 100).toFixed(2)}%, cum ${((accountedFor / totalHit) * 100).toFixed(2)}%)`);
  console.log(`     [sanity: accounted_for(${accountedFor}) should equal candidates_hit(${totalHit})]`);

  // B. Per-call consistency: for each call, what fraction of its own rejections were fixed_ok_fail (vs blocked)?
  const perCallShare = recs.filter((r) => r.rejectFixedOkFail + r.rejectBlocked > 0).map((r) => (r.rejectFixedOkFail / (r.rejectFixedOkFail + r.rejectBlocked)) * 100);
  console.log("  B. " + summarize("per-call fixed_ok_fail share of that call's own rejections (%)", perCallShare));
  const dominatedByFixedOkFail = perCallShare.filter((s) => s >= 90).length;
  const dominatedByBlocked = perCallShare.filter((s) => s <= 10).length;
  const mixed = perCallShare.length - dominatedByFixedOkFail - dominatedByBlocked;
  console.log(`     calls dominated (>=90%) by fixed_ok_fail: ${dominatedByFixedOkFail}/${perCallShare.length}, dominated by blocked: ${dominatedByBlocked}/${perCallShare.length}, mixed: ${mixed}/${perCallShare.length}`);
}

describe("MEGAMINX_3SEC_FAILED_CANDIDATE_REASON_ANALYSIS_V1", () => {
  it("decomposes try_candidate's own two rejection reasons across 50 scrambles (10 easy / 20 normal / 20 hard)", () => {
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      for (const { fn } of PHASES) s = applySeq(s, fn(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    const plan: { tier: Rec["tier"]; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 10 },
      { tier: "normal", length: 40, count: 20 },
      { tier: "hard", length: 70, count: 20 },
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
    console.log(`REASON_ANALYSIS: solved ${solvedCount}/${solvedCount + failedCount} (solveCross-style failures, tracked not fixed: ${failedCount})`);

    const primary = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const primaryFailed = primary.filter((r) => r.successVisitIndex === null);
    const primarySucceeded = primary.filter((r) => r.successVisitIndex !== null);

    console.log(`\nPRIMARY (phase2bc x edge x pair-anchor): n=${primary.length}, failed=${primaryFailed.length}, succeeded=${primarySucceeded.length}`);

    analyzeRejectionFunnel("PRIMARY -- FAILED calls only (the 98.7%-of-cost group)", primaryFailed);
    analyzeRejectionFunnel("PRIMARY -- SUCCEEDED calls (rejections before the eventual hit)", primarySucceeded);
    analyzeRejectionFunnel("PRIMARY -- all calls combined", primary);

    // D. Comparison groups for context.
    analyzeRejectionFunnel("COMPARE: phase2bc x corner x pair-anchor (100% success group)", all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 0 && r.callerTag === 1));
    analyzeRejectionFunnel("COMPARE: all OTHER phases x edge x pair-anchor", all.filter((r) => r.phase !== "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1));

    expect(primary.length).toBeGreaterThan(0);
  }, 600_000);
});
