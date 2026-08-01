// --- PrimitiveInteraction (Multi-Component Merge Production Integration
// Sprint v1, STEP4) -----------------------------------------------------------
// Derives Overlap / Duplicate Rescue / Replacement / Starvation directly
// from STEP2's real ContractAudit rows and STEP3's real CapabilityValidation
// rows (both from real attemptRecovery()/generateRecoveryStrategies()
// traces, joined by label) -- no new Replay run here, per this Sprint's
// own "실제 solve()/attemptRecovery() Replay" principle already satisfied
// by STEP2/STEP3.
import type { ContractAuditRow } from "./ContractAudit";
import type { CapabilityValidationRow } from "./CapabilityValidation";

export interface InteractionSummary {
  gateMatchedCount: number;
  overlapCount: number; // gate-matched cases where CCR/REPAIR/PARITY_GATED_CYCLE was ALSO offered alongside MULTI_COMPONENT_MERGE
  overlapRate: number;
  duplicateRescueCount: number;
  duplicateRescueBaselineChosenBreakdown: Record<string, number>; // which type solved it in Baseline, for duplicate cases
  replacementCount: number; // MCM won chooseBestRecovery()'s argmax over an existing candidate that was ALSO offered in Baseline
  starvationCount: number;
  starvationRate: number;
  avgActualBudgetAvailableMs: number;
}

export function analyzePrimitiveInteraction(auditRows: readonly ContractAuditRow[], validationRows: readonly CapabilityValidationRow[]): InteractionSummary {
  const validationByLabel = new Map(validationRows.map((r) => [r.label, r]));
  const gateMatched = auditRows.filter((r) => r.gateMatched);

  let overlapCount = 0;
  let replacementCount = 0;
  const duplicateRescueBaselineChosenBreakdown: Record<string, number> = {};

  for (const audit of gateMatched) {
    const v = validationByLabel.get(audit.label);
    if (!v) continue;
    const othersOffered = v.integrated.candidatesOffered.filter((t) => t === "CCR" || t === "REPAIR" || t === "PARITY_GATED_CYCLE");
    if (othersOffered.length > 0) overlapCount++;

    if (v.integrated.chosenType === "MULTI_COMPONENT_MERGE" && v.baseline.chosenType !== "MULTI_COMPONENT_MERGE" && v.baseline.chosenType !== "none") {
      replacementCount++;
    }

    if (v.duplicate) {
      const key = v.baseline.chosenType;
      duplicateRescueBaselineChosenBreakdown[key] = (duplicateRescueBaselineChosenBreakdown[key] ?? 0) + 1;
    }
  }

  const duplicateRescueCount = validationRows.filter((r) => r.duplicate).length;
  const withBudget = gateMatched.filter((r) => r.actualBudgetAvailableMs !== null);
  const starved = withBudget.filter((r) => (r.actualBudgetAvailableMs ?? 0) < 2000);
  const avgActualBudgetAvailableMs = withBudget.length ? withBudget.reduce((s, r) => s + (r.actualBudgetAvailableMs ?? 0), 0) / withBudget.length : 0;

  return {
    gateMatchedCount: gateMatched.length,
    overlapCount,
    overlapRate: gateMatched.length ? overlapCount / gateMatched.length : 0,
    duplicateRescueCount,
    duplicateRescueBaselineChosenBreakdown,
    replacementCount,
    starvationCount: starved.length,
    starvationRate: withBudget.length ? starved.length / withBudget.length : 0,
    avgActualBudgetAvailableMs,
  };
}
