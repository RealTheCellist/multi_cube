// --- PrimitiveInteractionAudit (Multi-Component Merge Production
// Validation Sprint v1, STEP4) -----------------------------------------------
// How MULTI_COMPONENT_MERGE interacts with the Directive's own named 5
// Primitives (REPAIR/CCR/MIXED_COMMUTATOR/PARITY_GATED_CYCLE/SETUP) across
// the real 142-case population, using the Integrated (current production)
// and Baseline (pre-Short-Circuit-fix) EndToEndSolveResult arms already
// captured by STEP2.
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";
import type { RecoveryType } from "../fiveByFiveEdgeSolverTypes";

const NAMED_TYPES: RecoveryType[] = ["REPAIR", "CCR", "MIXED_COMMUTATOR", "PARITY_GATED_CYCLE", "SETUP"];

export interface PrimitiveInteractionRow {
  type: RecoveryType;
  competitionCount: number; // co-offered alongside MULTI_COMPONENT_MERGE (Integrated arm)
  starvedByMcmCount: number; // co-offered, but MCM was chosen instead of this type
  duplicateWithMcmCount: number; // Integrated chose+succeeded via MCM on a case where Baseline ALSO succeeded via this type
  replacedByMcmCount: number; // Baseline chose+succeeded via this type, Integrated chose MCM instead on the SAME case
}

export interface PrimitiveInteractionSummary {
  n: number;
  rows: PrimitiveInteractionRow[];
  totalDuplicateCount: number; // Gate E input
  totalStarvedTypeCount: number; // count of named types with starvedByMcmCount > 0 -- Gate E input
}

export function buildPrimitiveInteractionMatrix(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): PrimitiveInteractionSummary {
  const baselineByHash = new Map(baseline.map((r) => [r.hash, r]));

  const rows: PrimitiveInteractionRow[] = NAMED_TYPES.map((type) => {
    let competitionCount = 0;
    let starvedByMcmCount = 0;
    let duplicateWithMcmCount = 0;
    let replacedByMcmCount = 0;

    for (const intRow of integrated) {
      const baseRow = baselineByHash.get(intRow.hash);
      const intOffered = intRow.recoveryOutcome?.candidatesOffered ?? [];
      const intChosen = intRow.recoveryOutcome?.chosenType ?? null;
      const intSucceeded = intRow.recoveryOutcome?.succeeded ?? false;

      if (intOffered.includes(type) && intOffered.includes("MULTI_COMPONENT_MERGE")) {
        competitionCount++;
        if (intChosen === "MULTI_COMPONENT_MERGE") starvedByMcmCount++;
      }

      if (intChosen === "MULTI_COMPONENT_MERGE" && intSucceeded && baseRow) {
        const baseChosen = baseRow.recoveryOutcome?.chosenType ?? null;
        const baseSucceeded = baseRow.recoveryOutcome?.succeeded ?? false;
        if (baseChosen === type && baseSucceeded) duplicateWithMcmCount++;
        if (baseChosen === type && baseSucceeded && baseChosen !== "MULTI_COMPONENT_MERGE") replacedByMcmCount++;
      }
    }

    return { type, competitionCount, starvedByMcmCount, duplicateWithMcmCount, replacedByMcmCount };
  });

  return {
    n: integrated.length,
    rows,
    totalDuplicateCount: rows.reduce((sum, r) => sum + r.duplicateWithMcmCount, 0),
    totalStarvedTypeCount: rows.filter((r) => r.starvedByMcmCount > 0).length,
  };
}
