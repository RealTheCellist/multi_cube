// --- PrimitiveBudgetAnalysis (CCR Integration Blueprint Revision Sprint v1)-
// STEP2. Measures how much REAL budget each Recovery candidate type
// (DISRUPT/SETUP/REPAIR/CCR) actually gets, using generateRecoveryStrategies()
// (fiveByFiveEdgeRecovery.ts, UNMODIFIED, called directly -- exactly the
// same read-only usage pattern every RawDataCollector-style file in this
// research arc has always used) with its own EXISTING onEvent
// instrumentation hook (added in Integration Refinement Sprint v1, never
// touched since). The deadline passed to each call is NOT a fresh
// Date.now()+1000ms (the prior Sprint's own flawed assumption) -- it is
// each snapshot's OWN REAL remaining-time-at-Recovery-trigger, taken
// directly from TriggerTimingAnalysis.ts's real trace measurement. This
// makes the simulated candidate-generation call faithfully reflect what
// the real production system actually hands Recovery, not an idealized
// budget.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildLibs } from "../solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { TimingDiagnosticRecord } from "../solverPrimitiveCCRProductionIntegration/RecoveryTimingDiagnostic";

const PLAN_TIME_BUDGET_MS = 1000;
type CandidateType = "DISRUPT" | "SETUP" | "REPAIR" | "CCR";

export interface PrimitiveBudgetRecord {
  hash: string;
  remainingAtTriggerMs: number;
  events: SchedulingEvent[];
}

export function analyzePrimitiveBudgets(snapshots: readonly FailureSnapshot[], triggerRecords: readonly TimingDiagnosticRecord[]): PrimitiveBudgetRecord[] {
  const { libs } = buildLibs();
  const triggerByHash = new Map(triggerRecords.map((r) => [r.hash, r]));
  const triggered = snapshots.filter((s) => {
    const t = triggerByHash.get(s.hash);
    return t?.recoveryTriggered && t.recoveryTriggeredAtMs !== null;
  });

  return triggered.map((s) => {
    const t = triggerByHash.get(s.hash)!;
    const remainingAtTriggerMs = Math.max(0, PLAN_TIME_BUDGET_MS - (t.recoveryTriggeredAtMs as number));
    const cubies = deserializeCube(s.cubeState);
    const events: SchedulingEvent[] = [];
    const deadline = Date.now() + remainingAtTriggerMs;
    generateRecoveryStrategies(cubies, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, true, "reservedBudget", (e) => events.push(e), true);
    return { hash: s.hash, remainingAtTriggerMs, events };
  });
}

export interface PrimitiveBudgetSummary {
  candidateType: CandidateType;
  gotATurnRate: number; // "start" event ever fired (not skipped before its own dispatch point)
  skippedRate: number; // genDeadline/outer deadline already passed before this candidate's own turn
  generatedRate: number; // among those that got a turn, produced a usable candidate
  avgObservedBudgetMs: number; // avg wall-clock between this type's own "start" and its own resolution event
}

// DISRUPT has two generators (genDisrupt1/genDisrupt2) sharing the same
// "DISRUPT" label (an existing convention from Integration Refinement
// Sprint v1, unchanged) -- so a single record can carry multiple
// start/resolve pairs for that type. Pairs consecutive start->resolve
// events in chronological order rather than assuming exactly one of each.
function pairEvents(events: readonly SchedulingEvent[], type: CandidateType): { start: SchedulingEvent; resolved: SchedulingEvent | null }[] {
  const ofType = events.filter((e) => e.candidateType === type).sort((a, b) => a.atMs - b.atMs);
  const pairs: { start: SchedulingEvent; resolved: SchedulingEvent | null }[] = [];
  let i = 0;
  while (i < ofType.length) {
    const e = ofType[i];
    if (e.phase === "start") {
      const resolved = ofType[i + 1] && (ofType[i + 1].phase === "generated" || ofType[i + 1].phase === "empty") ? ofType[i + 1] : null;
      pairs.push({ start: e, resolved });
      i += resolved ? 2 : 1;
    } else {
      i += 1; // a lone "skipped" (handled separately) or an orphaned resolve
    }
  }
  return pairs;
}

export function summarizePrimitiveBudgets(records: readonly PrimitiveBudgetRecord[]): PrimitiveBudgetSummary[] {
  const types: CandidateType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR"];
  return types.map((candidateType) => {
    const n = records.length;
    let skippedRecordCount = 0;
    let startedRecordCount = 0;
    let generatedRecordCount = 0;
    const observedDurations: number[] = [];

    for (const r of records) {
      const hasStart = r.events.some((e) => e.candidateType === candidateType && e.phase === "start");
      const hasSkip = r.events.some((e) => e.candidateType === candidateType && e.phase === "skipped");
      if (!hasStart && hasSkip) {
        skippedRecordCount++;
        continue;
      }
      if (!hasStart) continue; // this type left no trace at all for this record
      startedRecordCount++;
      const pairs = pairEvents(r.events, candidateType);
      if (pairs.some((p) => p.resolved?.phase === "generated")) generatedRecordCount++;
      for (const p of pairs) if (p.resolved) observedDurations.push(p.resolved.atMs - p.start.atMs);
    }

    return {
      candidateType,
      gotATurnRate: n ? startedRecordCount / n : 0,
      skippedRate: n ? skippedRecordCount / n : 0,
      generatedRate: startedRecordCount ? generatedRecordCount / startedRecordCount : 0,
      avgObservedBudgetMs: observedDurations.length ? observedDurations.reduce((a, b) => a + b, 0) / observedDurations.length : 0,
    };
  });
}
