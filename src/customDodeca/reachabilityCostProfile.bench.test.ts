/**
 * MEGAMINX_3SEC_REACHABILITY_COST_PROFILE_V1 -- pure measurement Sprint.
 *
 * Question: of the ~71% of findSafeApplication time that ISN'T removable
 * by solve-local caching (MEGAMINX_3SEC_REACHABILITY_REUSE_ANALYSIS_V1's
 * own "unique configuration" calls), where does the cost structurally
 * come from -- MAX_REACHABLE saturation, deep search, or per-call
 * overhead unrelated to node count?
 *
 * Absolute constraints honored: build_reachable_impl's own control flow,
 * search order, and return value are byte-for-byte unchanged (only local
 * counters -- expanded_nodes, generated_states -- were added alongside
 * the existing loop, read by nothing inside it; confirmed by rerunning
 * the full 23-test suite, identical cross solution depths to every prior
 * run this session). No cache/index/heuristic/depth/maxReachable change.
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
  const findSafeTimes: number[] = [];
  const findFinishingTimes: number[] = [];
  const origFindSafe = searchWasm.findSafeApplicationWasm;
  const origFindFinishing = searchWasm.findFinishingApplicationWasm;
  const spies = [
    vi.spyOn(searchWasm, "findSafeApplicationWasm").mockImplementation((...args: Parameters<typeof origFindSafe>) => {
      const t0 = performance.now();
      const r = origFindSafe(...args);
      findSafeTimes.push(performance.now() - t0);
      return r;
    }),
    vi.spyOn(searchWasm, "findFinishingApplicationWasm").mockImplementation((...args: Parameters<typeof origFindFinishing>) => {
      const t0 = performance.now();
      const r = origFindFinishing(...args);
      findFinishingTimes.push(performance.now() - t0);
      return r;
    }),
  ];
  return { findSafeTimes, findFinishingTimes, uninstall: () => spies.forEach((s) => s.mockRestore()) };
}

interface BfsRecord {
  tier: "easy" | "normal" | "hard";
  phase: string;
  callerTag: 0 | 1 | 2;
  kind: 0 | 1;
  elapsedMs: number;
  expandedNodes: number;
  generatedStates: number;
  resultSize: number;
  maxDepthReached: number;
  terminationReason: 0 | 1 | 2 | 3;
  configuredMaxDepth: number;
  configuredMaxReachable: number;
}

const PHASES: { name: string; fn: (s: MegaminxState) => MegaminxTurn[] }[] = [
  { name: "phase1_firstLayer", fn: solveFirstLayer },
  { name: "phase2a_upperEdges", fn: solveUpperEdges },
  { name: "phase2bc_middleLayer", fn: solveMiddleLayer },
  { name: "phase3a_lowerLowerEdges", fn: solveLowerLowerEdges },
  { name: "phase3bc_lastLayer", fn: solveLastLayer },
];

function runOne(tier: BfsRecord["tier"], seed: number, scrambleLength: number, out: BfsRecord[]): { solved: boolean } {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  let current: MegaminxState = applyMegaminxScramble(solvedMegaminxState(), turns);

  for (const { name, fn } of PHASES) {
    resetReachLog();
    const spies = installTimedSpies();
    let seq: MegaminxTurn[];
    try {
      seq = fn(current);
    } catch (e) {
      spies.uninstall();
      return { solved: false };
    }
    spies.uninstall();
    current = applySeq(current, seq);

    const log = readReachLog();
    const findSafe = log.filter((e) => e.callerTag === 0 || e.callerTag === 1);
    const findFinishing = log.filter((e) => e.callerTag === 2);
    findSafe.forEach((e, i) => out.push(toRecord(tier, name, e, spies.findSafeTimes[i] ?? 0)));
    findFinishing.forEach((e, i) => out.push(toRecord(tier, name, e, spies.findFinishingTimes[i] ?? 0)));
  }
  return { solved: isMegaminxFullySolved(current) };
}

function toRecord(tier: BfsRecord["tier"], phase: string, e: ReachLogEntry, elapsedMs: number): BfsRecord {
  return {
    tier,
    phase,
    callerTag: e.callerTag,
    kind: e.kind,
    elapsedMs,
    expandedNodes: e.expandedNodes,
    generatedStates: e.generatedStates,
    resultSize: e.resultSize,
    maxDepthReached: e.maxDepthReached,
    terminationReason: e.terminationReason,
    configuredMaxDepth: e.maxDepth,
    configuredMaxReachable: e.maxReachable,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

function summarizePercentiles(label: string, values: number[]): string {
  const s = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${label}: mean=${mean.toFixed(2)} P50=${percentile(s, 50).toFixed(2)} P75=${percentile(s, 75).toFixed(2)} P90=${percentile(s, 90).toFixed(2)} P95=${percentile(s, 95).toFixed(2)} P99=${percentile(s, 99).toFixed(2)} MAX=${(s[s.length - 1] ?? 0).toFixed(2)} n=${values.length}`;
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return num / Math.sqrt(dx2 * dy2);
}

const TERMINATION_NAMES = ["MAX_DEPTH", "MAX_REACHABLE", "SEARCH_EXHAUSTED", "OTHER"] as const;

describe("MEGAMINX_3SEC_REACHABILITY_COST_PROFILE_V1", () => {
  it("profiles the cost structure of unique-configuration BFS calls across 50 scrambles (10 easy / 20 normal / 20 hard)", () => {
    {
      const warm = applyMegaminxScramble(solvedMegaminxState(), randomMegaminxScramble(40, mulberry32(999)));
      let s: MegaminxState = warm;
      for (const { fn } of PHASES) s = applySeq(s, fn(s));
      expect(isMegaminxFullySolved(s)).toBe(true);
    }

    const plan: { tier: BfsRecord["tier"]; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 10 },
      { tier: "normal", length: 40, count: 20 },
      { tier: "hard", length: 70, count: 20 },
    ];

    const all: BfsRecord[] = [];
    let solvedCount = 0;
    let failedCount = 0;
    for (const { tier, length, count } of plan) {
      for (let seed = 1; seed <= count; seed++) {
        const r = runOne(tier, seed, length, all);
        if (r.solved) solvedCount++;
        else failedCount++;
      }
    }
    console.log(`PROFILE: solved ${solvedCount}/${solvedCount + failedCount}, failures (solveCross-style, tracked not fixed) = ${failedCount}`);

    const findSafe = all.filter((r) => r.callerTag === 0 || r.callerTag === 1);
    const findFinishing = all.filter((r) => r.callerTag === 2);
    console.log(`PROFILE: findSafeApplication BFS records = ${findSafe.length}, findFinishingApplication BFS records = ${findFinishing.length}`);

    // --- Section 5: time / node percentiles (findSafeApplication only, per this Sprint's own scope) ---
    console.log("PROFILE:", summarizePercentiles("elapsedMs (findSafe)", findSafe.map((r) => r.elapsedMs)));
    console.log("PROFILE:", summarizePercentiles("expandedNodes (findSafe)", findSafe.map((r) => r.expandedNodes)));
    console.log("PROFILE:", summarizePercentiles("generatedStates (findSafe)", findSafe.map((r) => r.generatedStates)));

    // --- depth distribution ---
    const byDepth = new Map<number, { count: number; totalMs: number }>();
    for (const r of findSafe) {
      const cur = byDepth.get(r.maxDepthReached) ?? { count: 0, totalMs: 0 };
      cur.count++;
      cur.totalMs += r.elapsedMs;
      byDepth.set(r.maxDepthReached, cur);
    }
    const totalFindSafeMs = findSafe.reduce((a, r) => a + r.elapsedMs, 0);
    console.log("PROFILE: depth distribution (maxDepthReached -> count, % of calls, % of findSafe time)");
    for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
      const d = byDepth.get(depth)!;
      console.log(`  depth=${depth}: count=${d.count} (${((d.count / findSafe.length) * 100).toFixed(1)}%) time=${d.totalMs.toFixed(1)}ms (${((d.totalMs / totalFindSafeMs) * 100).toFixed(1)}%)`);
    }

    // --- termination distribution ---
    const byTerm = new Map<number, { count: number; totalMs: number }>();
    for (const r of findSafe) {
      const cur = byTerm.get(r.terminationReason) ?? { count: 0, totalMs: 0 };
      cur.count++;
      cur.totalMs += r.elapsedMs;
      byTerm.set(r.terminationReason, cur);
    }
    console.log("PROFILE: termination distribution");
    for (const t of [0, 1, 2, 3] as const) {
      const d = byTerm.get(t) ?? { count: 0, totalMs: 0 };
      console.log(`  ${TERMINATION_NAMES[t]}: count=${d.count} (${((d.count / findSafe.length) * 100).toFixed(1)}%) time=${d.totalMs.toFixed(1)}ms (${((d.totalMs / totalFindSafeMs) * 100).toFixed(1)}%)`);
    }

    // --- phase x cost ---
    console.log("PROFILE: phase x findSafe cost");
    for (const { name } of PHASES) {
      const pr = findSafe.filter((r) => r.phase === name);
      if (pr.length === 0) continue;
      const ms = pr.reduce((a, r) => a + r.elapsedMs, 0);
      const nodes = pr.reduce((a, r) => a + r.expandedNodes, 0);
      console.log(`  ${name}: calls=${pr.length} totalMs=${ms.toFixed(1)} (${((ms / totalFindSafeMs) * 100).toFixed(1)}%) totalExpandedNodes=${nodes} avgMsPerCall=${(ms / pr.length).toFixed(3)}`);
    }

    // --- kind x cost ---
    console.log("PROFILE: kind x findSafe cost");
    for (const kind of [0, 1] as const) {
      const kr = findSafe.filter((r) => r.kind === kind);
      if (kr.length === 0) continue;
      const ms = kr.reduce((a, r) => a + r.elapsedMs, 0);
      console.log(`  kind=${kind === 0 ? "corner" : "edge"}: calls=${kr.length} totalMs=${ms.toFixed(1)} (${((ms / totalFindSafeMs) * 100).toFixed(1)}%) avgMsPerCall=${(ms / kr.length).toFixed(3)}`);
    }

    // --- anchor mode (callerTag) x cost ---
    console.log("PROFILE: anchor mode x findSafe cost");
    for (const tag of [0, 1] as const) {
      const tr = findSafe.filter((r) => r.callerTag === tag);
      if (tr.length === 0) continue;
      const ms = tr.reduce((a, r) => a + r.elapsedMs, 0);
      console.log(`  ${tag === 0 ? "single-anchor" : "pair-anchor"}: calls=${tr.length} totalMs=${ms.toFixed(1)} (${((ms / totalFindSafeMs) * 100).toFixed(1)}%) avgMsPerCall=${(ms / tr.length).toFixed(3)}`);
    }

    // --- Q3: runtime vs expanded_nodes correlation ---
    const r = pearsonR(findSafe.map((x) => x.elapsedMs), findSafe.map((x) => x.expandedNodes));
    console.log(`PROFILE: Pearson r(elapsedMs, expandedNodes) across all findSafe calls = ${r.toFixed(3)}`);

    // --- Q1: maxReachable hit rate ---
    const hitMaxReachable = findSafe.filter((r) => r.terminationReason === 1).length;
    console.log(`PROFILE: Q1 maxReachable hit rate = ${hitMaxReachable}/${findSafe.length} (${((hitMaxReachable / findSafe.length) * 100).toFixed(1)}%)`);

    // --- Q5: avg cost per unique BFS call ---
    console.log(`PROFILE: Q5 avg elapsedMs per findSafe call = ${(totalFindSafeMs / findSafe.length).toFixed(3)}ms, avg expandedNodes = ${(findSafe.reduce((a, r) => a + r.expandedNodes, 0) / findSafe.length).toFixed(1)}`);

    // --- Pattern C candidates: small expandedNodes but slow elapsedMs ---
    const msValues = findSafe.map((r) => r.elapsedMs).sort((a, b) => a - b);
    const msP90 = percentile(msValues, 90);
    const nodeValues = findSafe.map((r) => r.expandedNodes).sort((a, b) => a - b);
    const nodeP50 = percentile(nodeValues, 50);
    const patternCCandidates = findSafe.filter((r) => r.elapsedMs >= msP90 && r.expandedNodes <= nodeP50);
    console.log(`PROFILE: Pattern-C candidates (elapsedMs >= P90 of ${msP90.toFixed(2)}ms, but expandedNodes <= P50 of ${nodeP50}) = ${patternCCandidates.length}/${findSafe.length} (${((patternCCandidates.length / findSafe.length) * 100).toFixed(1)}%)`);

    expect(findSafe.length).toBeGreaterThan(0);
  }, 600_000);
});
