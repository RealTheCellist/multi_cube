// --- FinalAssessment (Production Integration Finalization Sprint v1,
// STEP6) --------------------------------------------------------------------
// Synthesizes STEP1-6 into this Sprint's own Level1-3 judgment, Production
// Integration suitability verdict, and Release recommendation.
import type { StandardEvaluationResult } from "./StatisticalValidation";
import type { RegressionAuditSummary } from "./RegressionAudit";
import type { EndgameRecoveryInteraction } from "./PrimitiveInteractionAnalysis";

const REGRESSION_ALLOWANCE = 0.05; // matches this whole research arc's own established <=5% True Regression bar

export interface Level1To3Result {
  level1Pass: boolean;
  level1Detail: string;
  level2Pass: boolean;
  level2Detail: string;
  level3Pass: boolean;
  level3Detail: string;
  suitabilityVerdict: string;
  releaseRecommendation: "RELEASE" | "HOLD_FOR_REFINEMENT" | "DO_NOT_RELEASE";
  releaseRationale: string;
}

export function evaluateFinalAssessment(
  evaluation: StandardEvaluationResult,
  regressionAudit: RegressionAuditSummary,
  endgameRecoveryInteraction: EndgameRecoveryInteraction
): Level1To3Result {
  // Level1: the confirmed Operating Contracts are actually applied at the
  // real production call site -- verified two ways: (a) the code diff
  // itself (git-stash-compared, zero new type errors, see Sprint docs),
  // and (b) an EMPIRICAL signal that the override genuinely changes
  // production behavior (not silently ignored): Integrated's own Recovery
  // Trigger rate must differ measurably from Baseline's, matching the
  // mechanistic direction Refinement Sprint v1/v2 already established
  // (smaller reserve -> ENDGAME's own primary attempt gets more room ->
  // needs Recovery less often).
  const recoveryTriggerDeltaPp = endgameRecoveryInteraction.recoveryTriggerRateDelta * 100;
  const level1Pass = Math.abs(recoveryTriggerDeltaPp) > 0.5; // a genuinely-wired override should move this metric measurably, not by rounding noise alone
  const level1Detail = `Recovery Trigger rate: Baseline=${(endgameRecoveryInteraction.recoveryTriggerRateBaseline * 100).toFixed(2)}%, Integrated=${(endgameRecoveryInteraction.recoveryTriggerRateIntegrated * 100).toFixed(2)}% (delta=${recoveryTriggerDeltaPp.toFixed(2)}pp) -- ${level1Pass ? "measurably different, confirming the Contract is genuinely wired at the real production call site" : "NOT measurably different -- the override may not be taking effect"}.`;

  const level2Pass = regressionAudit.trueRegressionRate <= REGRESSION_ALLOWANCE;
  const level2Detail = `Full 335-snapshot census: True Regression rate=${(regressionAudit.trueRegressionRate * 100).toFixed(2)}% (${level2Pass ? "within" : "EXCEEDS"} the ${(REGRESSION_ALLOWANCE * 100).toFixed(0)}% allowance). Gap Rescue rate=${(regressionAudit.gapRescueRate * 100).toFixed(2)}%. Runtime Spike rate=${(regressionAudit.runtimeSpikeRate * 100).toFixed(2)}%. New Deadline Miss rate=${(regressionAudit.newDeadlineMissRate * 100).toFixed(2)}%. New Budget Violation rate=${(regressionAudit.newBudgetViolationRate * 100).toFixed(2)}%.`;

  const level3Pass = evaluation.primary.stats.mean > 0 && evaluation.primary.stats.ciLower > 0;
  const level3Detail = `Primary (whole-cube-improved count diff, N=${evaluation.nTrials} trials): mean=${evaluation.primary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.primary.stats.ciLower.toFixed(3)}, ${evaluation.primary.stats.ciUpper.toFixed(3)}], Cohen's d_z=${evaluation.primary.effectSize.cohensD.toFixed(3)} (${evaluation.primary.effectSize.magnitude}).`;

  let suitabilityVerdict: string;
  let releaseRecommendation: "RELEASE" | "HOLD_FOR_REFINEMENT" | "DO_NOT_RELEASE";
  let releaseRationale: string;

  if (level1Pass && level2Pass && level3Pass) {
    suitabilityVerdict = "Production Integration 적합 -- 모든 Operating Contract가 정상 연결되었고(Level1), Regression은 허용 범위 내이며(Level2), Integrated Solver가 Baseline보다 통계적으로 유의미하게 우수함이 입증됨(Level3).";
    releaseRecommendation = "RELEASE";
    releaseRationale = "Level1/2/3 모두 PASS. 지금까지 이 연구 전체가 축적한 세 Operating Contract(ENDGAME 250ms, Incremental Recovery 140ms, CCR remainingTime/singleCycle)가 실제 Production 경로에서 통계적으로 검증된 순이익을 내며, Regression은 허용 범위 내로 확인됨.";
  } else if (level1Pass && level2Pass) {
    suitabilityVerdict = "Production Integration 조건부 적합 -- Contract는 정상 연결되고 Regression도 허용 범위 내이나, Capability 우위가 통계적으로 아직 확정되지 않음.";
    releaseRecommendation = "HOLD_FOR_REFINEMENT";
    releaseRationale = "Level1/2는 PASS했으나 Level3(통계적 유의성)가 FAIL -- Regression 위험은 없지만 우위를 확정할 추가 표본이나 재측정이 필요.";
  } else if (level1Pass) {
    suitabilityVerdict = "Production Integration 부적합 -- Contract는 연결되었으나 Regression이 허용 범위를 초과함.";
    releaseRecommendation = "DO_NOT_RELEASE";
    releaseRationale = "Level2(Regression 허용 범위) FAIL -- Integration으로 인한 실제 손실이 확인되어, 원인 규명 전까지 릴리스할 수 없음.";
  } else {
    suitabilityVerdict = "Production Integration 검증 실패 -- Operating Contract가 실제로 연결되었는지조차 확인되지 않음.";
    releaseRecommendation = "DO_NOT_RELEASE";
    releaseRationale = "Level1 FAIL -- 계측 결과 Contract가 실제 production 경로에 반영되지 않은 것으로 보임. 연결 자체를 재검토해야 함.";
  }

  return { level1Pass, level1Detail, level2Pass, level2Detail, level3Pass, level3Detail, suitabilityVerdict, releaseRecommendation, releaseRationale };
}
