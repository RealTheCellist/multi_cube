/**
 * MEGAMINX_SOLVECROSS_COMPLETENESS_V1 -- Failure Census (Sections 3-5 of the
 * work order): pure measurement, no algorithm change. Collects CROSS_LOG for
 * all 100 scrambles at the production maxHalfDepth=11, classifies the
 * ~26 failures into Type A (frontier exhaustion) / B (meeting-structure
 * problem) / C (depth insufficiency) / D (implementation/policy problem) /
 * UNKNOWN, then re-runs ONLY the failing scrambles at maxHalfDepth=12/13/14
 * (diagnostic only, not a proposed fix) to separate "genuinely needs more
 * depth" from "would never converge regardless of depth".
 *
 * Absolute constraints honored: solve_cross's own algorithm/control-flow is
 * completely unchanged (confirmed via the 23-test suite: identical cross
 * solution depths and solveMegaminx solution lengths). Phase 2bc/3 are not
 * touched. This file only calls existing exported functions.
 */
import { describe, it } from "vitest";
import { solveCross } from "./megaminxSolver";
import { readCrossLog, resetCrossLog, type CrossLogEntry } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

interface Rec {
  tier: "easy" | "normal" | "hard";
  seed: number;
  scrambleLength: number;
  scrambled: MegaminxState;
  solved: boolean;
  wallMs: number;
  log: CrossLogEntry | null;
}

const PLAN: { tier: Rec["tier"]; length: number; count: number }[] = [
  { tier: "easy", length: 15, count: 20 },
  { tier: "normal", length: 40, count: 40 },
  { tier: "hard", length: 70, count: 40 },
];

function runOne(tier: Rec["tier"], seed: number, scrambleLength: number): Rec {
  const turns = randomMegaminxScramble(scrambleLength, mulberry32(seed * 97 + scrambleLength * 7919));
  const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
  resetCrossLog();
  const t0 = performance.now();
  let solved = true;
  try {
    solveCross(scrambled);
  } catch {
    solved = false;
  }
  const wallMs = performance.now() - t0;
  const log = readCrossLog();
  return { tier, seed, scrambleLength, scrambled, solved, wallMs, log: log.length > 0 ? log[log.length - 1] : null };
}

type FailureType = "A_frontier_exhaustion" | "B_meeting_structure" | "C_depth_insufficient" | "D_policy" | "UNKNOWN";

function classify(r: Rec): FailureType {
  const l = r.log;
  if (!l) return "UNKNOWN";
  if (l.terminationReason === 1) return "A_frontier_exhaustion";
  if (l.terminationReason === 2 && l.roundsCompleted === l.maxHalfDepth) {
    // Full round budget consumed with no meet. Given max_half_depth is a
    // SHARED total-round budget (bidirectional_search_impl expands
    // whichever side is currently smaller, one level per round -- see
    // this Sprint's own report), the combined reachable depth after
    // maxHalfDepth rounds is bounded by maxHalfDepth itself, not 2x it.
    // That structural fact (not a bug in this Sprint's sense -- it's the
    // original, pre-Wasm-port JS design too, confirmed by diffing against
    // the pre-port commit) is a policy/architecture choice that caps
    // effective search depth well below what the "half depth" name
    // suggests -- classified D (policy) when the split is roughly even
    // (neither side dominates, ruling out one side being pathologically
    // starved), else C (the split itself, not the total budget, may be
    // the limiting factor).
    const imbalance = Math.abs(l.forwardRounds - l.backwardRounds);
    return imbalance <= 2 ? "D_policy" : "C_depth_insufficient";
  }
  return "UNKNOWN";
}

function summarizeLog(label: string, l: CrossLogEntry | null): string {
  if (!l) return `${label}: (no log -- already solved, no wasm call made)`;
  const dupRatio = l.totalGenerated > 0 ? (((l.totalGenerated - l.totalAccepted) / l.totalGenerated) * 100).toFixed(1) : "n/a";
  return `${label}: found=${l.found} solLen=${l.solutionLength ?? "-"} term=${["MEET_FOUND", "FRONTIER_EXCEEDED", "ROUNDS_EXHAUSTED"][l.terminationReason]} roundsCompleted=${l.roundsCompleted}/${l.maxHalfDepth} fwdRounds=${l.forwardRounds} bwdRounds=${l.backwardRounds} fwdFinalSize=${l.forwardFinalSize} bwdFinalSize=${l.backwardFinalSize} generated=${l.totalGenerated} accepted=${l.totalAccepted} dupRatio=${dupRatio}% meetingAttempts=${l.meetingAttempts}`;
}

