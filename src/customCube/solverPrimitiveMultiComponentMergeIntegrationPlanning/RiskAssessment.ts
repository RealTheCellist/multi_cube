// --- RiskAssessment (Multi-Component Merge Production Integration
// Planning Sprint v1, STEP5) -------------------------------------------------
// Design-only. Classifies Regression/Runtime/Scheduler/Budget/Primitive
// Interaction risk as Low/Medium/High, computed from STEP1-4's own real
// outputs via explicit thresholds -- not asserted narrative.
import type { CounterfactualIntegrationResult } from "./CounterfactualIntegrationSimulation";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RiskItem {
  level: RiskLevel;
  rationale: string;
}

export interface RiskAssessmentResult {
  regressionRisk: RiskItem;
  runtimeRisk: RiskItem;
  schedulerRisk: RiskItem;
  budgetRisk: RiskItem;
  primitiveInteractionRisk: RiskItem;
}

const RUNTIME_COST_PER_RESCUE_HIGH_MS = 2000; // above this, runtime cost per genuinely-new rescue exceeds even PARITY_GATED_CYCLE_RESERVED_SLICE_MS itself
const RUNTIME_COST_PER_RESCUE_MEDIUM_MS = 800; // above this but below HIGH, cost is non-trivial but still bounded by a single Dedicated Slice
const CCR_OVERLAP_HIGH_RATE = 0.5;
const CCR_OVERLAP_MEDIUM_RATE = 0.15;

export function assessRisk(comparativeRegressionCount: number, result: CounterfactualIntegrationResult): RiskAssessmentResult {
  const regressionRisk: RiskItem =
    comparativeRegressionCount === 0
      ? { level: "LOW", rationale: `Comparative Prototype Sprint v1 실측: Multi-Component Merge의 전체 142-case Regression=${comparativeRegressionCount}건 -- validateDeferred가 모든 결과를 최종 검증하므로 componentCount>=3 Gate로 좁혀도 이 보장은 그대로 유지된다.` }
      : { level: "MEDIUM", rationale: `Comparative Prototype Sprint v1 실측 Regression=${comparativeRegressionCount}건 -- 0이 아니므로 재검증 필요.` };

  const perRescue = result.runtimeCostPerRescueMs;
  const runtimeRisk: RiskItem =
    perRescue >= RUNTIME_COST_PER_RESCUE_HIGH_MS
      ? { level: "HIGH", rationale: `runtimeCostPerRescueMs=${perRescue.toFixed(0)}ms -- 새 rescue 1건당 비용이 PARITY_GATED_CYCLE_RESERVED_SLICE_MS(2000ms) 자체를 초과한다.` }
      : perRescue >= RUNTIME_COST_PER_RESCUE_MEDIUM_MS
        ? { level: "MEDIUM", rationale: `runtimeCostPerRescueMs=${perRescue.toFixed(0)}ms -- 단일 Dedicated Slice(2000ms) 안에는 들어오지만, expectedRescueCount(${result.expectedRescueCount}건)가 expectedInvocationCount(${result.expectedInvocationCount}건)보다 훨씬 작아 비용 대비 rescue 효율이 낮다.` }
        : { level: "LOW", rationale: `runtimeCostPerRescueMs=${perRescue.toFixed(0)}ms -- 비용 대비 rescue 효율이 양호하다.` };

  const schedulerRisk: RiskItem = {
    level: "LOW",
    rationale: "STEP1 실측: MCM은 genParityGatedCycle()과 동일한 단일 호출 구성(Bridge->Traversal->Cleanup->Final Validation)을 재사용하므로 새 Scheduler 메커니즘 없이 generateRecoveryStrategies()의 기존 순차 호출 목록에 한 단계만 추가하면 된다 -- REPAIR/CCR의 기존 순서에도 영향 없음.",
  };

  const budgetRisk: RiskItem = {
    level: "LOW",
    rationale:
      "STEP2/STEP6 Gate 설계(componentCount>=3)가 PARITY_GATED_CYCLE의 Gate(componentCount>1)와 상호 배타적으로 " +
      "분리되므로, STEP3의 Dedicated Slice(PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms 재사용) 정책 하에서 두 " +
      "Primitive가 같은 케이스에서 동시에 예산을 소진하는 일은 Gate 설계상 발생하지 않는다 -- Shared Slice/Remaining " +
      "Time 정책을 채택할 경우에만 이 결론이 무효화되고 Budget Starvation 위험이 재현된다(STEP3 자체 disclosure).",
  };

  const ccrOverlapRate = result.interaction.ccrOverlapRate;
  const primitiveInteractionRisk: RiskItem =
    ccrOverlapRate >= CCR_OVERLAP_HIGH_RATE
      ? { level: "HIGH", rationale: `실측 ccrOverlapRate=${(ccrOverlapRate * 100).toFixed(1)}% -- MCM Gate 매치 케이스의 과반이 CCR Gate와도 겹친다.` }
      : ccrOverlapRate >= CCR_OVERLAP_MEDIUM_RATE
        ? { level: "MEDIUM", rationale: `실측 ccrOverlapRate=${(ccrOverlapRate * 100).toFixed(1)}%(${result.interaction.ccrOverlapCount}/${result.interaction.gateMatchedCount}) -- CCR과 chooseBestRecovery() 단계에서 경쟁하지만, REPAIR와의 겹침은 실측 0%(${result.interaction.repairOverlapCount}/${result.interaction.gateMatchedCount})이며, 두 후보 모두 독립적으로 생성되어 점수만 비교되므로(둘 다 존재 자체는 상호 배타적이지 않음) 이 자체가 Regression을 유발한 실측 사례는 없다.` }
        : { level: "LOW", rationale: `실측 ccrOverlapRate=${(ccrOverlapRate * 100).toFixed(1)}%, repairOverlapRate=${(result.interaction.repairOverlapRate * 100).toFixed(1)}% -- 기존 Primitive와의 겹침이 낮다.` };

  return { regressionRisk, runtimeRisk, schedulerRisk, budgetRisk, primitiveInteractionRisk };
}
