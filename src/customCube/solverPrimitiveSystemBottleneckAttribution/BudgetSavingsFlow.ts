// --- BudgetSavingsFlow (Solver System Bottleneck Attribution Sprint v1,
// STEP2) ---------------------------------------------------------------------
// Tracks where PAIR's real per-call time savings (Production Integration
// Sprint v1's own confirmed 44.88%->97.90% Budget Compliance improvement)
// actually go within the SAME solve() call: baseline (pairBudgetMs=undefined,
// pre-Integration-Sprint counterfactual) vs candidate (140ms, real
// production) mirrored on the SAME cube via StageInstrumentedMirror.ts.
import type { Cubie } from "../cubeState";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { mirrorSolveWithStages, type StageEvent } from "./StageInstrumentedMirror";

const ENDGAME_STAGES = new Set(["ENDGAME_BESTFIX", "ENDGAME_MULTIPLY", "ENDGAME_DISRUPTION"]);
const RECOVERY_STAGES = new Set([
  "RECOVERY_DISRUPT1",
  "RECOVERY_DISRUPT2",
  "RECOVERY_SETUP",
  "RECOVERY_REPAIR",
  "RECOVERY_CCR",
  "RECOVERY_RETRY",
]);

function sumByGroup(events: readonly StageEvent[]): { pair: number; flip: number; parity: number; endgame: number; recovery: number } {
  let pair = 0;
  let flip = 0;
  let parity = 0;
  let endgame = 0;
  let recovery = 0;
  for (const e of events) {
    if (e.stage === "PAIR") pair += e.runtimeMs;
    else if (e.stage === "FLIP") flip += e.runtimeMs;
    else if (e.stage === "PARITY") parity += e.runtimeMs;
    else if (ENDGAME_STAGES.has(e.stage)) endgame += e.runtimeMs;
    else if (RECOVERY_STAGES.has(e.stage)) recovery += e.runtimeMs;
  }
  return { pair, flip, parity, endgame, recovery };
}

export interface BudgetFlowRecord {
  hash: string;
  pairSavingsMs: number; // baseline PAIR total - candidate PAIR total (positive = candidate faster)
  endgameDeltaMs: number; // candidate ENDGAME total - baseline ENDGAME total
  recoveryDeltaMs: number; // candidate RECOVERY total - baseline RECOVERY total
  unaccountedMs: number; // pairSavingsMs - endgameDeltaMs - recoveryDeltaMs (savings that went nowhere -- solve() simply finished with idle time, or shifted among FLIP/PARITY/other PAIR attempts)
  baselineWrongAfter: number;
  candidateWrongAfter: number;
}

export function measureBudgetFlow(hash: string, cubies: Cubie[], libs: ExecutorLibraries): BudgetFlowRecord {
  const baseline = mirrorSolveWithStages(hash, cubies, libs, undefined);
  const candidate = mirrorSolveWithStages(hash, cubies, libs, 140);
  const baseGroups = sumByGroup(baseline.events);
  const candGroups = sumByGroup(candidate.events);

  const pairSavingsMs = baseGroups.pair - candGroups.pair;
  const endgameDeltaMs = candGroups.endgame - baseGroups.endgame;
  const recoveryDeltaMs = candGroups.recovery - baseGroups.recovery;
  const unaccountedMs = pairSavingsMs - endgameDeltaMs - recoveryDeltaMs;

  return {
    hash,
    pairSavingsMs,
    endgameDeltaMs,
    recoveryDeltaMs,
    unaccountedMs,
    baselineWrongAfter: baseline.wrongWingAfter,
    candidateWrongAfter: candidate.wrongWingAfter,
  };
}

export interface BudgetFlowSummary {
  n: number;
  avgPairSavingsMs: number;
  avgEndgameDeltaMs: number;
  avgRecoveryDeltaMs: number;
  avgUnaccountedMs: number;
  endgameAbsorptionPct: number; // avgEndgameDeltaMs / avgPairSavingsMs * 100 (share of savings absorbed by ENDGAME)
  recoveryAbsorptionPct: number;
  unaccountedPct: number;
}

export function summarizeBudgetFlow(records: readonly BudgetFlowRecord[]): BudgetFlowSummary {
  const n = records.length;
  const avg = (f: (r: BudgetFlowRecord) => number) => (n ? records.reduce((a, r) => a + f(r), 0) / n : 0);
  const avgPairSavingsMs = avg((r) => r.pairSavingsMs);
  const avgEndgameDeltaMs = avg((r) => r.endgameDeltaMs);
  const avgRecoveryDeltaMs = avg((r) => r.recoveryDeltaMs);
  const avgUnaccountedMs = avg((r) => r.unaccountedMs);
  const denom = Math.abs(avgPairSavingsMs) > 0.001 ? avgPairSavingsMs : 1;
  return {
    n,
    avgPairSavingsMs,
    avgEndgameDeltaMs,
    avgRecoveryDeltaMs,
    avgUnaccountedMs,
    endgameAbsorptionPct: (avgEndgameDeltaMs / denom) * 100,
    recoveryAbsorptionPct: (avgRecoveryDeltaMs / denom) * 100,
    unaccountedPct: (avgUnaccountedMs / denom) * 100,
  };
}
