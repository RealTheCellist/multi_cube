// --- RecoveryTimelineCollector (Parity-Gated Cycle Integration
// Architecture Analysis Sprint v1, STEP1) ------------------------------------
// Calls the REAL, unmodified generateRecoveryStrategies()/
// chooseBestRecovery() (fiveByFiveEdgeRecovery.ts, read-only usage) with
// its own onEvent instrumentation hook (SchedulingEvent, already exported
// for exactly this purpose) to record a full timeline for every candidate
// type in one real call -- generalizes
// parityGatedCycleIntegrationPlanningV1/RecoveryAnalysis.ts's own
// per-type phase counting to also capture wall-clock timing
// (startTime/finishTime/ownRuntime/remainingTimeBefore/After) needed to
// diagnose Budget Starvation specifically.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const ALL_RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE"];
const OUTER_DEADLINE_MS = 1000; // PLAN_TIME_BUDGET_MS, fiveByFiveEdgeSolverEngine.ts's own whole-plan budget

export interface CandidateTimelineEntry {
  type: RecoveryType;
  offered: boolean; // produced a non-null candidate (appears in generateRecoveryStrategies' own return array)
  chosen: boolean; // chooseBestRecovery's own argmax pick
  startMs: number | null; // relative to the call's own t=0
  finishMs: number | null;
  ownRuntimeMs: number | null; // finishMs - startMs
  remainingTimeBeforeMs: number | null; // OUTER_DEADLINE_MS - startMs
  remainingTimeAfterMs: number | null; // OUTER_DEADLINE_MS - finishMs
  phase: SchedulingEvent["phase"] | "never_started";
}

export interface CaseTimeline {
  label: string;
  entries: Record<RecoveryType, CandidateTimelineEntry>;
  totalCallRuntimeMs: number;
}

export function collectTimelineForCase(cubies: Cubie[], label: string, libs: ExecutorLibraries): CaseTimeline {
  const startMsByType: Partial<Record<RecoveryType, number>> = {};
  const phaseByType: Partial<Record<RecoveryType, SchedulingEvent["phase"]>> = {};
  const finishMsByType: Partial<Record<RecoveryType, number>> = {};

  const onEvent = (e: SchedulingEvent) => {
    if (e.phase === "start") {
      startMsByType[e.candidateType] = e.atMs;
      return;
    }
    phaseByType[e.candidateType] = e.phase;
    finishMsByType[e.candidateType] = e.atMs;
  };

  const t0 = Date.now();
  const deadline = t0 + OUTER_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent);
  const totalCallRuntimeMs = Date.now() - t0;
  const best = chooseBestRecovery(candidates);
  const offeredTypes = new Set(candidates.map((c) => c.type));

  const entries: Record<RecoveryType, CandidateTimelineEntry> = {} as Record<RecoveryType, CandidateTimelineEntry>;
  for (const type of ALL_RECOVERY_TYPES) {
    const startAbs = startMsByType[type];
    const finishAbs = finishMsByType[type];
    const startMs = startAbs !== undefined ? startAbs - t0 : null;
    const finishMs = finishAbs !== undefined ? finishAbs - t0 : null;
    entries[type] = {
      type,
      offered: offeredTypes.has(type),
      chosen: best?.type === type,
      startMs,
      finishMs,
      ownRuntimeMs: startMs !== null && finishMs !== null ? finishMs - startMs : null,
      remainingTimeBeforeMs: startMs !== null ? OUTER_DEADLINE_MS - startMs : null,
      remainingTimeAfterMs: finishMs !== null ? OUTER_DEADLINE_MS - finishMs : null,
      phase: phaseByType[type] ?? "never_started",
    };
  }

  return { label, entries, totalCallRuntimeMs };
}

export function collectTimelines(holes: readonly HoleCase[], libs: ExecutorLibraries): CaseTimeline[] {
  return holes.map((h) => collectTimelineForCase(h.cubies, h.label, libs));
}
