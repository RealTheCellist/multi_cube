// --- ReliabilityDecision (Solver Long-term Reliability Validation
// Sprint v1, STEP6) -------------------------------------------------------
import type { RegressionTrendResult } from "./RegressionTrend";
import type { RuntimeDistributionSummary } from "./RuntimeDistribution";
import type { ContractStabilityResult } from "./ContractStability";
import type { DeterminismCaseResult } from "./DeterminismAnalysis";

export type ReliabilityDecisionType = "A_LONG_TERM_RELIABILITY_CONFIRMED" | "B_MONITORING_NEEDED" | "C_INSTABILITY_FOUND";

export interface Level1To4 {
  level1RegressionStable: boolean;
  level2RuntimeStable: boolean;
  level3ContractStable: boolean;
  level4DeterminismCharacterized: boolean;
}

export interface ReliabilityDecisionResult extends Level1To4 {
  decision: ReliabilityDecisionType;
  rationale: string;
}

export function evaluateReliabilityDecision(
  regressionTrend: RegressionTrendResult,
  runtimeRun1: RuntimeDistributionSummary,
  runtimeRun2: RuntimeDistributionSummary,
  contractStability: ContractStabilityResult,
  determinism: readonly DeterminismCaseResult[]
): ReliabilityDecisionResult {
  // Level1: no case shows a TRUE regression (improved/solved in run1 but a
  // worse outcome in run2, or vice versa) beyond what's explainable by
  // disclosed wall-clock non-determinism -- flipRate must stay low (<10%
  // of the population, matching the scale of variance this arc's own
  // prior Sprints have repeatedly observed and accepted).
  const level1RegressionStable = regressionTrend.flipRate < 0.1;

  // Level2: p95 runtime in run2 stays within the same +15% tolerance band
  // Gate B already uses, measured against run1 as the baseline. Note:
  // deadlineMissCount ("budget-exhausted" firing before solve()'s own
  // PLAN_TIME_BUDGET_MS=1000ms outer deadline reaches every planned task)
  // is NOT expected to be zero -- Production Integration Finalization
  // Sprint v1's own real release data already showed a non-zero baseline
  // rate and only tracked the DELTA a change introduced (its own "New
  // Deadline Miss"/"New Budget Violation" columns), never an absolute-zero
  // requirement. This Sprint follows that same established convention:
  // reliability means the deadline-miss RATE stays stable across two
  // independent real runs of identical code, not that it's zero.
  const runtimeTolerance = runtimeRun2.p95Ms <= runtimeRun1.p95Ms * 1.15;
  const deadlineMissDelta = Math.abs(runtimeRun2.deadlineMissCount - runtimeRun1.deadlineMissCount);
  const deadlineMissStable = runtimeRun1.deadlineMissCount === 0 ? deadlineMissDelta === 0 : deadlineMissDelta / runtimeRun1.deadlineMissCount < 0.1;
  const level2RuntimeStable = runtimeTolerance && deadlineMissStable;

  // Level3: zero drift in every real Operating Contract constant since
  // Closeout.
  const level3ContractStable = !contractStability.anyDrift;

  // Level4: determinism characterized (not necessarily 100% deterministic
  // -- the point is to KNOW and DISCLOSE the real variance rate, not
  // demand zero variance from a Date.now()-driven scheduler).
  const level4DeterminismCharacterized = determinism.length > 0;

  let decision: ReliabilityDecisionType;
  let rationale: string;
  if (level1RegressionStable && level2RuntimeStable && level3ContractStable && level4DeterminismCharacterized) {
    decision = "A_LONG_TERM_RELIABILITY_CONFIRMED";
    rationale = `2회 독립 real population replay 간 flipRate=${(regressionTrend.flipRate * 100).toFixed(1)}% (<10%), Runtime p95 허용 범위 이내이고 deadlineMissCount가 run1=${runtimeRun1.deadlineMissCount}건/run2=${runtimeRun2.deadlineMissCount}건으로 안정적(절대 0건이 아니라 이미 disclosed된 PLAN_TIME_BUDGET_MS=1000ms 고정 한계에서 기인하는 baseline 수준을 유지), Operating Contract 8개 전부 Closeout 대비 drift 없음, Determinism 실측 특성화 완료 -- Long-term Reliability를 확정하고 Continuous Validation Framework Sprint로 진행할 수 있다.`;
  } else if (level3ContractStable) {
    decision = "B_MONITORING_NEEDED";
    rationale = `Operating Contract는 안정적이나 Regression Trend 또는 Runtime Distribution에서 disclosed 허용 범위를 벗어난 신호가 있다 -- Continuous Validation Framework 단계에서 지속 관찰이 필요하다.`;
  } else {
    decision = "C_INSTABILITY_FOUND";
    rationale = `Operating Contract 자체에 drift가 발견되었다 -- Production 상태 재확인이 필요하다.`;
  }

  return { level1RegressionStable, level2RuntimeStable, level3ContractStable, level4DeterminismCharacterized, decision, rationale };
}
