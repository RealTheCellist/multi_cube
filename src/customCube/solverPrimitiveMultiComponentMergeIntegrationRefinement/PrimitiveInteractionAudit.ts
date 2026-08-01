// --- PrimitiveInteractionAudit (Multi-Component Merge Production
// Integration Refinement Sprint v1, STEP4) -------------------------------------
// Quantifies CCR/MCM interaction under both orderings using STEP1's real
// BudgetAuditRow[] (Budget data) and STEP2/3's real CapabilityReplayRow[]
// (Capability data), joined by label -- confirming whether Budget
// competition (not Scheduler Ordering in the chooseBestRecovery() argmax
// sense) is the real cause, per this Sprint's own verification principle.
import type { BudgetAuditRow } from "./BudgetAudit";
import type { CapabilityReplayRow } from "./CapabilityReplay";

export interface InteractionAuditSummary {
  order: "AFTER_CCR" | "BEFORE_CCR";
  gateMatchedCount: number;
  overlapCount: number; // gate-matched cases where CCR was ALSO offered
  overlapRate: number;
  duplicateRescueCount: number; // both baseline-equivalent AND MCM improved the same case (MCM redundant)
  replacementCount: number; // MCM won chooseBestRecovery() over an existing candidate that was ALSO offered
  avgActualBudgetAvailableMs: number;
  budgetStarvedRate: number;
}

export function analyzeInteraction(
  order: "AFTER_CCR" | "BEFORE_CCR",
  auditRows: readonly BudgetAuditRow[],
  replayRows: readonly CapabilityReplayRow[]
): InteractionAuditSummary {
  const replayByLabel = new Map(replayRows.map((r) => [r.label, r]));
  const gateMatched = auditRows.filter((r) => r.mcmPhase !== "skipped" && r.mcmPhase !== "never_started");

  let overlapCount = 0;
  let duplicateRescueCount = 0;
  let replacementCount = 0;
  for (const audit of gateMatched) {
    const replay = replayByLabel.get(audit.label);
    if (!replay) continue;
    const arm = order === "BEFORE_CCR" ? replay.beforeCcr : replay.afterCcr;
    if (arm.candidatesOffered.includes("CCR")) overlapCount++;
    if (arm.improved && replay.baseline.improved) duplicateRescueCount++;
    if (arm.chosenType === "MULTI_COMPONENT_MERGE" && arm.candidatesOffered.includes("CCR")) replacementCount++;
  }

  const withBudget = gateMatched.filter((r) => r.actualBudgetAvailableMs !== null);
  const starved = withBudget.filter((r) => r.starved);

  return {
    order,
    gateMatchedCount: gateMatched.length,
    overlapCount,
    overlapRate: gateMatched.length ? overlapCount / gateMatched.length : 0,
    duplicateRescueCount,
    replacementCount,
    avgActualBudgetAvailableMs: withBudget.length ? withBudget.reduce((s, r) => s + (r.actualBudgetAvailableMs ?? 0), 0) / withBudget.length : 0,
    budgetStarvedRate: withBudget.length ? starved.length / withBudget.length : 0,
  };
}
