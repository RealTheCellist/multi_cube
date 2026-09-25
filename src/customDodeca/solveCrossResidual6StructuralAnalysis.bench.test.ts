/**
 * MEGAMINX_SOLVECROSS_RESIDUAL6_STRUCTURAL_ANALYSIS_V1 -- pure measurement
 * Sprint (no algorithm/production change). Compares round-by-round frontier
 * growth (reconstructed from the EXISTING CROSS_LOG's roundSideBitmask +
 * roundNewCounts -- no new Rust instrumentation needed) across three
 * groups:
 *   RESIDUAL   -- 6 fixtures unsolved even at maxHalfDepth=14 (structural)
 *   DEPTH13_ONLY -- 4 fixtures that need exactly depth 13 (not rescued at 12)
 *   DEPTH12_RESCUED -- a representative sample of the 16 fixtures depth=12 already rescues
 *
 * All fixtures run at maxHalfDepth=14 (generous, to see the RESIDUAL
 * group's full growth trajectory even though they don't meet).
 *
 * A structural fact worth stating up front, provable directly from
 * bidirectional_search_impl's own loop (`for round in 0..max_half_depth`,
 * exactly one side expands per round): combined reachable depth after N
 * total rounds is EXACTLY N, regardless of which side is chosen each
 * round. The "expand smaller side" policy affects computational COST
 * (keeping both trees balanced minimizes total node generation for a
 * given target depth -- standard meet-in-the-middle theory), not the
 * MAXIMUM depth reachable within a fixed round budget. This Sprint
 * verifies that prediction empirically and checks whether the RESIDUAL
 * group shows any OTHER structural anomaly (e.g. anomalously slow unique-
 * state growth) that a policy change could address, as opposed to simply
 * needing more total rounds than 14 provides.
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

const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };

function parseKey(key: string): { tier: "easy" | "normal" | "hard"; seed: number } {
  const [tier, seedStr] = key.split("#");
  return { tier: tier as "easy" | "normal" | "hard", seed: Number(seedStr) };
}

function scrambledStateFor(key: string): MegaminxState {
  const { tier, seed } = parseKey(key);
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

function runAt(key: string, maxHalfDepth: number): { solved: boolean; log: CrossLogEntry | null } {
  const scrambled = scrambledStateFor(key);
  resetCrossLog();
  let solved = true;
  try {
    solveCross(scrambled, maxHalfDepth);
  } catch {
    solved = false;
  }
  const log = readCrossLog();
  return { solved, log: log.length > 0 ? log[log.length - 1] : null };
}

/** Reconstructs, from roundSideBitmask + roundNewCounts, the cumulative forward/backward tree size AFTER each round (index 0 = after round 0). */
function reconstructTrajectory(log: CrossLogEntry): { forward: number[]; backward: number[] } {
  const forward: number[] = [];
  const backward: number[] = [];
  let fSize = 1;
  let bSize = 1;
  const roundsToShow = Math.min(16, Math.max(log.roundsCompleted, 0) + (log.terminationReason === 1 ? 1 : 0));
  for (let r = 0; r < roundsToShow; r++) {
    const expandsBackward = (log.roundSideBitmask & (1n << BigInt(r))) !== 0n;
    const newCount = log.roundNewCounts[r] ?? 0;
    if (expandsBackward) bSize += newCount;
    else fSize += newCount;
    forward.push(fSize);
    backward.push(bSize);
  }
  return { forward, backward };
}

function analyzeGroup(label: string, keys: string[], maxHalfDepth: number): void {
  console.log(`\n=== ${label} (n=${keys.length}, maxHalfDepth=${maxHalfDepth}) ===`);
  for (const key of keys) {
    const { solved, log } = runAt(key, maxHalfDepth);
    if (!log) {
      console.log(`  ${key}: (no log -- already solved without a wasm call)`);
      continue;
    }
    const traj = reconstructTrajectory(log);
    const dupRatio = log.totalGenerated > 0 ? (((log.totalGenerated - log.totalAccepted) / log.totalGenerated) * 100).toFixed(1) : "n/a";
    console.log(
      `  ${key}: solved=${solved} solLen=${log.solutionLength ?? "-"} term=${["MEET_FOUND", "FRONTIER_EXCEEDED", "ROUNDS_EXHAUSTED"][log.terminationReason]} ` +
        `roundsCompleted=${log.roundsCompleted}/${maxHalfDepth} fwdRounds=${log.forwardRounds} bwdRounds=${log.backwardRounds} (sum=${log.forwardRounds + log.backwardRounds}) ` +
        `fwdFinal=${log.forwardFinalSize} bwdFinal=${log.backwardFinalSize} dupRatio=${dupRatio}%`,
    );
    console.log(`    forward trajectory:  [${traj.forward.join(", ")}]`);
    console.log(`    backward trajectory: [${traj.backward.join(", ")}]`);
    // Per-round growth multiplier (this round's new tree size / last round's), for whichever side expanded.
    const bitmaskBits: boolean[] = [];
    for (let r = 0; r < traj.forward.length; r++) bitmaskBits.push((log.roundSideBitmask & (1n << BigInt(r))) !== 0n);
    const growthRates: string[] = [];
    let prevF = 1;
    let prevB = 1;
    for (let r = 0; r < traj.forward.length; r++) {
      if (bitmaskBits[r]) {
        growthRates.push(`r${r}:B×${(traj.backward[r] / prevB).toFixed(2)}`);
        prevB = traj.backward[r];
        prevF = traj.forward[r];
      } else {
        growthRates.push(`r${r}:F×${(traj.forward[r] / prevF).toFixed(2)}`);
        prevF = traj.forward[r];
        prevB = traj.backward[r];
      }
    }
    console.log(`    per-round growth: ${growthRates.join(" ")}`);
  }
}

