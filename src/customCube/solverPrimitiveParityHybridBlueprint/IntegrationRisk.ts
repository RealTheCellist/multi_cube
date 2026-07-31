// --- IntegrationRisk (Parity-Gated Cycle Hybrid Primitive Blueprint
// Sprint v1, STEP5) -----------------------------------------------------------
// Design-only. Assesses the Hybrid's impact on Scheduler/Recovery/
// Runtime/Production change amount/Regression risk, grounded in the
// Comparative Prototype Sprint v1's own real measurements (both
// Prototypes: 0 regression, 0 Planner/Recovery files touched) and
// STEP4's own real marginal-rescue-vs-cost tradeoff.
import type { CounterfactualCapabilityResult } from "./CounterfactualCapabilityEstimation";

export interface IntegrationRiskAssessment {
  schedulerImpact: string;
  recoveryImpact: string;
  runtimeImpact: string;
  productionChangeAmount: string;
  regressionRisk: string;
}

export function assessIntegrationRisk(capability: CounterfactualCapabilityResult, totalCases: number): IntegrationRiskAssessment {
  return {
    schedulerImpact:
      "두 Prototype 모두 genParityGatedCycle()과 동일한 단일 호출 구성을 재사용하므로, Hybrid도 새 Scheduler 없이 " +
      "같은 자리에서 두 함수를 순차 호출하는 정도로 구현 가능하다 -- Scheduler 레벨 위험은 낮다.",
    recoveryImpact:
      "Comparative Prototype Sprint v1 실측: 두 Prototype 모두 fiveByFiveEdgeRecovery.ts/fiveByFiveEdgePlanner.ts " +
      "변경 없이 구현됨(plannerFilesTouched=0, recoveryFilesTouched=0) -- Hybrid도 동일 원칙 적용 가능해 " +
      "Recovery 레이어 위험은 낮다.",
    runtimeImpact:
      `그러나 STEP4 실측 기준, Hybrid의 실질 marginal rescue는 ${capability.expectedRescueOverBestSingle}건` +
      `(전체 ${totalCases}건 중 ${capability.marginalRescuePercentOfPopulation.toFixed(1)}%)에 불과한 반면, ` +
      `그 나머지 대다수 케이스에서도 매번 추가 Primitive의 런타임(${capability.extraRuntimeCostForMarginalRescueMs.toFixed(0)}ms)을 ` +
      "지불해야 한다 -- Runtime 증가가 marginal rescue 대비 불균형하게 크다.",
    productionChangeAmount:
      "두 Prototype 각각 143~170줄 -- Hybrid로 결합해도 Production 변경량 자체는 Prototype 코드 추가 수준으로 " +
      "작다. 다만 두 함수를 호출/조합하는 오케스트레이션 코드가 추가로 필요하다.",
    regressionRisk:
      `두 Prototype 모두 실측 regression=0 -- Hybrid도 원칙적으로 안전하다. 그러나 duplicateSuccessCount=` +
      `${capability.duplicateSuccessCount}건에서는 두 Primitive를 모두 실행하는 것이 이미 불필요한 ` +
      `computation(같은 결과를 중복 계산)이므로, 이 비효율 자체가 성능상의 위험 요소다.`,
  };
}
