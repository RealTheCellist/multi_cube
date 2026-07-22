// --- ArchitectureSimulation (Incremental Recovery Blueprint Sprint v1) -----
// STEP4. Counterfactual comparison of 4 architectures, grounded in this
// Sprint's own STEP1-3 real numbers plus the already-real, already-cited
// figures from Recovery Architecture Review Sprint v1 (ENDGAME-only
// population size, timeline shares) -- disclosed as counterfactual
// synthesis, not a new production benchmark.
import type { PairFailureSummary } from "./PairFailurePopulationAnalysis";
import type { BudgetPolicyResult } from "./IncrementalBudgetContract";

// Cited, already-real figures from Recovery Architecture Review Sprint v1's
// own report (not re-measured here -- same dataset, same session).
const ENDGAME_ATTEMPT_COUNT = 51;
const ENDGAME_NO_PROGRESS_RATE = 1.0;

export interface ArchitectureSimResult {
  architecture: "current" | "early" | "incremental" | "opportunistic";
  populationSize: string;
  coverage: string;
  runtimeImpact: string;
  primitiveUtilization: string;
}

export function simulateArchitectures(pairSummary: PairFailureSummary, bestIncrementalPolicy: BudgetPolicyResult): ArchitectureSimResult[] {
  const gateEligibleTotal = pairSummary.ccrGateEligibleCount + pairSummary.repairGateEligibleCount;
  return [
    {
      architecture: "current",
      populationSize: `${ENDGAME_ATTEMPT_COUNT}건 (ENDGAME 태스크 시도 횟수, Recovery Architecture Review Sprint v1 실측)`,
      coverage: `${(ENDGAME_NO_PROGRESS_RATE * 100).toFixed(1)}% no-progress -- 100% 모집단이지만 모집단 자체가 작다`,
      runtimeImpact: "기준선 (CCR Production Integration Sprint v1: +3.3%, 실질 기여 거의 0)",
      primitiveUtilization: "매우 낮음",
    },
    {
      architecture: "early",
      populationSize: `${ENDGAME_ATTEMPT_COUNT}건과 동일 (ENDGAME 태스크 자체는 그대로, 예산만 미리 확보)`,
      coverage: "CCR Integration Blueprint Revision Sprint v1의 counterfactual(+300ms)상 CCR 생성률 4.1%까지만 개선",
      runtimeImpact: "PAIR/FLIP/PARITY/ENDGAME 기본 파이프라인의 몫 감소 위험",
      primitiveUtilization: "제한적 개선",
    },
    {
      architecture: "incremental",
      populationSize: `${pairSummary.n}건 (PAIR no-progress 전체) 중 Gate 적합 ${gateEligibleTotal}건(CCR ${pairSummary.ccrGateEligibleCount} + REPAIR ${pairSummary.repairGateEligibleCount}) -- ENDGAME 모집단(${ENDGAME_ATTEMPT_COUNT}건)의 ${pairSummary.n ? (pairSummary.n / ENDGAME_ATTEMPT_COUNT).toFixed(1) : "0"}배`,
      coverage: `Gate 적합 모집단 기준 최선 Budget 정책(${bestIncrementalPolicy.policy})으로 성공률 ${(bestIncrementalPolicy.successRate * 100).toFixed(1)}%`,
      runtimeImpact: `평균 budget ${bestIncrementalPolicy.avgBudgetMs.toFixed(1)}ms/시도 x 최대 12회(PAIR 태스크 수) -- ENDGAME 1회성 시도보다 누적 비용이 더 분산되지만 총량은 유사하거나 클 수 있음`,
      primitiveUtilization: "이론상 가장 높음 -- 모집단 규모가 ENDGAME 대비 압도적으로 큼",
    },
    {
      architecture: "opportunistic",
      populationSize: `Incremental과 동일 모집단(${pairSummary.n}건)이지만 예산 여유가 있을 때만 선택적으로 시도`,
      coverage: "Incremental보다 낮은 호출률 -- 예산이 부족한 대다수 케이스에서는 시도조차 안 함",
      runtimeImpact: "Incremental보다 낮음 -- 예산 확인 자체의 오버헤드만 추가",
      primitiveUtilization: "Incremental과 Current의 중간",
    },
  ];
}
