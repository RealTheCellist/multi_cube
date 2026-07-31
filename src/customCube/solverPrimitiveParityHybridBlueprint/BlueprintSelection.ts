// --- BlueprintSelection (Parity-Gated Cycle Hybrid Primitive Blueprint
// Sprint v1, STEP6) -------------------------------------------------------
// Design-only. Combines STEP1-5's real outputs into the Directive's own
// Decision A/B/C and Level1-3 verdicts. Judges Hybrid viability strictly
// by STEP1's Overlap (dualOnlyCount / exclusiveCapabilityCount) and
// STEP4's Counterfactual Capability (expectedRescueOverBestSingle), per
// the Directive's own 검증 원칙 #2 ("원시 성공 건수가 아니라 Overlap과
// Exclusive Capability를 기준으로 Hybrid 가능성을 판단한다").
import type { OverlapSummary } from "./CapabilityOverlapAnalysis";
import type { CounterfactualCapabilityResult } from "./CounterfactualCapabilityEstimation";
import type { HybridSchedulingOption } from "./HybridSchedulingDesign";
import type { BudgetPolicyOption } from "./BudgetArchitecture";
import type { IntegrationRiskAssessment } from "./IntegrationRisk";

export type BlueprintDecision =
  | "A_HYBRID_PRIMITIVE_PROTOTYPE"
  | "B_HYBRID_SIMULATION"
  | "C_SINGLE_PRIMITIVE_INTEGRATION";

export interface BlueprintSelectionResult {
  decision: BlueprintDecision;
  level1CapabilityOverlapResolved: boolean;
  level2HybridArchitectureConfirmed: boolean;
  level3PrototypeTargetSelected: string;
  recommendedSchedulingOptionId: string | null;
  recommendedBudgetPolicyId: string | null;
  rationale: string;
  selectionCriteria: {
    capability: string;
    runtime: string;
    risk: string;
    implementationComplexity: string;
  };
}

// expectedRescueOverBestSingle at or below this -> Hybrid adds no
// additive capability beyond the best single Primitive.
const NO_GAIN_THRESHOLD = 0;
// A nonzero but small marginal-rescue percentage is too thin a signal to
// commit straight to a Prototype -- Simulation should confirm it first.
const AMBIGUOUS_MARGINAL_RESCUE_PERCENT = 2;

export function selectBlueprint(
  overlap: OverlapSummary,
  capability: CounterfactualCapabilityResult,
  schedulingOptions: readonly HybridSchedulingOption[],
  budgetOptions: readonly BudgetPolicyOption[],
  risk: IntegrationRiskAssessment
): BlueprintSelectionResult {
  const noAdditiveCapability = capability.expectedRescueOverBestSingle <= NO_GAIN_THRESHOLD;
  const marginalButSmall =
    !noAdditiveCapability && capability.marginalRescuePercentOfPopulation < AMBIGUOUS_MARGINAL_RESCUE_PERCENT;

  let decision: BlueprintDecision;
  let rationale: string;

  if (noAdditiveCapability) {
    decision = "C_SINGLE_PRIMITIVE_INTEGRATION";
    rationale =
      `STEP1 Overlap 분석 결과 dualOnlyCount=${overlap.dualOnlyCount}, exclusiveCapabilityCount=${overlap.exclusiveCapabilityCount}건 ` +
      `중 Multi 쪽 exclusiveCapability만 존재하며, STEP4 Counterfactual 분석 결과 expectedRescueOverBestSingle=` +
      `${capability.expectedRescueOverBestSingle}건(전체의 ${capability.marginalRescuePercentOfPopulation.toFixed(1)}%)이다 -- ` +
      `${capability.bestSinglePrimitive} 단독이 이미 union upper bound(${capability.upperBoundSuccessCount}건)를 전부 달성하므로 ` +
      "Hybrid가 추가로 제공하는 Capability는 실측상 0이다. 반면 duplicateSuccessCount=" +
      `${capability.duplicateSuccessCount}건에서는 두 Primitive를 모두 실행하는 것이 불필요한 computation이며, ` +
      "STEP5 Integration Risk 분석 결과 marginal rescue 대비 runtime 비용도 불균형하게 크다. 따라서 Hybrid를 " +
      `설계/구현하는 대신 ${capability.bestSinglePrimitive} 단일 Primitive의 Production Integration으로 회귀하는 것이 타당하다.`;
  } else if (marginalButSmall) {
    decision = "B_HYBRID_SIMULATION";
    rationale =
      `expectedRescueOverBestSingle=${capability.expectedRescueOverBestSingle}건으로 0은 아니지만 전체의 ` +
      `${capability.marginalRescuePercentOfPopulation.toFixed(1)}%에 불과해 실제 Prototype 구현에 투자하기에는 ` +
      "신호가 약하다 -- 실제 코드를 구현하기 전에 Simulation으로 이 마진이 다른 population/조건에서도 " +
      "재현되는지 먼저 확인할 필요가 있다.";
  } else {
    decision = "A_HYBRID_PRIMITIVE_PROTOTYPE";
    rationale =
      `expectedRescueOverBestSingle=${capability.expectedRescueOverBestSingle}건(${capability.marginalRescuePercentOfPopulation.toFixed(1)}%)으로 ` +
      "Hybrid가 단일 Primitive보다 명확히 높은 Capability를 가질 가능성이 있다 -- Hybrid Primitive Prototype " +
      "Sprint로 진행해 실제 조합 구현과 재검증을 수행한다.";
  }

  const isSingleIntegration = decision === "C_SINGLE_PRIMITIVE_INTEGRATION";
  const recommendedSchedulingOptionId = isSingleIntegration ? null : schedulingOptions[0]?.id ?? null;
  const recommendedBudgetPolicyId = isSingleIntegration ? null : budgetOptions[0]?.id ?? null;

  const level3PrototypeTargetSelected = isSingleIntegration
    ? `${capability.bestSinglePrimitive}_SINGLE_PRIMITIVE_INTEGRATION`
    : recommendedSchedulingOptionId ?? "UNDETERMINED";

  return {
    decision,
    level1CapabilityOverlapResolved: true,
    level2HybridArchitectureConfirmed: !isSingleIntegration,
    level3PrototypeTargetSelected,
    recommendedSchedulingOptionId,
    recommendedBudgetPolicyId,
    rationale,
    selectionCriteria: {
      capability:
        `unionSuccessCount=${capability.upperBoundSuccessCount}, bestSingle(${capability.bestSinglePrimitive})=` +
        `${capability.bestSingleSuccessCount}, expectedRescueOverBestSingle=${capability.expectedRescueOverBestSingle}, ` +
        `jaccardIndex=${overlap.jaccardIndex.toFixed(3)}`,
      runtime: risk.runtimeImpact,
      risk: risk.regressionRisk,
      implementationComplexity: isSingleIntegration
        ? "Hybrid 오케스트레이션 불필요 -- 이미 Comparative Prototype Sprint v1에서 검증된 단일 Primitive를 그대로 Production Integration Planning으로 넘긴다."
        : `${risk.productionChangeAmount} ${risk.schedulerImpact}`,
    },
  };
}
