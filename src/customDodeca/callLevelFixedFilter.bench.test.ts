/**
 * MEGAMINX_3SEC_CALL_LEVEL_FIXED_FILTER_VALIDATION_V2 -- pure measurement Sprint.
 *
 * V1 found candidate-level "setup touches fixed -> reject" is UNSAFE (real
 * counter-examples). This Sprint tests a narrower, call-level condition:
 *
 *   ALL_TOUCH_FULL = every entry in build_reachable_impl's ENTIRE
 *   reachable-map output (not just the subset the library happens to
 *   reference) touches a fixed position.
 *
 * This is the one signal genuinely computable BEFORE the library scan
 * starts (depends only on the BFS's own output). V1's 355/919 finding
 * used a library-SCANNED definition instead; this Sprint recomputes the
 * comparison against the FULL-reachable-map definition and actively
 * hunts for counter-examples (ALL_TOUCH_FULL=true but the call still
 * succeeded) across a larger, more varied sample.
 *
 * Absolute constraints honored: no early-exit, no filter, no behavior
 * change. Confirmed identical solve behavior (same cross solution depths
 * as every prior run this session) by rerunning the full 23-test suite.
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

/** V1's library-SCANNED definition of "every visited candidate touched fixed and was rejected", derived from existing fields (no new Rust needed). */
function allTouchScanned(r: Rec): boolean {
  return r.crossTouchesReject > 0 && r.crossTouchesPass === 0 && r.crossNotTouchesReject === 0 && r.crossNotTouchesPass === 0;
}

function analyzeCallLevel(label: string, recs: Rec[]): void {
  console.log(`\n=== ${label} (n=${recs.length} calls) ===`);
  if (recs.length === 0) return;

  const success = (r: Rec) => r.successVisitIndex !== null;

  // 2x2: ALL_TOUCH_FULL x actual outcome.
  let fullYesSuccess = 0, fullYesFail = 0, fullNoSuccess = 0, fullNoFail = 0;
  const counterExamples: Rec[] = [];
  for (const r of recs) {
    if (r.allTouchFull) {
      if (success(r)) { fullYesSuccess++; counterExamples.push(r); } else fullYesFail++;
    } else {
      if (success(r)) fullNoSuccess++; else fullNoFail++;
    }
  }
  console.log("  2x2: ALL_TOUCH_FULL (computable BEFORE library scan) x actual call outcome");
  console.log(`    ALL_TOUCH_FULL=YES, outcome=FAIL    : ${fullYesFail}`);
  console.log(`    ALL_TOUCH_FULL=YES, outcome=SUCCESS : ${fullYesSuccess}  <-- counter-examples, should be 0`);
  console.log(`    ALL_TOUCH_FULL=NO,  outcome=FAIL    : ${fullNoFail}`);
  console.log(`    ALL_TOUCH_FULL=NO,  outcome=SUCCESS : ${fullNoSuccess}`);
  if (fullYesSuccess + fullYesFail > 0) console.log(`    P(FAIL | ALL_TOUCH_FULL=YES) = ${((fullYesFail / (fullYesFail + fullYesSuccess)) * 100).toFixed(3)}%`);
  if (counterExamples.length > 0) {
    console.log(`    counter-example detail (up to 5): ${JSON.stringify(counterExamples.slice(0, 5).map((r) => ({ tier: r.tier, seed: r.seed, phase: r.phase, fullReachableSize: r.fullReachableSize, successVisitIndex: r.successVisitIndex })))}`);
  }

  // Compare against V1's scanned-only definition.
  const scannedYes = recs.filter(allTouchScanned).length;
  console.log(`  comparison: ALL_TOUCH_FULL=YES count=${fullYesFail + fullYesSuccess}, ALL_TOUCH_SCANNED(V1 def)=YES count=${scannedYes}`);

  // Cost: fullReachableSize (pre-check cost) vs pairsVisited (scan cost it could replace), for calls where ALL_TOUCH_FULL held and call failed (the safe-skip candidates).
  const safeSkippable = recs.filter((r) => r.allTouchFull && !success(r));
  const totalPreCheckCost = safeSkippable.reduce((a, r) => a + r.fullReachableSize, 0);
  const totalScanCostAvoided = safeSkippable.reduce((a, r) => a + r.pairsVisited, 0);
  console.log(`  cost: ${safeSkippable.length} calls where ALL_TOUCH_FULL held and call failed -- pre-check cost (sum fullReachableSize) = ${totalPreCheckCost}, scan cost avoided (sum pairsVisited) = ${totalScanCostAvoided}, net ratio = ${totalPreCheckCost > 0 ? (totalScanCostAvoided / totalPreCheckCost).toFixed(2) : "n/a"}x`);
}

describe("MEGAMINX_3SEC_CALL_LEVEL_FIXED_FILTER_VALIDATION_V2", () => {
  it("validates ALL_TOUCH_FULL as a call-level necessary condition across a larger, actively counter-example-hunting sample", () => {
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      for (const { fn } of PHASES) s = applySeq(s, fn(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    // 2x scale of prior sprints, per the work order's "충분히 큰 표본" request.
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
    console.log(`CALL_LEVEL_V2: solved ${solvedCount}/${solvedCount + failedCount} (solveCross-style failures, tracked not fixed: ${failedCount})`);
    console.log(`CALL_LEVEL_V2: total findSafeApplication calls collected = ${all.length}`);

    const primary = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const otherPhaseEdgePair = all.filter((r) => r.phase !== "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    const phase2bcCornerPair = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 0 && r.callerTag === 1);

    analyzeCallLevel("PRIMARY: phase2bc x edge x pair-anchor", primary);
    analyzeCallLevel("GENERALIZATION: other phases x edge x pair-anchor", otherPhaseEdgePair);
    analyzeCallLevel("BOUNDARY: phase2bc x corner x pair-anchor", phase2bcCornerPair);
    analyzeCallLevel("ALL findSafeApplication calls (any phase/kind/anchor)", all);

    // Explicit, isolated false-positive hunt: EVERY counter-example across the whole dataset.
    const allCounterExamples = all.filter((r) => r.allTouchFull && r.successVisitIndex !== null);
    console.log(`\nCALL_LEVEL_V2: TOTAL counter-examples (ALL_TOUCH_FULL=true AND call succeeded) across ALL ${all.length} calls = ${allCounterExamples.length}`);

    // Re-verify V1's own SCANNED-only definition at this larger scale (ALL_TOUCH_FULL never fired, so this is the only signal left worth re-checking).
    const scannedYes = all.filter(allTouchScanned);
    const scannedYesSuccess = scannedYes.filter((r) => r.successVisitIndex !== null);
    console.log(`CALL_LEVEL_V2: V1's own ALL_TOUCH_SCANNED definition at 2x scale: YES=${scannedYes.length}, of those SUCCEEDED=${scannedYesSuccess.length} (should be 0 for V1's finding to hold)`);
    for (const groupLabel of ["primary", "other", "corner"] as const) {
      const group = groupLabel === "primary" ? primary : groupLabel === "other" ? otherPhaseEdgePair : phase2bcCornerPair;
      const gYes = group.filter(allTouchScanned);
      const gYesSuccess = gYes.filter((r) => r.successVisitIndex !== null);
      console.log(`  ${groupLabel}: ALL_TOUCH_SCANNED YES=${gYes.length}, succeeded=${gYesSuccess.length}`);
    }

    expect(primary.length).toBeGreaterThan(0);
  }, 900_000);
});