describe("MEGAMINX_SOLVECROSS_COMPLETENESS_V1: failure census", () => {
  it("collects CROSS_LOG across 100 scrambles at maxHalfDepth=11, classifies failures, and sweeps depth 12/13/14 diagnostically", () => {
    const all: Rec[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) all.push(runOne(tier, seed, length));
    }

    const solved = all.filter((r) => r.solved);
    const failed = all.filter((r) => !r.solved);
    console.log(`CENSUS: solved ${solved.length}/100, failed ${failed.length}/100`);

    // ---- Section 3: baseline stats (solved vs failed) ----
    console.log("\n=== SOLVED calls: aggregate stats ===");
    const solvedLogs = solved.map((r) => r.log).filter((l): l is CrossLogEntry => l !== null);
    console.log(`  n=${solvedLogs.length}, avg forwardRounds=${(solvedLogs.reduce((a, l) => a + l.forwardRounds, 0) / solvedLogs.length).toFixed(2)}, avg backwardRounds=${(solvedLogs.reduce((a, l) => a + l.backwardRounds, 0) / solvedLogs.length).toFixed(2)}, avg roundsCompleted=${(solvedLogs.reduce((a, l) => a + l.roundsCompleted, 0) / solvedLogs.length).toFixed(2)}, max solutionLength=${Math.max(...solvedLogs.map((l) => l.solutionLength ?? 0))}`);

    console.log("\n=== FAILED calls: detail + classification ===");
    const typeCounts: Record<FailureType, number> = { A_frontier_exhaustion: 0, B_meeting_structure: 0, C_depth_insufficient: 0, D_policy: 0, UNKNOWN: 0 };
    for (const r of failed) {
      const type = classify(r);
      typeCounts[type]++;
      console.log(`  ${r.tier}#${r.seed} (len=${r.scrambleLength}, wall=${r.wallMs.toFixed(1)}ms) [${type}] -- ${summarizeLog("", r.log)}`);
    }
    console.log("\n=== Type distribution across 26 failures ===");
    for (const [type, count] of Object.entries(typeCounts)) console.log(`  ${type}: ${count}`);

    // ---- Section 5: depth sweep 11(baseline)/12/13/14, diagnostic only ----
    console.log("\n=== DEPTH SWEEP: re-running each failure at maxHalfDepth=12/13/14 (current algorithm, unmodified) ===");
    const sweepResults: { key: string; d12: boolean; d13: boolean; d14: boolean; log12: CrossLogEntry | null; log13: CrossLogEntry | null; log14: CrossLogEntry | null }[] = [];
    for (const r of failed) {
      const attempt = (depth: number): { solved: boolean; log: CrossLogEntry | null } => {
        resetCrossLog();
        // solveCross(state, depth) throws on failure and returns [] when
        // already solved (never the case here, these are real failures) --
        // reuse it directly (same production wasm binding call) instead of
        // re-deriving the piece list solveCrossWasm needs.
        let ok = true;
        try {
          solveCross(r.scrambled, depth);
        } catch {
          ok = false;
        }
        const log = readCrossLog();
        return { solved: ok, log: log.length > 0 ? log[log.length - 1] : null };
      };
      const a12 = attempt(12);
      const a13 = attempt(13);
      const a14 = attempt(14);
      sweepResults.push({ key: `${r.tier}#${r.seed}`, d12: a12.solved, d13: a13.solved, d14: a14.solved, log12: a12.log, log13: a13.log, log14: a14.log });
      console.log(`  ${r.tier}#${r.seed}: d12=${a12.solved ? "SOLVED(" + a12.log?.solutionLength + ")" : "fail"} d13=${a13.solved ? "SOLVED(" + a13.log?.solutionLength + ")" : "fail"} d14=${a14.solved ? "SOLVED(" + a14.log?.solutionLength + ")" : "fail"}`);
    }
    const rescued12 = sweepResults.filter((s) => s.d12).length;
    const rescued13 = sweepResults.filter((s) => s.d13).length;
    const rescued14 = sweepResults.filter((s) => s.d14).length;
    console.log(`\n=== DEPTH SWEEP SUMMARY: of ${failed.length} depth-11 failures -- rescued at 12: ${rescued12}, at 13: ${rescued13}, at 14: ${rescued14} ===`);

    // ---- Section 6: search budget vs depth -- for a sample of rescued calls, report cost growth ----
    console.log("\n=== COST GROWTH for rescued calls (depth11 fail -> depth-N solved) ===");
    for (const s of sweepResults) {
      const rescueDepth = s.d12 ? 12 : s.d13 ? 13 : s.d14 ? 14 : null;
      if (rescueDepth === null) continue;
      const log = rescueDepth === 12 ? s.log12 : rescueDepth === 13 ? s.log13 : s.log14;
      console.log(`  ${s.key}: rescued at depth ${rescueDepth} -- ${summarizeLog("", log)}`);
    }

    // ---- Section 7: representative fixture selection (5) ----
    console.log("\n=== SECTION 7: representative fixture candidates ===");
    const byWall = [...failed].sort((a, b) => a.wallMs - b.wallMs);
    const byFrontier = [...failed].sort((a, b) => Math.max(b.log?.forwardFinalSize ?? 0, b.log?.backwardFinalSize ?? 0) - Math.max(a.log?.forwardFinalSize ?? 0, a.log?.backwardFinalSize ?? 0));
    console.log(`  easiest (shortest scramble): ${failed.filter((r) => r.scrambleLength === Math.min(...failed.map((f) => f.scrambleLength)))[0]?.tier}#${failed.filter((r) => r.scrambleLength === Math.min(...failed.map((f) => f.scrambleLength)))[0]?.seed}`);
    console.log(`  fastest failure (wall time): ${byWall[0]?.tier}#${byWall[0]?.seed} (${byWall[0]?.wallMs.toFixed(1)}ms)`);
    console.log(`  slowest failure (wall time): ${byWall[byWall.length - 1]?.tier}#${byWall[byWall.length - 1]?.seed} (${byWall[byWall.length - 1]?.wallMs.toFixed(1)}ms)`);
    console.log(`  largest frontier: ${byFrontier[0]?.tier}#${byFrontier[0]?.seed} (fwd=${byFrontier[0]?.log?.forwardFinalSize}, bwd=${byFrontier[0]?.log?.backwardFinalSize})`);
    const unusualTermination = failed.find((r) => classify(r) !== "D_policy" && classify(r) !== "C_depth_insufficient");
    console.log(`  unusual termination: ${unusualTermination ? `${unusualTermination.tier}#${unusualTermination.seed} [${classify(unusualTermination)}]` : "none found -- all failures classify D_policy/C_depth_insufficient"}`);

    // Full list for the report to pick exact 5 from.
    console.log(`\nALL 26 FAILURE KEYS: ${failed.map((r) => `${r.tier}#${r.seed}`).join(", ")}`);
  }, 900_000);
});
