// --- UnionCapabilityAnalysis (Solver Primitive Set Completeness Validation
// Sprint v1, Required Analysis #2) -------------------------------------------
// Stepwise coverage as each primitive is added, in production pipeline
// order: BASE -> +FLIP -> +CASE -> +PARITY -> +CCR.
import { PRIMITIVE_ORDER, type PrimitiveCoverageRow } from "./PrimitiveCoverageMatrix";

export interface UnionStep {
  step: string; // "BASE", "BASE+FLIP", "BASE+FLIP+CASE", ...
  cumulativeCoveredCount: number;
  cumulativeCoverageRate: number;
  incrementalGain: number; // newly covered cases this step adds over the previous step
}

export function buildUnionCapabilitySteps(rows: PrimitiveCoverageRow[]): UnionStep[] {
  const steps: UnionStep[] = [];
  const coveredSoFar = new Set<string>();
  let stepLabel = "";
  for (const primitive of PRIMITIVE_ORDER) {
    stepLabel = stepLabel ? `${stepLabel}+${primitive}` : primitive;
    const before = coveredSoFar.size;
    for (const row of rows) {
      if (row.succeededBy[primitive]) coveredSoFar.add(row.label);
    }
    const cumulativeCoveredCount = coveredSoFar.size;
    steps.push({
      step: stepLabel,
      cumulativeCoveredCount,
      cumulativeCoverageRate: rows.length ? cumulativeCoveredCount / rows.length : 0,
      incrementalGain: cumulativeCoveredCount - before,
    });
  }
  return steps;
}
