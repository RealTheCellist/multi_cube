// --- ThreeArmBenchmark (ENDGAME Optimization Prototype Sprint v1, STEP2)
// -----------------------------------------------------------------------
// Runs ONE real, end-to-end trial across a snapshot subsample under all
// THREE budget policy arms required by the Work Order -- Baseline (today's
// real production behavior, no new args), Reserved Slice (ENDGAME_RESERVE_MS
// = 500, the Blueprint Sprint's own Final Operating Contract value), and
// Absorb (recoveryReserveMsOverride = 300, redistributing 150ms of the
// existing 450ms RECOVERY_RESERVE_MS back to ENDGAME's own primary attempt).
// Which policy wins is NOT decided here -- per the Work Order's explicit
// instruction, all three are measured empirically and compared side by
// side in STEP5/6.
//
// bestFixOverall/tryEndgameMultiPly's own shuffle() makes each solve() call
// genuinely stochastic (confirmed directly across this whole research arc,
// most recently in the Production Integration Sprint's own smoke test) --
// this is why STEP6 repeats this whole trial N>=30 times and compares
// TRIAL-LEVEL aggregates via paired-diff, never trusting a single trial.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { solveProbe, type SolveProbeResult } from "./SolveProbe";

export const ENDGAME_RESERVE_MS = 500; // Reserved Slice arm, per Blueprint Sprint v1's Final Operating Contract
export const ABSORB_RECOVERY_RESERVE_MS = 300; // Absorb arm: 450ms RECOVERY_RESERVE_MS -> 300ms, redistributing 150ms to ENDGAME

export interface ThreeArmResult {
  hash: string;
  baseline: SolveProbeResult;
  reservedSlice: SolveProbeResult;
  absorb: SolveProbeResult;
}

export interface ArmAggregate {
  n: number;
  improvedCount: number;
  solvedCount: number;
  avgWallMs: number;
  deadlineMissRate: number;
  taskActiveRate: number; // fraction with tasksCompleted > 0
  endgameInvokedCount: number;
  avgEndgameRuntimeMs: number; // over solves where ENDGAME actually ran
  avgEndgameRemainingBudgetAtStartMs: number;
}

export interface TrialAggregate {
  n: number;
  baseline: ArmAggregate;
  reservedSlice: ArmAggregate;
  absorb: ArmAggregate;
}

export function runOneTrial(snapshots: readonly FailureSnapshot[]): ThreeArmResult[] {
  return snapshots.map((s) => {
    const baseline = solveProbe(deserializeCube(s.cubeState));
    const reservedSlice = solveProbe(deserializeCube(s.cubeState), ENDGAME_RESERVE_MS, undefined);
    const absorb = solveProbe(deserializeCube(s.cubeState), undefined, ABSORB_RECOVERY_RESERVE_MS);
    return { hash: s.hash, baseline, reservedSlice, absorb };
  });
}

function summarizeArm(results: readonly SolveProbeResult[]): ArmAggregate {
  const n = results.length;
  const withEndgame = results.filter((r) => r.endgame !== null);
  const endgameInvokedCount = withEndgame.length;
  return {
    n,
    improvedCount: results.filter((r) => r.improved).length,
    solvedCount: results.filter((r) => r.solved).length,
    avgWallMs: n ? results.reduce((a, r) => a + r.wallMs, 0) / n : 0,
    deadlineMissRate: n ? results.filter((r) => r.deadlineMissed).length / n : 0,
    taskActiveRate: n ? results.filter((r) => r.tasksCompleted > 0).length / n : 0,
    endgameInvokedCount,
    avgEndgameRuntimeMs: endgameInvokedCount ? withEndgame.reduce((a, r) => a + r.endgame!.runtimeMs, 0) / endgameInvokedCount : 0,
    avgEndgameRemainingBudgetAtStartMs: endgameInvokedCount
      ? withEndgame.reduce((a, r) => a + r.endgame!.remainingBudgetAtStartMs, 0) / endgameInvokedCount
      : 0,
  };
}

export function summarizeTrial(results: readonly ThreeArmResult[]): TrialAggregate {
  return {
    n: results.length,
    baseline: summarizeArm(results.map((r) => r.baseline)),
    reservedSlice: summarizeArm(results.map((r) => r.reservedSlice)),
    absorb: summarizeArm(results.map((r) => r.absorb)),
  };
}
