// --- MetricSensitivityAudit (Multi-Component Merge Validation Methodology
// Qualification Sprint v1, STEP4) --------------------------------------------
// Checks whether the KPIs this whole arc's own Validation Framework relies
// on (improvedCount primary, solvedCount/wrongWingReduction/recoverySuccess
// secondary) actually move at the SAME budget threshold as the ground-truth
// mechanism (MCM being offered AND given enough effective budget) -- or
// whether they only register the effect discretely, at the same instant it
// happens, providing no earlier warning. Framework itself (ReleaseGates.ts/
// KpiDefinitions.ts) is NOT modified this Sprint -- this only PROPOSES a
// new KPI candidate for a FUTURE Sprint's own consideration.
import type { AttemptRecoverySweepRow, SolveSweepRow } from "./SensitivityAnalysis";

export interface KpiSweepPoint {
  configLabel: string; // e.g. "outer=1000ms" or "recoveryReserveMsOverride=250ms"
  improvedCount: number;
  solvedCount: number;
  wrongWingReductionTotal: number;
  recoverySuccessCount: number; // chosenType===MULTI_COMPONENT_MERGE AND improved
}

export interface MetricSensitivityReport {
  attemptRecoveryAxis: KpiSweepPoint[];
  solveAxis: KpiSweepPoint[];
  allMetricsMoveTogether: boolean; // true if no KPI reveals an earlier/different threshold than improvedCount on either axis
  proposedNewKpi: {
    name: string;
    definition: string;
    rationale: string;
  };
}

function summarizeAttemptRecoveryByConfig(rows: readonly AttemptRecoverySweepRow[]): KpiSweepPoint[] {
  const byOuter = new Map<number, AttemptRecoverySweepRow[]>();
  for (const r of rows) {
    if (!byOuter.has(r.outerDeadlineMs)) byOuter.set(r.outerDeadlineMs, []);
    byOuter.get(r.outerDeadlineMs)!.push(r);
  }
  return [...byOuter.entries()]
    .sort(([a], [b]) => a - b)
    .map(([outerDeadlineMs, group]) => ({
      configLabel: `outer=${outerDeadlineMs}ms`,
      improvedCount: group.filter((r) => r.result.improved).length,
      solvedCount: group.filter((r) => r.result.wrongWingAfter === 0).length,
      wrongWingReductionTotal: group.reduce((sum, r) => sum + (r.result.wrongWingBefore - r.result.wrongWingAfter), 0),
      recoverySuccessCount: group.filter((r) => r.result.chosenType === "MULTI_COMPONENT_MERGE" && r.result.improved).length,
    }));
}

function summarizeSolveByConfig(rows: readonly SolveSweepRow[]): KpiSweepPoint[] {
  const byReserve = new Map<number, SolveSweepRow[]>();
  for (const r of rows) {
    if (!byReserve.has(r.recoveryReserveMsOverride)) byReserve.set(r.recoveryReserveMsOverride, []);
    byReserve.get(r.recoveryReserveMsOverride)!.push(r);
  }
  return [...byReserve.entries()]
    .sort(([a], [b]) => a - b)
    .map(([recoveryReserveMsOverride, group]) => ({
      configLabel: `recoveryReserveMsOverride=${recoveryReserveMsOverride}ms`,
      improvedCount: group.filter((r) => r.result.improved).length,
      solvedCount: group.filter((r) => r.result.solved).length,
      wrongWingReductionTotal: group.reduce((sum, r) => sum + (r.result.wrongWingBefore - r.result.wrongWingAfter), 0),
      recoverySuccessCount: group.filter((r) => r.result.chosenType === "MULTI_COMPONENT_MERGE" && r.result.improved).length,
    }));
}

export function auditMetricSensitivity(attemptRecoverySweep: readonly AttemptRecoverySweepRow[], solveSweep: readonly SolveSweepRow[]): MetricSensitivityReport {
  const attemptRecoveryAxis = summarizeAttemptRecoveryByConfig(attemptRecoverySweep);
  const solveAxis = summarizeSolveByConfig(solveSweep);

  // "moves together" means improvedCount and recoverySuccessCount hit their
  // eventual max at the SAME config point on both axes -- if
  // recoverySuccessCount (or wrongWingReductionTotal) ever turns positive
  // at an EARLIER/smaller budget than improvedCount does, that KPI is more
  // sensitive and worth adopting.
  const firstNonZeroIndex = (points: readonly KpiSweepPoint[], pick: (p: KpiSweepPoint) => number) => points.findIndex((p) => pick(p) > 0);
  const check = (points: readonly KpiSweepPoint[]) => {
    const improvedIdx = firstNonZeroIndex(points, (p) => p.improvedCount);
    const recoverySuccessIdx = firstNonZeroIndex(points, (p) => p.recoverySuccessCount);
    const wrongWingIdx = firstNonZeroIndex(points, (p) => p.wrongWingReductionTotal);
    return improvedIdx === recoverySuccessIdx && improvedIdx === wrongWingIdx;
  };
  const allMetricsMoveTogether = check(attemptRecoveryAxis) && check(solveAxis);

  return {
    attemptRecoveryAxis,
    solveAxis,
    allMetricsMoveTogether,
    proposedNewKpi: {
      name: "Recovered Improvement Before Deadline (RIBD)",
      definition: "Per-case boolean: MCM was OFFERED as a candidate (regardless of whether it was ultimately CHOSEN) AND its own remainingTimeAtStart (from the real onEvent/trace timeline) was >= the runtime it actually needed to reach a net-improving result in the Comparative Prototype's own isolated measurement. Aggregated as a rate across the population.",
      rationale: "improvedCount/solvedCount/wrongWingReduction/recoverySuccess are all OUTCOME metrics -- they only register a signal at the exact instant the effect crosses into success, giving no visibility into cases that were CLOSE (e.g. MCM offered, chosen, and net-improving, but discarded by an unrelated Integration-layer gap like the short-circuit omission this whole arc's own Sprints found) vs cases where MCM was never even in contention. RIBD would separate 'the Primitive had a fair shot and still failed' from 'the Primitive never had a fair shot' -- exactly the ambiguity this Sprint's own STEP2/STEP3 had to resolve by hand via BudgetEnvelopeAnalysis/SensitivityAnalysis. This is a PROPOSAL only -- the Validation Framework itself (ReleaseGates.ts/KpiDefinitions.ts) is not modified this Sprint.",
    },
  };
}
