// --- PrimitiveInteractionAnalysis (Production Integration Finalization
// Sprint v1, STEP4) ----------------------------------------------------------
// CCR<->REPAIR, ENDGAME<->Recovery, Incremental Recovery<->ENDGAME
// interactions -- co-occurrence, dominance/starvation, duplicate
// opportunities, and budget conflict, all derived from the same real
// EndToEndSolveResult population used in STEP2/3.
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";
import type { PrimitiveAttributionSummary } from "./PrimitiveAttribution";

export interface CCRRepairInteraction {
  bothOfferedCount: number; // events where BOTH CCR and REPAIR had a viable candidate
  ccrWonWhenBothOffered: number;
  repairWonWhenBothOffered: number;
  neitherWonWhenBothOffered: number; // DISRUPT/SETUP won instead
  // "Starvation" here means never WINNING chooseBestRecovery despite being
  // offered -- NOT "never generated" (that specific failure mode was
  // already fixed by Integration Validation Sprint v1's "reservedBudget"
  // scheduling default, confirmed still active this Sprint).
  ccrChosenRateWhenOffered: number;
  repairChosenRateWhenOffered: number;
}

export interface EndgameRecoveryInteraction {
  recoveryTriggerRateBaseline: number;
  recoveryTriggerRateIntegrated: number;
  recoveryTriggerRateDelta: number; // Integrated - Baseline
  recoverySuccessRateBaseline: number; // of triggered events, how many succeeded
  recoverySuccessRateIntegrated: number;
}

export interface IncrementalRecoveryEndgameInteraction {
  // Does PAIR-task completion rate correlate with ENDGAME even being
  // reached (planned)? PAIR's own budget (140ms, UNCHANGED by this Sprint)
  // is not itself an A/B variable here -- this measures whether the
  // already-integrated 140ms PAIR Contract leaves ENDGAME reachable at a
  // stable rate under the NEW 250ms ENDGAME reserve.
  avgPairCompletionRate: number;
  endgamePlannedRate: number; // fraction of solves where ENDGAME was ever queued
  endgameCompletedGivenPlannedRate: number; // of those, fraction where ENDGAME task itself produced a fix (recovery or not)
}

export interface BudgetConflictSummary {
  recoveryTriggeredAndDeadlineMissedCount: number; // recovery ran but the whole solve still exceeded its 1s budget
  recoveryTriggeredCount: number;
  budgetConflictRate: number;
}

export interface PrimitiveInteractionResult {
  ccrRepair: CCRRepairInteraction;
  endgameRecovery: EndgameRecoveryInteraction;
  incrementalRecoveryEndgame: IncrementalRecoveryEndgameInteraction;
  budgetConflict: BudgetConflictSummary;
}

export function analyzeCCRRepairInteraction(results: readonly EndToEndSolveResult[]): CCRRepairInteraction {
  let bothOfferedCount = 0;
  let ccrWon = 0;
  let repairWon = 0;
  let neitherWon = 0;
  let ccrOffered = 0;
  let repairOffered = 0;
  let ccrChosen = 0;
  let repairChosen = 0;
  for (const r of results) {
    const outcome = r.recoveryOutcome;
    if (!outcome) continue;
    const hasCCR = outcome.candidatesOffered.includes("CCR");
    const hasRepair = outcome.candidatesOffered.includes("REPAIR");
    if (hasCCR) ccrOffered++;
    if (hasRepair) repairOffered++;
    if (outcome.chosenType === "CCR") ccrChosen++;
    if (outcome.chosenType === "REPAIR") repairChosen++;
    if (hasCCR && hasRepair) {
      bothOfferedCount++;
      if (outcome.chosenType === "CCR") ccrWon++;
      else if (outcome.chosenType === "REPAIR") repairWon++;
      else neitherWon++;
    }
  }
  return {
    bothOfferedCount,
    ccrWonWhenBothOffered: ccrWon,
    repairWonWhenBothOffered: repairWon,
    neitherWonWhenBothOffered: neitherWon,
    ccrChosenRateWhenOffered: ccrOffered ? ccrChosen / ccrOffered : 0,
    repairChosenRateWhenOffered: repairOffered ? repairChosen / repairOffered : 0,
  };
}

export function analyzeEndgameRecoveryInteraction(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): EndgameRecoveryInteraction {
  const triggerRate = (rs: readonly EndToEndSolveResult[]) => (rs.length ? rs.filter((r) => r.recoveryTriggered).length / rs.length : 0);
  const successRate = (rs: readonly EndToEndSolveResult[]) => {
    const triggered = rs.filter((r) => r.recoveryTriggered);
    return triggered.length ? triggered.filter((r) => r.recoveryOutcome?.succeeded).length / triggered.length : 0;
  };
  const recoveryTriggerRateBaseline = triggerRate(baseline);
  const recoveryTriggerRateIntegrated = triggerRate(integrated);
  return {
    recoveryTriggerRateBaseline,
    recoveryTriggerRateIntegrated,
    recoveryTriggerRateDelta: recoveryTriggerRateIntegrated - recoveryTriggerRateBaseline,
    recoverySuccessRateBaseline: successRate(baseline),
    recoverySuccessRateIntegrated: successRate(integrated),
  };
}

export function analyzeIncrementalRecoveryEndgameInteraction(
  results: readonly EndToEndSolveResult[],
  taskAttribution: PrimitiveAttributionSummary
): IncrementalRecoveryEndgameInteraction {
  const n = results.length;
  const pairStats = taskAttribution.taskStats.find((s) => s.taskType === "PAIR")!;
  const endgamePlannedRate = n ? results.filter((r) => r.plannedTaskTypes.includes("ENDGAME")).length / n : 0;
  const endgamePlannedCount = results.filter((r) => r.plannedTaskTypes.includes("ENDGAME")).length;
  const endgameCompletedGivenPlanned = results.filter((r) => r.plannedTaskTypes.includes("ENDGAME") && r.completedTaskTypes.includes("ENDGAME")).length;
  return {
    avgPairCompletionRate: pairStats.successRate,
    endgamePlannedRate,
    endgameCompletedGivenPlannedRate: endgamePlannedCount ? endgameCompletedGivenPlanned / endgamePlannedCount : 0,
  };
}

export function analyzeBudgetConflict(results: readonly EndToEndSolveResult[]): BudgetConflictSummary {
  const triggered = results.filter((r) => r.recoveryTriggered);
  const conflict = triggered.filter((r) => r.deadlineMissed).length;
  return {
    recoveryTriggeredAndDeadlineMissedCount: conflict,
    recoveryTriggeredCount: triggered.length,
    budgetConflictRate: triggered.length ? conflict / triggered.length : 0,
  };
}
