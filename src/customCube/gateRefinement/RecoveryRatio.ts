// --- RecoveryRatio (Gate Refinement Sprint v1, Section 6 "Opportunity")
// -----------------------------------------------------------------------
// Recovery Ratio = Improved / PotentiallySolvable. Reuses
// mixedCommutatorOpportunityAnalysis/ShadowEvaluation.ts UNMODIFIED (same
// Sprint's own established, deterministic Gate-bypassed measurement) rather
// than re-deriving "Potentially Solvable" from scratch.
import type { GateSummaryRow } from "./GateComparisonSummary";

export interface RecoveryRatioRow {
  gateId: GateSummaryRow["gateId"];
  improvedCaseRepeats: number;
  potentiallySolvableCases: number;
  recoveryRatio: number; // improvedCaseRepeats normalized as a per-case-repeat rate would double count; see report note
}

export function computeRecoveryRatio(gateSummary: GateSummaryRow, potentiallySolvableCases: number): RecoveryRatioRow {
  return {
    gateId: gateSummary.gateId,
    improvedCaseRepeats: gateSummary.improvedByMixedCount,
    potentiallySolvableCases,
    recoveryRatio: potentiallySolvableCases > 0 ? gateSummary.improvedByMixedCount / potentiallySolvableCases : 0,
  };
}