describe("MEGAMINX_SOLVECROSS_RESIDUAL6_STRUCTURAL_ANALYSIS_V1", () => {
  it("compares round-by-round frontier growth across residual / depth13-only / depth12-rescued groups", () => {
    const RESIDUAL = ["normal#28", "hard#6", "hard#24", "hard#30", "hard#31", "hard#39"];
    const DEPTH13_ONLY = ["hard#5", "hard#9", "hard#25", "hard#36"];
    const DEPTH12_RESCUED_SAMPLE = ["normal#13", "normal#20", "hard#1", "hard#2", "hard#7", "hard#33"];

    analyzeGroup("RESIDUAL (unsolved even at depth 14)", RESIDUAL, 14);
    analyzeGroup("DEPTH13_ONLY (rescued exactly at depth 13)", DEPTH13_ONLY, 14);
    analyzeGroup("DEPTH12_RESCUED (sample of the 16 already-rescued)", DEPTH12_RESCUED_SAMPLE, 14);

    // ---- Cross-group aggregate comparison ----
    function aggregateStats(keys: string[], maxHalfDepth: number): { avgDupRatio: number; avgSplitSum: number; avgFwdFinal: number; avgBwdFinal: number } {
      const logs = keys.map((k) => runAt(k, maxHalfDepth).log).filter((l): l is CrossLogEntry => l !== null);
      const dup = logs.map((l) => (l.totalGenerated > 0 ? (l.totalGenerated - l.totalAccepted) / l.totalGenerated : 0));
      const splitSum = logs.map((l) => l.forwardRounds + l.backwardRounds);
      return {
        avgDupRatio: (dup.reduce((a, b) => a + b, 0) / dup.length) * 100,
        avgSplitSum: splitSum.reduce((a, b) => a + b, 0) / splitSum.length,
        avgFwdFinal: logs.reduce((a, l) => a + l.forwardFinalSize, 0) / logs.length,
        avgBwdFinal: logs.reduce((a, l) => a + l.backwardFinalSize, 0) / logs.length,
      };
    }

    console.log("\n=== AGGREGATE COMPARISON ===");
    const residualAgg = aggregateStats(["normal#28", "hard#6", "hard#24", "hard#30", "hard#31", "hard#39"], 14);
    const d13Agg = aggregateStats(["hard#5", "hard#9", "hard#25", "hard#36"], 14);
    const d12Agg = aggregateStats(["normal#13", "normal#20", "hard#1", "hard#2", "hard#7", "hard#33"], 14);
    console.log(`  RESIDUAL:        avgDupRatio=${residualAgg.avgDupRatio.toFixed(1)}% avgSplitSum(fwdRounds+bwdRounds)=${residualAgg.avgSplitSum.toFixed(2)} avgFwdFinal=${residualAgg.avgFwdFinal.toFixed(0)} avgBwdFinal=${residualAgg.avgBwdFinal.toFixed(0)}`);
    console.log(`  DEPTH13_ONLY:    avgDupRatio=${d13Agg.avgDupRatio.toFixed(1)}% avgSplitSum(fwdRounds+bwdRounds)=${d13Agg.avgSplitSum.toFixed(2)} avgFwdFinal=${d13Agg.avgFwdFinal.toFixed(0)} avgBwdFinal=${d13Agg.avgBwdFinal.toFixed(0)}`);
    console.log(`  DEPTH12_RESCUED: avgDupRatio=${d12Agg.avgDupRatio.toFixed(1)}% avgSplitSum(fwdRounds+bwdRounds)=${d12Agg.avgSplitSum.toFixed(2)} avgFwdFinal=${d12Agg.avgFwdFinal.toFixed(0)} avgBwdFinal=${d12Agg.avgBwdFinal.toFixed(0)}`);

    // ---- Verify the structural claim: forwardRounds + backwardRounds == roundsCompleted (or maxHalfDepth if exhausted), for EVERY group, regardless of split ratio. ----
    console.log("\n=== STRUCTURAL VERIFICATION: forwardRounds + backwardRounds == total rounds run, for ALL groups (split-policy-independent) ===");
    const allKeys = [...RESIDUAL, ...DEPTH13_ONLY, ...DEPTH12_RESCUED_SAMPLE];
    let allConsistent = true;
    for (const k of allKeys) {
      const { log } = runAt(k, 14);
      if (!log) continue;
      const sum = log.forwardRounds + log.backwardRounds;
      const expected = log.terminationReason === 0 ? log.roundsCompleted : 14;
      if (sum !== expected) {
        allConsistent = false;
        console.log(`  MISMATCH: ${k} fwdRounds+bwdRounds=${sum} but expected ${expected}`);
      }
    }
    console.log(`  all ${allKeys.length} fixtures consistent with "combined depth == total rounds regardless of split": ${allConsistent}`);
  }, 900_000);
});
