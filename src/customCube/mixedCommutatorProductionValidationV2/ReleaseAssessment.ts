// --- ReleaseAssessment (Mixed Commutator Production Validation Sprint v2,
// Deliverable #6 / Success Criteria) -----------------------------------------
import type { MetricEvaluation } from "./StatisticalSummary";
import type { RegressionSummary } from "./RegressionClassification";
import type { SolveRuntimeSummary } from "./RuntimeSummary";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";

export type ReleaseDecision = "A_RELEASE_APPROVED" | "B_KEEP_WITH_FURTHER_RESEARCH" | "C_ROLLBACK_REVIEW";

export interface ReleaseAssessmentResult {
  decision: ReleaseDecision;
  decisionLabel: string;
  improvedRateIncreased: boolean;
  ciSupportsImprovement: boolean;
  noTrueRegression: boolean;
  runtimeAcceptable: boolean;
  rationale: string;
}

const RUNTIME_ACCEPTABLE_MEAN_ADDED_MS = 350; // MIXED_COMMUTATOR_RESERVED_SLICE_MS=300 + margin

export function assessRelease(improvedRateEval: MetricEvaluation, regression: RegressionSummary, mixedGenCost: SampleStats, solveRuntime: SolveRuntimeSummary): ReleaseAssessmentResult {
  const improvedRateIncreased = improvedRateEval.stats.mean > 0;
  const ciSupportsImprovement = improvedRateEval.stats.ciLower > 0;
  const noTrueRegression = regression.trueRegressionCount === 0;
  const runtimeAcceptable = mixedGenCost.mean <= RUNTIME_ACCEPTABLE_MEAN_ADDED_MS;

  let decision: ReleaseDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!noTrueRegression || !runtimeAcceptable) {
    decision = "C_ROLLBACK_REVIEW";
    decisionLabel = "Conclusion C -- Regression 존재 또는 Runtime 문제. Gate Rollback 검토 권고.";
    rationale = `noTrueRegression=${noTrueRegression} (trueRegressionCount=${regression.trueRegressionCount}), runtimeAcceptable=${runtimeAcceptable} (mixedGenCostMean=${mixedGenCost.mean.toFixed(1)}ms) -- 실패 조건 충족.`;
  } else if (improvedRateIncreased && ciSupportsImprovement) {
    decision = "A_RELEASE_APPROVED";
    decisionLabel = "Conclusion A -- Mixed Commutator Gate C를 포함한 현재 Production을 Release 승인.";
    rationale = `Improved Rate meanDiff=${improvedRateEval.stats.mean.toFixed(3)}, 95% CI=[${improvedRateEval.stats.ciLower.toFixed(3)}, ${improvedRateEval.stats.ciUpper.toFixed(3)}]가 개선 방향을 지지, Regression 0, Runtime 정상(solve() p95=${solveRuntime.p95Ms.toFixed(1)}ms) -- Release Criteria A 충족.`;
  } else {
    decision = "B_KEEP_WITH_FURTHER_RESEARCH";
    decisionLabel = "Conclusion B -- 현재 Production은 안전하지만 효과 검증이 부족하여 추가 연구 권고.";
    rationale = `Improved Rate meanDiff=${improvedRateEval.stats.mean.toFixed(3)}, 95% CI=[${improvedRateEval.stats.ciLower.toFixed(3)}, ${improvedRateEval.stats.ciUpper.toFixed(3)}] -- ${improvedRateIncreased ? "증가는 있으나 CI가 0을 포함해 통계적으로 확정적이지 않음" : "증가가 관측되지 않음"}. Regression 없고 안전하므로 Production은 유지, 추가 연구 권고.`;
  }

  return { decision, decisionLabel, improvedRateIncreased, ciSupportsImprovement, noTrueRegression, runtimeAcceptable, rationale };
}
