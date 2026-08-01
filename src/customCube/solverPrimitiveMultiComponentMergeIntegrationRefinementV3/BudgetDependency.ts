// --- BudgetDependency (Multi-Component Merge Production Integration
// Refinement Sprint v3, STEP4) -----------------------------------------------
// Decomposes the shared 2000ms outer deadline into where it actually went,
// derived directly from STEP1's own CompetitionTimeline (no separate
// measurement pass -- the timeline already has every segment's start/finish,
// so this is pure arithmetic over already-real data).
import type { CaseCompetitionTimeline } from "./CompetitionTimeline";

export interface BudgetDependencyRow {
  label: string;
  outerDeadlineMs: number;
  consumedByType: Record<string, number>; // sum of ownRuntimeMs per RecoveryType, for segments that ran BEFORE MCM's own start (or all segments if MCM never started)
  consumedBeforeMcmMs: number; // sum of consumedByType
  mcmAvailableMs: number; // MCM's own remainingTimeAtStartMs -- what it was actually given, capped by Math.min(deadline, ...)
  mcmOwnRuntimeMs: number | null; // MCM's own ownRuntimeMs -- how much of its available budget it actually used
  unusedAfterMcmMs: number | null; // outerDeadlineMs - MCM's own finishMs -- time left over after MCM's own generation step that no candidate consumed (may still be spent by PARITY_GATED_CYCLE/MIXED_COMMUTATOR which run after)
  mcmRan: boolean;
}

export function buildBudgetDependency(timeline: CaseCompetitionTimeline): BudgetDependencyRow {
  const mcm = timeline.mcmSegment;
  const priorSegments = mcm ? timeline.segments.filter((s) => s.startMs < mcm.startMs) : timeline.segments.filter((s) => s.type !== "MULTI_COMPONENT_MERGE");

  const consumedByType: Record<string, number> = {};
  for (const s of priorSegments) {
    consumedByType[s.type] = (consumedByType[s.type] ?? 0) + (s.ownRuntimeMs ?? 0);
  }
  const consumedBeforeMcmMs = Object.values(consumedByType).reduce((a, b) => a + b, 0);

  return {
    label: timeline.label,
    outerDeadlineMs: timeline.outerDeadlineMs,
    consumedByType,
    consumedBeforeMcmMs,
    mcmAvailableMs: mcm?.remainingTimeAtStartMs ?? timeline.outerDeadlineMs,
    mcmOwnRuntimeMs: mcm?.ownRuntimeMs ?? null,
    unusedAfterMcmMs: mcm?.finishMs != null ? timeline.outerDeadlineMs - mcm.finishMs : null,
    mcmRan: mcm !== null,
  };
}

export function buildBudgetDependencyPopulation(timelines: readonly CaseCompetitionTimeline[]): BudgetDependencyRow[] {
  return timelines.map(buildBudgetDependency);
}
