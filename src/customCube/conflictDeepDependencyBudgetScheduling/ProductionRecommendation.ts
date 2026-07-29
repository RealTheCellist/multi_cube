// --- ProductionRecommendation (CONFLICT_DEEP_DEPENDENCY Budget & Scheduling
// Validation Sprint v1, Success Criteria / Deliverable #5) -------------------
// Directive's own Success Criteria, applied in this fixed order (disclosed
// before running any measurement):
//   A: Recovery 증가 (bestConfig.improvedRate meaningfully > baseline's own
//      improvedRate, AND onlyReserved>0 -- real evidence of unlocking new
//      capability, not noise) AND Regression 0 (trueRegressionCount===0)
//      AND Runtime 허용 (reservationMs within the tested 75-500ms range)
//      AND Reserved Slice 방식이 명확히 우월 (improvement delta exceeds
//      MEANINGFUL_IMPROVEMENT_RATE_DELTA) -> Production Integration 진행
//      권고.
//   B: some improvement exists but doesn't clear the "clearly superior"
//      bar, or Regression is safe but the effect is marginal -> additional
//      Parameter Optimization recommended.
//   C: no real effect (improvedRate delta ~0 or negative, or onlyReserved
//      never fires) -> keep current Scheduler.
import type { ArmSummaryAtSize } from "./DoseResponseAnalysis";
import type { BestConfiguration } from "./BudgetAllocationMatrix";
import type { RegressionSummary } from "./RegressionCheck";

export const MEANINGFUL_IMPROVEMENT_RATE_DELTA = 0.05; // >=5 percentage points better than Baseline
export const MAX_ACCEPTABLE_RESERVATION_MS = 500; // Directive's own tested ceiling

export type BudgetConclusion = "A_INTEGRATION_RECOMMENDED" | "B_PARAMETER_OPTIMIZATION_NEEDED" | "C_NO_EFFECT_KEEP_CURRENT";

export interface ProductionRecommendationResult {
  conclusion: BudgetConclusion;
  conclusionLabel: string;
  recoveryIncreased: boolean;
  regressionSafe: boolean;
  runtimeAcceptable: boolean;
  clearlySuperior: boolean;
  rationale: string;
}

export function recommendProduction(baselineSummary: ArmSummaryAtSize, best: BestConfiguration, bestArmSummary: ArmSummaryAtSize, regression: RegressionSummary): ProductionRecommendationResult {
  const improvementDelta = best.improvedRate - baselineSummary.improvedRate;
  const recoveryIncreased = improvementDelta > 0 && bestArmSummary.onlyReserved > 0;
  const regressionSafe = regression.trueRegressionCount === 0;
  const runtimeAcceptable = best.reservationMs <= MAX_ACCEPTABLE_RESERVATION_MS;
  const clearlySuperior = improvementDelta >= MEANINGFUL_IMPROVEMENT_RATE_DELTA;

  if (recoveryIncreased && regressionSafe && runtimeAcceptable && clearlySuperior) {
    return {
      conclusion: "A_INTEGRATION_RECOMMENDED",
      conclusionLabel: "Conclusion A -- Reserved Slice 방식이 명확히 우월하고 안전함. Production Integration 진행 권고.",
      recoveryIncreased,
      regressionSafe,
      runtimeAcceptable,
      clearlySuperior,
      rationale: `bestConfig=${best.arm}@${best.reservationMs}ms, improvedRate ${(baselineSummary.improvedRate * 100).toFixed(1)}% -> ${(best.improvedRate * 100).toFixed(
        1
      )}% (delta=+${(improvementDelta * 100).toFixed(1)}pp, onlyReserved=${bestArmSummary.onlyReserved}), trueRegressionCount=${regression.trueRegressionCount}, reservationMs=${
        best.reservationMs
      }ms (<=${MAX_ACCEPTABLE_RESERVATION_MS}ms) -- 모든 Success Criteria A 조건 충족.`,
    };
  }

  if (!regressionSafe || !runtimeAcceptable) {
    return {
      conclusion: "C_NO_EFFECT_KEEP_CURRENT",
      conclusionLabel: "Conclusion C -- Regression 또는 Runtime 문제 발견. 현재 Scheduler 유지.",
      recoveryIncreased,
      regressionSafe,
      runtimeAcceptable,
      clearlySuperior,
      rationale: `regressionSafe=${regressionSafe} (trueRegressionCount=${regression.trueRegressionCount}), runtimeAcceptable=${runtimeAcceptable} (reservationMs=${best.reservationMs}ms) -- 안전 조건 미충족.`,
    };
  }

  if (recoveryIncreased && !clearlySuperior) {
    return {
      conclusion: "B_PARAMETER_OPTIMIZATION_NEEDED",
      conclusionLabel: "Conclusion B -- 향상은 있으나 추가 Parameter Optimization 필요.",
      recoveryIncreased,
      regressionSafe,
      runtimeAcceptable,
      clearlySuperior,
      rationale: `improvedRate delta=+${(improvementDelta * 100).toFixed(
        1
      )}pp (< ${(MEANINGFUL_IMPROVEMENT_RATE_DELTA * 100).toFixed(0)}pp 기준), onlyReserved=${bestArmSummary.onlyReserved} -- 안전하지만 효과가 명확히 우월한 수준은 아님. 추가 Reservation 크기 탐색 또는 Arm 조합 조정 권고.`,
    };
  }

  return {
    conclusion: "C_NO_EFFECT_KEEP_CURRENT",
    conclusionLabel: "Conclusion C -- Reserved Slice 효과 없음. 현재 Scheduler 유지.",
    recoveryIncreased,
    regressionSafe,
    runtimeAcceptable,
    clearlySuperior,
    rationale: `improvedRate delta=${(improvementDelta * 100).toFixed(1)}pp, onlyReserved=${bestArmSummary.onlyReserved} -- 실질적 개선 근거 없음.`,
  };
}
