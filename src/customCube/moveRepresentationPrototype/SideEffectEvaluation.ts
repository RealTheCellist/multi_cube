// --- SideEffectEvaluation (Move Representation Prototype Sprint v1,
// Deliverable #3) ------------------------------------------------------------
import type { CaseResult } from "./CapabilityEvaluation";

export interface SideEffectSummary {
  n: number; // solved cases only
  avgAffectedWingCount: number;
  avgCycleLength: number;
  avgFootprintRatio: number; // affectedWingCount / cycleLength -- Blueprint's target is ~1.0
  blueprintTargetAchievedCount: number; // cases where footprintRatio <= 2.0 (disclosed, generous bar: "approximately cycleLength")
  blueprintTargetAchievedRate: number;
}

const FOOTPRINT_RATIO_TARGET = 2.0; // generous bar for "approximately cycleLength" -- disclosed, not tuned post-hoc

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeSideEffect(cases: CaseResult[]): SideEffectSummary {
  const solved = cases.filter((c) => !!c.result.moves && c.result.affectedWingCount !== null && c.result.cycleLength !== null);
  const ratios = solved.map((c) => c.result.affectedWingCount! / c.result.cycleLength!);
  return {
    n: solved.length,
    avgAffectedWingCount: avg(solved.map((c) => c.result.affectedWingCount!)),
    avgCycleLength: avg(solved.map((c) => c.result.cycleLength!)),
    avgFootprintRatio: avg(ratios),
    blueprintTargetAchievedCount: ratios.filter((r) => r <= FOOTPRINT_RATIO_TARGET).length,
    blueprintTargetAchievedRate: ratios.length ? ratios.filter((r) => r <= FOOTPRINT_RATIO_TARGET).length / ratios.length : 0,
  };
}
