// --- OperatingContract (Incremental Recovery Architecture Prototype
// Refinement Sprint v1, STEP6) -----------------------------------------------
// Synthesizes STEP1-5's real measurements into a final Budget Contract
// recommendation (Fixed / Adaptive / Remaining Time / Hybrid) and this
// Sprint's own Level1-3 judgment + Decision A/B/C.
import type { BudgetSweepSummary } from "./BudgetSweep";
import type { CapabilityRecoveryPoint } from "./CapabilityRecovery";
import type { ParetoAnalysis } from "./ParetoFrontier";
import type { BudgetValidationResult } from "./StatisticalValidation";

export type OperatingContractType = "fixed" | "adaptive" | "remainingTime" | "hybrid";

export interface OperatingContractResult {
  recommendedContract: OperatingContractType;
  recommendedBudgetMs: number | null; // null for remainingTime/adaptive, which don't have one fixed number
  rationale: string;
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

const MIN_MEANINGFUL_RECOVERY_PP = 5; // "유의미하게 회복" threshold: at least 5 percentage points of success-rate recovery vs the 40ms baseline
const MIN_COMPLIANCE_FLOOR = 0.90; // Budget Compliance must stay >= 90% for a candidate to be considered "compliance maintained"

export function decideOperatingContract(
  sweepSummaries: readonly BudgetSweepSummary[],
  capabilityRecovery: readonly CapabilityRecoveryPoint[],
  paretoAnalysis: ParetoAnalysis,
  validation: readonly BudgetValidationResult[]
): OperatingContractResult {
  const level1Pass = sweepSummaries.length > 0 && sweepSummaries.every((s) => s.n > 0);
  const level1Detail = `Budget Sweep completed across ${sweepSummaries.length} budgets (${sweepSummaries.map((s) => s.budgetMs).join(", ")}ms), each measured on the full real case population.`;

  const meaningfulRecovery = capabilityRecovery.filter((c) => c.recoveryVs40msPp >= MIN_MEANINGFUL_RECOVERY_PP);
  const compliantMeaningfulRecovery = meaningfulRecovery.filter((c) => {
    const summary = sweepSummaries.find((s) => s.budgetMs === c.budgetMs);
    return summary && 1 - summary.overrunRate >= MIN_COMPLIANCE_FLOOR;
  });
  const level2Pass = compliantMeaningfulRecovery.length > 0;
  const level2Detail = `${meaningfulRecovery.length}/${capabilityRecovery.length} budgets recover >= ${MIN_MEANINGFUL_RECOVERY_PP}pp vs the 40ms baseline; of those, ${compliantMeaningfulRecovery.length} also keep Budget Compliance >= ${(MIN_COMPLIANCE_FLOOR * 100).toFixed(0)}%. Compliance across the whole sweep ranged [${(paretoAnalysis.complianceRange.min * 100).toFixed(2)}%, ${(paretoAnalysis.complianceRange.max * 100).toFixed(2)}%] (${paretoAnalysis.complianceIsBudgetInvariant ? "effectively budget-invariant -- the mechanism enforces whatever target it's given" : "varies meaningfully by budget"}).`;

  const significantBudgets = validation.filter((v) => v.significantImprovement).map((v) => v.budgetMs);
  const level3Pass = paretoAnalysis.optimalBudgets.length > 0 && significantBudgets.length > 0;
  const level3Detail = `Pareto-optimal budgets: [${paretoAnalysis.optimalBudgets.join(", ")}]ms. Statistically significant recovery vs 40ms (95% CI lower bound > 0): [${significantBudgets.join(", ")}]ms.`;

  let recommendedContract: OperatingContractType;
  let recommendedBudgetMs: number | null;
  let rationale: string;
  let decision: "A" | "B" | "C";
  let decisionRationale: string;

  if (level1Pass && level2Pass && level3Pass) {
    // Prefer the smallest Pareto-optimal budget that both recovers meaningfully and is statistically significant --
    // smallest because it costs the least average Runtime among equally-valid options.
    const candidates = paretoAnalysis.optimalBudgets.filter(
      (b) => compliantMeaningfulRecovery.some((c) => c.budgetMs === b) && significantBudgets.includes(b)
    );
    if (candidates.length > 0) {
      recommendedBudgetMs = Math.min(...candidates);
      const summary = sweepSummaries.find((s) => s.budgetMs === recommendedBudgetMs)!;
      const capability = capabilityRecovery.find((c) => c.budgetMs === recommendedBudgetMs)!;
      recommendedContract = "fixed";
      rationale = `${recommendedBudgetMs}ms is the smallest Pareto-optimal, statistically-significant, compliance-maintaining budget: recovers ${capability.recoveryVs40msPp.toFixed(1)}pp vs the 40ms baseline (${capability.recoveryVsCeilingPct.toFixed(1)}% of the way to the unconstrained ceiling), avg runtime ${summary.avgRuntimeMs.toFixed(1)}ms, Budget Compliance ${((1 - summary.overrunRate) * 100).toFixed(2)}%. Since Budget Compliance is ${paretoAnalysis.complianceIsBudgetInvariant ? "effectively budget-invariant across the whole sweep" : "still comfortably above the floor at this budget"}, a Fixed Budget at this value is sufficient -- no Adaptive/Remaining-Time complexity is needed to reach this operating point.`;
      decision = "A";
      decisionRationale = `All 3 Levels PASS -- a concrete Fixed Budget value (${recommendedBudgetMs}ms) recovers meaningful, statistically-significant capability while keeping Budget Compliance high. Proceed to Production Integration with this Fixed Budget Contract.`;
    } else {
      recommendedContract = "hybrid";
      recommendedBudgetMs = null;
      rationale = "Meaningful recovery and Pareto-optimality exist but not jointly at any single tested budget -- a Hybrid policy (base Fixed Budget with an Adaptive extension when remaining time allows) may reconcile them.";
      decision = "B";
      decisionRationale = "Level1-3 pass in aggregate but no single Fixed Budget satisfies every criterion jointly -- an Adaptive/Hybrid policy needs its own dedicated Refinement pass (v2) rather than a Fixed value.";
    }
  } else if (level1Pass && level2Pass && !level3Pass) {
    recommendedContract = "adaptive";
    recommendedBudgetMs = null;
    rationale = "Meaningful capability recovery exists (Level2 PASS) but no single tested budget is both Pareto-optimal AND statistically significant (Level3 FAIL) -- an Adaptive policy that varies the budget per-case (e.g. by remaining recovery-attempt time budget) is better suited than any one Fixed value from this sweep.";
    decision = "B";
    decisionRationale = "Budget improves capability, but a single Fixed value doesn't cleanly dominate -- Refinement Sprint v2 should explore Adaptive/Remaining-Time policies instead of a wider Fixed sweep.";
  } else {
    recommendedContract = "fixed";
    recommendedBudgetMs = 40;
    rationale = "No budget in this sweep recovers meaningful capability while maintaining compliance -- reverting to the original 40ms Fixed Budget pending a different approach.";
    decision = "C";
    decisionRationale = "Budget value alone cannot resolve the capability/compliance tradeoff within this sweep's range -- a fundamentally different Architecture approach is needed.";
  }

  return {
    recommendedContract,
    recommendedBudgetMs,
    rationale,
    level1Pass,
    level1Detail,
    level2Pass,
    level2Detail,
    level3Pass,
    level3Detail,
    decision,
    decisionRationale,
  };
}
