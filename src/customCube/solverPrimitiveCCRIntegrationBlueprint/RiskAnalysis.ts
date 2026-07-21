// --- RiskAnalysis (CCR Integration Blueprint Sprint v1) --------------------
// STEP4. Quantifies the 4 risks the Work Order names, using REAL numbers
// wherever the data allows (STEP5's own Integration Simulation results),
// rather than qualitative guesses alone.
import type { RecoveryLayerCallFrequency } from "./IntegrationPointAnalysis";

export interface RuntimeRiskInput {
  baselineAvgRuntimeMs: number; // real solve() avg runtime today, this dataset (STEP5)
  baselineDeadlineMissRate: number; // real solve() deadline-miss rate today, this dataset (STEP5)
  ccrAvgTimeMsWhenEligible: number; // CCR Prototype's own avg time at the recommended budget, on its own eligible subset
  ccrEligibleAmongRecoveryTriggeredRate: number; // fraction of Recovery-triggered snapshots where CCR's Gate is also eligible
}

export interface RiskFinding {
  category: "Regression" | "Runtime" | "Starvation" | "Scheduler";
  severity: "low" | "medium" | "high";
  finding: string;
}

export function analyzeRisks(callFreq: RecoveryLayerCallFrequency, runtime: RuntimeRiskInput): RiskFinding[] {
  const estimatedNewAvgRuntimeMs = runtime.baselineAvgRuntimeMs + runtime.ccrAvgTimeMsWhenEligible * callFreq.recoveryTriggeredRate * runtime.ccrEligibleAmongRecoveryTriggeredRate;
  const runtimeIncreasePercent = runtime.baselineAvgRuntimeMs ? ((estimatedNewAvgRuntimeMs - runtime.baselineAvgRuntimeMs) / runtime.baselineAvgRuntimeMs) * 100 : 0;

  return [
    {
      category: "Regression",
      severity: "low",
      finding:
        "CCR과 REPAIR의 Gate가 서로소이고(CCR Prototype Sprint v1 STEP6에서 Duplicate Success 0건 실측 확인), CCR 자신도 REPAIR와 동일한 Deferred Validation 불변식(net-improvement만 채택)을 그대로 재사용한다 -- REPAIR가 통합 이후 4개 Sprint에 걸쳐 Regression 0건을 유지한 것과 동일한 안전장치. 구조적으로 Regression 위험은 낮다.",
    },
    {
      category: "Runtime",
      severity: estimatedNewAvgRuntimeMs > 1500 ? "high" : "medium",
      finding:
        `현재 실측 평균 Runtime ${runtime.baselineAvgRuntimeMs.toFixed(1)}ms(Deadline Miss율 ${(runtime.baselineDeadlineMissRate * 100).toFixed(1)}%, 이미 명목 예산 근처/초과)에 CCR 자신의 평균 소요시간(${runtime.ccrAvgTimeMsWhenEligible.toFixed(1)}ms, Gate 적합 시)을 ` +
        `Recovery 호출률(${(callFreq.recoveryTriggeredRate * 100).toFixed(1)}%) × CCR Gate 적합 비율(${(runtime.ccrEligibleAmongRecoveryTriggeredRate * 100).toFixed(1)}%)만큼 가중해 더하면, 추정 평균 Runtime은 ${estimatedNewAvgRuntimeMs.toFixed(1)}ms(${runtimeIncreasePercent >= 0 ? "+" : ""}${runtimeIncreasePercent.toFixed(1)}%)다. ` +
        "이미 예산 근처인 상태에서의 추가 증가이므로 UX상 체감 가능한 지연이 발생할 위험이 실재한다 -- remainingTime 기반 예산과 floor 설정(BudgetContractEvaluation.ts)으로 완화가 필요하다.",
    },
    {
      category: "Starvation",
      severity: "low",
      finding:
        "SchedulingContract.ts의 설계(CCR 전용 예산 슬라이스, REPAIR의 reservedBudget과 동일한 원리)를 따르면 CCR이 DISRUPT/SETUP/REPAIR의 공유 genDeadline을 잠식하지 않고, 역으로 그것들에 의해 굶주리지도 않는다 -- Integration Refinement Sprint v1이 REPAIR를 위해 이미 검증한 메커니즘의 재사용.",
    },
    {
      category: "Scheduler",
      severity: "low",
      finding:
        "generateRecoveryStrategies()의 candidates 배열에 5번째 타입이 추가되는 것 자체는 순수한 목록 확장이다(chooseBestRecovery()는 이미 임의 개수의 candidates에 대해 동작하도록 작성되어 있음, `candidates.reduce`) -- 알고리즘적 변경이 필요 없다. 코드 복잡도는 소폭 증가하지만 런타임 동작에는 영향이 없다.",
    },
  ];
}
