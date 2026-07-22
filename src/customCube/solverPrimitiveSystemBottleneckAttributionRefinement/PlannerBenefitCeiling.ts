// --- PlannerBenefitCeiling (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP5) -----------------------------------------------
// Aggregates CounterfactualPlannerSimulation.ts's (STEP3) per-snapshot
// results across the full PlannerSkipped population into the Maximum
// Recoverable Capability figure: how much improvement is achievable purely
// by ensuring every PlannerSkipped snapshot actually reaches ENDGAME (no
// change to ENDGAME's own time budget once reached -- isolates the
// "routing" question from the "more time" question STEP4 already answers).
import type { PlannerCounterfactualRecord } from "./CounterfactualPlannerSimulation";

export interface PlannerBenefitSummary {
  n: number;
  avgImprovement: number;
  totalImprovement: number;
  solvedRate: number;
  avgRuntimeMs: number;
}

export function summarizePlannerBenefit(records: readonly PlannerCounterfactualRecord[]): PlannerBenefitSummary {
  const n = records.length;
  return {
    n,
    avgImprovement: n ? records.reduce((a, r) => a + r.improvement, 0) / n : 0,
    totalImprovement: records.reduce((a, r) => a + r.improvement, 0),
    solvedRate: n ? records.filter((r) => r.solved).length / n : 0,
    avgRuntimeMs: n ? records.reduce((a, r) => a + r.runtimeMs, 0) / n : 0,
  };
}
