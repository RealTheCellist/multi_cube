/**
 * MEGAMINX_3SEC_SETUP_PATH_FIXED_FILTER_VALIDATION_V1 -- pure measurement Sprint.
 *
 * Hypothesis under test: since commutators are already filtered at
 * library-build time to never touch a fixed position on their own
 * (buildCommutatorLibrary checks c.cornerSupport/c.edgeSupport against
 * fixedCorners/fixedEdges), the near-universal fixed_ok failure found by
 * FAILED_CANDIDATE_REASON_ANALYSIS_V1 is likely caused by the SETUP PATH
 * itself touching a fixed position -- checkable ONCE per setup path
 * instead of once per (setup path, commutator) candidate.
 *
 * Two independent definitions of "touches a fixed position" are measured
 * (not assumed equal): "support" (composed from the identity state) and
 * "actual" (applied to the real current state). See wasm-search/src/lib.rs's
 * own dev notes for why they should be mathematically identical, and why
 * that's verified here rather than assumed.
 *
 * Absolute constraints honored: no early-exit, no filter, no behavior
 * change -- the cross-tab counters are purely observational, computed
 * alongside the existing (unchanged) matching-loop logic. Confirmed
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
  const orig = searchWasm.findSafeApplicationWasm;
  const spy = vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof orig>) => orig(...args));
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

function analyzeCrossTab(label: string, recs: Rec[]): void {
  console.log(`\n=== ${label} (n=${recs.length} calls) ===`);
  if (recs.length === 0) return;

  const touchesReject = recs.reduce((a, r) => a + r.crossTouchesReject, 0);
  const touchesPass = recs.reduce((a, r) => a + r.crossTouchesPass, 0);
  const notTouchesReject = recs.reduce((a, r) => a + r.crossNotTouchesReject, 0);
  const notTouchesPass = recs.reduce((a, r) => a + r.crossNotTouchesPass, 0);
  const mismatch = recs.reduce((a, r) => a + r.definitionMismatch, 0);
  const uniquePaths = recs.reduce((a, r) => a + r.uniqueSetupPaths, 0);
  const totalCandidates = recs.reduce((a, r) => a + r.candidatesHit, 0);

  console.log("  2x2 cross-tab: setup touches fixed (actual-state definition) x fixed_ok result");
  console.log(`    touches=YES, fixed_ok=FAIL   : ${touchesReject}`);
  console.log(`    touches=YES, fixed_ok=PASS   : ${touchesPass}  <-- safety-critical: should be 0`);
  console.log(`    touches=NO,  fixed_ok=FAIL   : ${notTouchesReject}`);
  console.log(`    touches=NO,  fixed_ok=PASS   : ${notTouchesPass}`);
  const touchesTotal = touchesReject + touchesPass;
  const notTouchesTotal = notTouchesReject + notTouchesPass;
  if (touchesTotal > 0) console.log(`    P(fixed_ok FAIL | touches=YES) = ${((touchesReject / touchesTotal) * 100).toFixed(3)}%`);
  if (notTouchesTotal > 0) console.log(`    P(fixed_ok FAIL | touches=NO)  = ${((notTouchesReject / notTouchesTotal) * 100).toFixed(3)}%`);

  console.log(`  definition mismatch (support-based vs actual-based disagree): ${mismatch} / ${uniquePaths} unique setup paths (${uniquePaths > 0 ? ((mismatch / uniquePaths) * 100).toFixed(3) : "n/a"}%)`);

  console.log(`  setup-path-level: unique_setup_paths=${uniquePaths}, total_candidate_lookups=${totalCandidates}, avg_candidates_per_path=${uniquePaths > 0 ? (totalCandidates / uniquePaths).toFixed(2) : "n/a"}`);

  // Theoretical scan reduction: if every call whose ENTIRE set of unique setup paths touches a fixed position
  // could skip its whole matching-loop scan, how many candidate-scans would that avoid? (Upper bound, not implemented.)
  const callsWhereAllTouchesReject = recs.filter((r) => r.crossNotTouchesReject === 0 && r.crossNotTouchesPass === 0 && r.crossTouchesPass === 0 && r.crossTouchesReject > 0);
  const savedScans = callsWhereAllTouchesReject.reduce((a, r) => a + r.pairsVisited, 0);
  console.log(`  theoretical: calls where EVERY candidate touched fixed AND rejected (0 pass, 0 not-touches) = ${callsWhereAllTouchesReject.length}/${recs.length}, would-be-saved pairsVisited = ${savedScans}`);
}

describe("MEGAMINX_3SEC_SETUP_PATH_FIXED_FILTER_VALIDATION_V1", () => {
  it("validates whether setup-path-level fixed-touch is a safe necessary condition for fixed_ok failure, across 50 scrambles (10 easy / 20 normal / 20 hard)", () => {
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
    console.log(`SETUP_FILTER: solved ${solvedCount}/${solvedCount + failedCount} (solveCross-style failures, tracked not fixed: ${failedCount})`);

    const primary = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const primaryFailed = primary.filter((r) => r.successVisitIndex === null);
    const primarySucceeded = primary.filter((r) => r.successVisitIndex !== null);

    analyzeCrossTab("PRIMARY -- FAILED calls (phase2bc x edge x pair-anchor)", primaryFailed);
    analyzeCrossTab("PRIMARY -- SUCCEEDED calls (phase2bc x edge x pair-anchor)", primarySucceeded);
    analyzeCrossTab("PRIMARY -- all calls combined", primary);

    analyzeCrossTab("COMPARE: phase2bc x corner x pair-anchor (100% success group)", all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 0 && r.callerTag === 1));
    analyzeCrossTab("COMPARE: all OTHER phases x edge x pair-anchor", all.filter((r) => r.phase !== "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1));
    analyzeCrossTab("ALL findSafeApplication calls (any phase/kind/anchor)", all);

    expect(primary.length).toBeGreaterThan(0);
  }, 600_000);
});
