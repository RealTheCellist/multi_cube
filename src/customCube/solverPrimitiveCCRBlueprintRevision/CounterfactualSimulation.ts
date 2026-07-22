// --- CounterfactualSimulation (CCR Integration Blueprint Revision Sprint
// v1) --------------------------------------------------------------------
// STEP3. "Executor는 수정하지 않는다" -- this file never touches
// fiveByFiveEdgeExecutor.ts. The counterfactual ("what if Recovery had
// triggered 100/200/300ms earlier") is simulated purely by adding that
// offset to each snapshot's OWN REAL remaining-time-at-trigger
// (TriggerTimingAnalysis.ts) before calling generateRecoveryStrategies()
// directly (read-only reuse, unmodified) -- exactly the same technique
// PrimitiveBudgetAnalysis.ts already uses for the real (0ms offset) case.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildLibs } from "../solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { TimingDiagnosticRecord } from "../solverPrimitiveCCRProductionIntegration/RecoveryTimingDiagnostic";

const PLAN_TIME_BUDGET_MS = 1000;
export const COUNTERFACTUAL_OFFSETS_MS: readonly number[] = [0, 100, 200, 300];

export interface CounterfactualResult {
  offsetMs: number;
  n: number;
  anyGeneratedRate: number; // fraction of triggered snapshots where generateRecoveryStrategies produced >=1 candidate of ANY type
  ccrGeneratedRate: number; // fraction where CCR specifically was generated
  repairGeneratedRate: number;
}

export function runCounterfactualOffset(
  snapshots: readonly FailureSnapshot[],
  triggerRecords: readonly TimingDiagnosticRecord[],
  offsetMs: number,
): CounterfactualResult {
  const { libs } = buildLibs();
  const triggerByHash = new Map(triggerRecords.map((r) => [r.hash, r]));
  const triggered = snapshots.filter((s) => {
    const t = triggerByHash.get(s.hash);
    return t?.recoveryTriggered && t.recoveryTriggeredAtMs !== null;
  });

  let anyGeneratedCount = 0;
  let ccrGeneratedCount = 0;
  let repairGeneratedCount = 0;

  for (const s of triggered) {
    const t = triggerByHash.get(s.hash)!;
    const realRemainingMs = Math.max(0, PLAN_TIME_BUDGET_MS - (t.recoveryTriggeredAtMs as number));
    const counterfactualRemainingMs = realRemainingMs + offsetMs;
    const cubies = deserializeCube(s.cubeState);
    const events: SchedulingEvent[] = [];
    const deadline = Date.now() + counterfactualRemainingMs;
    const candidates = generateRecoveryStrategies(cubies, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", (e) => events.push(e), true);
    if (candidates.length > 0) anyGeneratedCount++;
    if (candidates.some((c) => c.type === "CCR")) ccrGeneratedCount++;
    if (candidates.some((c) => c.type === "REPAIR")) repairGeneratedCount++;
  }

  const n = triggered.length;
  return {
    offsetMs,
    n,
    anyGeneratedRate: n ? anyGeneratedCount / n : 0,
    ccrGeneratedRate: n ? ccrGeneratedCount / n : 0,
    repairGeneratedRate: n ? repairGeneratedCount / n : 0,
  };
}

export function runAllCounterfactuals(snapshots: readonly FailureSnapshot[], triggerRecords: readonly TimingDiagnosticRecord[]): CounterfactualResult[] {
  return COUNTERFACTUAL_OFFSETS_MS.map((offsetMs) => runCounterfactualOffset(snapshots, triggerRecords, offsetMs));
}
