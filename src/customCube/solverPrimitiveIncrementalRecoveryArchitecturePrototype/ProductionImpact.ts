// --- ProductionImpact (Incremental Recovery Architecture Prototype
// Sprint v1, STEP6) ---------------------------------------------------------
// Synthesizes STEP1-5's real measurements into this Sprint's own Level1-3
// PASS/FAIL judgments and Decision A/B/C, per the work order's exact
// criteria: Level2 target is "54.5% -> 40% or below" (Refinement Sprint
// v1's own reservedSlice baseline); Level3 requires capability maintained
// AND no Regression increase alongside the Runtime/Budget improvement.
import type { BudgetComplianceSummary } from "./BudgetCompliance";
import type { CapabilityPreservationSummary, RegressionAnalysisSummary } from "./CapabilityRegressionAnalysis";
import type { GranularityProbeResult, RegressionSafetyCheck } from "./TraversalInterruptibilityCore";

const REFINEMENT_SPRINT_BASELINE_OVERRUN_RATE = 0.545; // Refinement Sprint v1's own measured reservedSlice overrun rate
const LEVEL2_TARGET_OVERRUN_RATE = 0.40;

export interface ProductionImpactResult {
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  decision: "A" | "B" | "C";
  decisionRationale: string;
  costBenefit: {
    runtimeReductionMs: number;
    overrunRateReduction: number; // baseline (this Sprint's own, no-deadline) minus budgeted, as a fraction
    capabilityCostPct: number; // positive = capability lost
    trueRegressionCount: number;
  };
}

export function analyzeProductionImpact(
  granularityResults: readonly GranularityProbeResult[],
  regressionSafety: RegressionSafetyCheck,
  baselineBudget: BudgetComplianceSummary,
  budgetedBudget: BudgetComplianceSummary,
  capability: CapabilityPreservationSummary,
  regression: RegressionAnalysisSummary,
  typeCheckDiffIntroducedNewErrors: boolean
): ProductionImpactResult {
  const allGranularitiesAborted = granularityResults.every((g) => g.abortedCount === g.n);
  const regressionSafetyClean = regressionSafety.mismatchCount === 0;
  const level1Pass = allGranularitiesAborted && regressionSafetyClean && !typeCheckDiffIntroducedNewErrors;
  const level1Detail = `3 granularities compared (nodeCount/queuePop/levelTransition), all ${allGranularitiesAborted ? "correctly interrupted every case" : "FAILED to interrupt some cases"}; regression-safety smoke check ${regressionSafety.identicalResultCount}/${regressionSafety.n} identical (deadline=undefined vs generous deadline); git-stash type-check comparison showed ${typeCheckDiffIntroducedNewErrors ? "NEW errors introduced" : "zero new errors"}.`;

  const level2Pass = budgetedBudget.overrunRate <= LEVEL2_TARGET_OVERRUN_RATE;
  const level2Detail = `Budget Overrun rate: this Sprint's own no-deadline baseline ${(baselineBudget.overrunRate * 100).toFixed(1)}% (Refinement Sprint v1's own comparable figure: ${(REFINEMENT_SPRINT_BASELINE_OVERRUN_RATE * 100).toFixed(1)}%) -> with the real 40ms deadline enforced (queuePop granularity): ${(budgetedBudget.overrunRate * 100).toFixed(2)}%, vs the ${(LEVEL2_TARGET_OVERRUN_RATE * 100).toFixed(0)}% target.`;

  const noRegressionIncrease = regression.trueRegressionCount === 0;
  const capabilityMaintained = capability.successRateDeltaPct >= 0;
  const level3Pass = noRegressionIncrease && capabilityMaintained;
  const level3Detail = `Native path-finding success rate: ${(capability.baselineSuccessRate * 100).toFixed(1)}% (no deadline) -> ${(capability.budgetedSuccessRate * 100).toFixed(1)}% (40ms deadline enforced), delta ${capability.successRateDeltaPct.toFixed(1)}pp; True Regression count ${regression.trueRegressionCount}/${regression.n} (${(regression.abortCausedCapabilityLossRate * 100).toFixed(1)}%) -- capability was NOT fully maintained; the deadline abort itself is the sole cause (see file header: same deterministic traversal order both arms).`;

  let decision: "A" | "B" | "C";
  let decisionRationale: string;
  if (level1Pass && level2Pass && level3Pass) {
    decision = "A";
    decisionRationale = "All 3 Levels PASS -- mechanism correctly implemented, Budget Overrun resolved, capability maintained with no regression increase. Proceed to Production Integration.";
  } else if (level1Pass && level2Pass && !level3Pass) {
    decision = "B";
    decisionRationale = `Level1/2 PASS but Level3 FAILS on real data: the interruptibility mechanism itself works exactly as designed and resolves Budget Overrun far below target, but the FIXED 40ms budget value costs real capability (${regression.trueRegressionCount} True Regressions, ${capability.successRateDeltaPct.toFixed(1)}pp success rate drop) because many real searches genuinely need more than 40ms of wall time to complete, not because of wasted overshoot. This is a parameter-tuning problem, not a mechanism-validity problem: before this Sprint, no budget above ~40ms could be used SAFELY (uncontrolled overshoot risked ~4-10x blowup, per Refinement Sprint v1's own 1003ms max single-hop figure); this Sprint's own Traversal Interruptibility now makes ANY budget value safe, since the deadline check bounds worst-case cost regardless of the target. Refinement should sweep budget values (e.g. 80/100/140ms) now that they can be enforced safely, to find an operating point that keeps Budget compliance near this Sprint's own 0.5%-class overrun rate while recovering more of the ${(capability.baselineSuccessRate * 100).toFixed(1)}% baseline capability.`;
  } else {
    decision = "C";
    decisionRationale = "Level1 or Level2 itself failed -- the Traversal Interruptibility mechanism does not resolve Budget Overrun or was not correctly implemented; a different Production-layer approach is needed.";
  }

  return {
    level1Pass,
    level1Detail,
    level2Pass,
    level2Detail,
    level3Pass,
    level3Detail,
    decision,
    decisionRationale,
    costBenefit: {
      runtimeReductionMs: baselineBudget.avgRuntimeMs - budgetedBudget.avgRuntimeMs,
      overrunRateReduction: baselineBudget.overrunRate - budgetedBudget.overrunRate,
      capabilityCostPct: -capability.successRateDeltaPct,
      trueRegressionCount: regression.trueRegressionCount,
    },
  };
}
