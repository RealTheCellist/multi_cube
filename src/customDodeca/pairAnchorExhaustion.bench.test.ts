/**
 * MEGAMINX_3SEC_PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1 -- pure measurement Sprint.
 *
 * Two distinct "exhaustion" concepts, kept separate throughout (see chat
 * for why conflating them would mislead):
 *  (1) BFS reachable-map size (build_reachable_impl's own key_to_id.len(),
 *      already measured in REACHABILITY_COST_PROFILE_V1: saturates at 870
 *      for edge pair-anchor). Whether exploring all of it was NECESSARY is
 *      answered here via successKeyDiscoveryId/resultSize -- how early in
 *      the BFS's OWN discovery order the eventually-winning key appeared.
 *  (2) find_safe_application's own matching-loop scan (for commutator in
 *      library: for anchor in movingSupport: ...) -- a DIFFERENT count,
 *      bounded by library size, not by 870. pairsVisited/successVisitIndex
 *      answer whether early-exit already keeps this cheap (ordering
 *      question) or whether most calls scan the whole library in vain.
 *
 * Absolute constraints honored: the matching loop's iteration order,
 * break conditions, and try_candidate logic are byte-for-byte unchanged --
 * only local counters were added and the existing log_reach_call moved
 * (not renamed/changed in meaning) to fire after the loop instead of
 * right after the BFS, so it can also report the loop's own tally.
 * Confirmed identical solve behavior by rerunning the full 23-test suite
 * (same cross solution depths as every prior run this session).
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
  return `${label}: mean=${mean.toFixed(1)} P50=${percentile(s, 50)} P90=${percentile(s, 90)} P95=${percentile(s, 95)} P99=${percentile(s, 99)} MAX=${s[s.length - 1]} n=${values.length}`;
}

function analyzeGroup(label: string, recs: Rec[]): void {
  console.log(`\n=== ${label} (n=${recs.length}) ===`);
  if (recs.length === 0) return;

  const succeeded = recs.filter((r) => r.successVisitIndex !== null);
  const failed = recs.filter((r) => r.successVisitIndex === null);
  console.log(`  success rate: ${succeeded.length}/${recs.length} (${((succeeded.length / recs.length) * 100).toFixed(1)}%)`);

  // A. pair (matching-loop) exhaustion.
  console.log("  A. " + summarize("pairsVisited (all calls)", recs.map((r) => r.pairsVisited)));
  console.log("     " + summarize("pairsVisited (failed calls -- full scan, no success)", failed.map((r) => r.pairsVisited)));

  // B. success position (matching-loop scan order).
  if (succeeded.length > 0) {
    console.log("  B. " + summarize("successVisitIndex (scan position of the winning candidate)", succeeded.map((r) => r.successVisitIndex!)));
    console.log("     " + summarize("successVisitIndex as % of that call's own pairsVisited", succeeded.map((r) => (r.successVisitIndex! / r.pairsVisited) * 100)));
  }

  // C. candidate funnel: all pairs -> reachable hit -> (of those, how many led to the eventual success, i.e. candidatesHit vs pairsVisited).
  const totalPairs = recs.reduce((a, r) => a + r.pairsVisited, 0);
  const totalHits = recs.reduce((a, r) => a + r.candidatesHit, 0);
  console.log(`  C. candidate funnel (summed): pairs_visited=${totalPairs} -> reachable_hit=${totalHits} (${((totalHits / totalPairs) * 100).toFixed(1)}%) -> safe_application=${succeeded.length} calls succeeded`);

  // D. exhaustion reason.
  console.log(`  D. success_before_exhaustion=${succeeded.length}, full_scan_no_success=${failed.length}`);

  // BFS-discovery-order necessity (separate axis -- concept (1) in this file's own header comment).
  if (succeeded.length > 0) {
    const ratios = succeeded.filter((r) => r.resultSize > 0).map((r) => (r.successKeyDiscoveryId! / r.resultSize) * 100);
    console.log("  BFS-discovery-order of the winning key, as % of that call's own final reachable-map size:");
    console.log("     " + summarize("successKeyDiscoveryId / resultSize * 100", ratios));
  }

  // Structural reuse probe: is successVisitIndex concentrated (few scan positions dominate), suggesting a small set of commonly-winning library entries?
  if (succeeded.length >= 5) {
    const counts = new Map<number, number>();
    for (const r of succeeded) counts.set(r.successVisitIndex!, (counts.get(r.successVisitIndex!) ?? 0) + 1);
    const top5 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const top5Share = top5.reduce((a, [, c]) => a + c, 0) / succeeded.length;
    console.log(`  structural reuse probe: top-5 most common successVisitIndex values cover ${(top5Share * 100).toFixed(1)}% of all successes -- [${top5.map(([idx, c]) => `pos${idx}:${c}`).join(", ")}]`);
  }
}

describe("MEGAMINX_3SEC_PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1", () => {
  it("quantifies whether the 870-edge-pair BFS exploration and its matching-loop scan are actually necessary", () => {
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
    console.log(`PAIR_EXHAUSTION: solved ${solvedCount}/${solvedCount + failedCount} (solveCross-style failures, tracked not fixed: ${failedCount})`);
    console.log(`PAIR_EXHAUSTION: total findSafeApplication matching-loop records = ${all.length}`);

    // Primary target: phase2bc / edge / pair-anchor.
    const primary = all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1);
    analyzeGroup("PRIMARY: phase2bc x edge x pair-anchor", primary);

    // Comparison groups.
    analyzeGroup("COMPARE: phase2bc x edge x single-anchor", all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 0));
    analyzeGroup("COMPARE: phase2bc x corner x pair-anchor", all.filter((r) => r.phase === "phase2bc_middleLayer" && r.kind === 0 && r.callerTag === 1));
    analyzeGroup("COMPARE: all OTHER phases x edge x pair-anchor", all.filter((r) => r.phase !== "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1));
    analyzeGroup("COMPARE: everything else combined", all.filter((r) => !(r.phase === "phase2bc_middleLayer" && r.kind === 1 && r.callerTag === 1)));

    // Full-population summary (all findSafeApplication calls, any phase/kind/anchor).
    analyzeGroup("ALL findSafeApplication calls (any phase/kind/anchor)", all);

    expect(primary.length).toBeGreaterThan(0);
  }, 600_000);
});
