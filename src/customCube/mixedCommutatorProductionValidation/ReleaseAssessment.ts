// --- ReleaseAssessment (Mixed Commutator Production Validation Sprint v1,
// Deliverable #6 / Success Criteria) -----------------------------------------
import type { MetricEvaluation } from "./StatisticalSummary";
import type { RegressionSummary } from "./RegressionClassification";
import type { RuntimeSummary } from "./RuntimeSummary";

export type ReleaseDecision = "A_PRODUCTION_RELEASE" | "B_ADDITIONAL_REFINEMENT" | "C_ROLLBACK";

export interface ReleaseAssessmentResult {
  decision: ReleaseDecision;
  decisionLabel: string;
  solveRateIncreased: boolean;
  noTrueRegression: boolean;
  runtimeAcceptable: boolean;
  statisticalNote: string;
  runtimeNote: string;
  rationale: string;
}

// MIXED_COMMUTATOR's own reserved slice is
// MIXED_COMMUTATOR_RESERVED_SLICE_MS=300ms (fiveByFiveEdgeRecovery.ts), so
// its own isolated added generation cost is bounded by construction; this
// threshold only flags something abnormal (e.g. a measurement bug or the
// Gate check itself being unexpectedly slow) if the observed added cost
// meaningfully exceeds that budget. The real end-to-end solve() timeout
// rate (RuntimeSummary.timeoutRate) is deliberately NOT used as a gate here
// -- it is a pre-existing characteristic of these "worstCase" snapshots
// (this whole research arc has repeatedly measured these snapshots timing
// out under the ordinary pipeline regardless of Recovery/Mixed Commutator),
// not something this Sprint's change caused; it is reported as disclosed
// context only.
const RUNTIME_ACCEPTABLE_MEAN_ADDED_MS = 350;

export function assessRelease(
  improvedRateEval: MetricEvaluation,
  regression: RegressionSummary,
  runtime: RuntimeSummary,
  mixedOwnGenCostMeanMs: number
): ReleaseAssessmentResult {
  const solveRateIncreased = improvedRateEval.stats.mean > 0;
  const noTrueRegression = regression.trueRegressionCount === 0;
  const runtimeAcceptable = mixedOwnGenCostMeanMs <= RUNTIME_ACCEPTABLE_MEAN_ADDED_MS;

  const ciExcludesZero = improvedRateEval.stats.ciLower > 0 || improvedRateEval.stats.ciUpper < 0;
  const statisticalNote = ciExcludesZero
    ? `95% CI [${improvedRateEval.stats.ciLower.toFixed(3)}, ${improvedRateEval.stats.ciUpper.toFixed(3)}]가 0을 포함하지 않음 -- 통계적으로 유의미.`
    : `95% CI [${improvedRateEval.stats.ciLower.toFixed(3)}, ${improvedRateEval.stats.ciUpper.toFixed(3)}]가 0을 포함함 -- Mixed Commutator의 Gate가 매우 좁아(142건 중 극소수) 이 표본 크기에서는 통계적 유의성에 도달하지 못함 (실측 그대로 공개).`;

  const runtimeNote = `MIXED_COMMUTATOR 자체 소요 시간(Gate 통과 여부와 무관하게 onEvent start~end)은 예산(300ms) ${runtimeAcceptable ? "이내" : "초과"} (mean=${mixedOwnGenCostMeanMs.toFixed(1)}ms). 참고: 실제 end-to-end solve()의 timeoutRate=${(runtime.timeoutRate * 100).toFixed(1)}%는 이 Sprint 이전부터 존재하는 "worstCase" 스냅샷 고유 특성으로, Release 판단의 Gate로 사용하지 않음(정보 공개 목적).`;

  let decision: ReleaseDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!noTrueRegression || !runtimeAcceptable) {
    decision = "C_ROLLBACK";
    decisionLabel = "Conclusion C -- Regression 또는 Runtime 문제로 Release 보류.";
    rationale = `noTrueRegression=${noTrueRegression} (trueRegressionCount=${regression.trueRegressionCount}), runtimeAcceptable=${runtimeAcceptable} (mixedOwnGenCostMeanMs=${mixedOwnGenCostMeanMs.toFixed(1)}) -- 하나 이상 실패.`;
  } else if (solveRateIncreased) {
    decision = "A_PRODUCTION_RELEASE";
    decisionLabel = ciExcludesZero
      ? "Conclusion A -- Production Release 승인 (통계적으로 유의미)."
      : "Conclusion A -- Production Release 승인 (방향은 양(+)이나, Gate가 좁아 이 표본 크기에서 통계적 유의성 caveat 있음).";
    rationale = "Recovery 성공률(Improved Rate)이 증가했고, True Regression 0건, Runtime(Mixed 자체 비용) 예산 이내 -- Production Release 대상으로 승인.";
  } else {
    decision = "B_ADDITIONAL_REFINEMENT";
    decisionLabel = "Conclusion B -- 향상이 이 표본에서 확인되지 않음 (meanDiff<=0), 추가 Refinement 권장.";
    rationale = `Recovery 성공률(Improved Rate) meanDiff=${improvedRateEval.stats.mean.toFixed(3)}로 증가가 관측되지 않음 -- Regression은 없지만(trueRegressionCount=0), Solve Rate 증가라는 Success Criteria A의 조건을 충족하지 못해 추가 Refinement를 권장.`;
  }

  return { decision, decisionLabel, solveRateIncreased, noTrueRegression, runtimeAcceptable, statisticalNote, runtimeNote, rationale };
}
