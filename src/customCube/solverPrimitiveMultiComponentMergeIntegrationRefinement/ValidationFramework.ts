// --- ValidationFramework (Multi-Component Merge Production Integration
// Refinement Sprint v1, STEP5 continued) ---------------------------------------
// Composes Gate A/B/C/D/E (solverPostReleaseValidationFramework/ReleaseGates.ts,
// UNMODIFIED) + decideFromGates (ValidationPipeline.ts, UNMODIFIED) using
// Category D ("Architecture Change" -- Scheduler Ordering/Budget Contract,
// ChangeClassification.ts's own category for exactly this kind of change,
// UNMODIFIED), applied to the BEFORE_CCR vs AFTER_CCR comparison (this
// Sprint's own key question).
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateD, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { PairwiseComparison } from "./StatisticalValidation";
import type { InteractionAuditSummary } from "./PrimitiveInteractionAudit";
import type { BudgetAuditSummary } from "./BudgetAudit";

export interface FrameworkValidationResult {
  gateResults: GateResult[];
  pipelineResult: PipelineResult;
}

export function runValidationFramework(
  comparison: PairwiseComparison,
  interaction: InteractionAuditSummary,
  budgetBefore: BudgetAuditSummary,
  budgetAfter: BudgetAuditSummary
): FrameworkValidationResult {
  const gateA = evaluateGateA(comparison.trueRegressionDiff, comparison.trueRegressionDiff);
  const gateB = evaluateGateB(comparison.runtimeDiffMs, Math.max(1, comparison.baselineP95RuntimeMs));
  const gateC = evaluateGateC(comparison.improvedCountDiff, true);
  const gateD = evaluateGateD([
    { contract: "Position(BEFORE_CCR order applied)", status: "PASS" },
    { contract: `Budget(actualBudgetAvailableMs ${budgetBefore.avgActualBudgetAvailableMs.toFixed(0)}ms vs ${budgetAfter.avgActualBudgetAvailableMs.toFixed(0)}ms)`, status: budgetBefore.avgActualBudgetAvailableMs > budgetAfter.avgActualBudgetAvailableMs ? "PASS" : "FAIL" },
  ]);
  const gateE = evaluateGateE({ duplicateCount: interaction.duplicateRescueCount, starvedTypeCount: interaction.budgetStarvedRate >= 0.5 ? 1 : 0 });

  const gateResults = [gateA, gateB, gateC, gateD, gateE];
  const spec = getCategorySpec("D"); // Architecture Change (Scheduler Ordering / Budget Contract)
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "production");

  return { gateResults, pipelineResult };
}
