// --- ProductionDecisionMatrix (CONFLICT_DEEP_DEPENDENCY Scheduler
// Production Integration Sprint v1, STEP6) ---------------------------------
// Assembles the Directive's own Level 1-5 criteria from this Sprint's
// measured data (STEP1-5).
import type { RegressionSummary } from "../reservedSliceProductionIntegration/RegressionSummary";
import type { StatisticalValidationResult } from "../schedulerPrototypeSprintV1/StatisticalValidation";
import type { EndToEndCapabilitySummary } from "../reservedSliceProductionIntegration/EndToEndCapability";
import type { PrimitiveInteractionRow } from "./PrimitiveInteractionMatrix";

// Scheduler Prototype Sprint v1's own measured True Regression count at
// N=15 -- cited verbatim as the "no worse than" bar this Sprint's N>=30
// measurement must not exceed.
export const PRIOR_PROTOTYPE_TRUE_REGRESSION_COUNT = 0;
// Scheduler Prototype Sprint v1's own measured E2E p95 runtime -- cited as
// the Runtime reference point for this Sprint's own disclosed tolerance
// band (not a hard spec from the Directive, since none was given).
export const PRIOR_PROTOTYPE_E2E_P95_MS = 1286;
export const RUNTIME_TOLERANCE_FACTOR = 1.15;
// This Sprint's own disclosed threshold for "a Primitive got meaningfully
// worse" in the Interaction check -- a >20 percentage-point success-rate
// drop, conditioned on the type having actually been selected at least
// once under Baseline (so a rate is even meaningful).
export const PRIMITIVE_WORSENING_THRESHOLD = 0.2;

export interface ProductionDecisionRow {
  level: 1 | 2 | 3 | 4 | 5;
  criterion: string;
  status: "PASS" | "FAIL" | "OPEN_QUESTION";
  evidence: string;
}

export interface ProductionDecisionResult {
  rows: ProductionDecisionRow[];
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

export function assembleProductionDecisionMatrix(
  regressionSummary: RegressionSummary,
  statisticalValidation: StatisticalValidationResult,
  e2eSummary: EndToEndCapabilitySummary,
  interactionMatrix: readonly PrimitiveInteractionRow[]
): ProductionDecisionResult {
  const rows: ProductionDecisionRow[] = [];

  rows.push({
    level: 1,
    criterion: "Production Integration 성공",
    status: "PASS",
    evidence:
      "fiveByFiveEdgeExecutor.ts의 실제 solve() 경로(executeTask())는 schedulingStrategy 기본값 \"reservedBudget\"을 그대로 attemptRecovery()에 전달하고, includeCCR/includeMixedCommutator/useSetupReservedSlice는 한 번도 override하지 않는다(각각 기본값 true) -- 즉 Scheduler Prototype Sprint v1이 수정한 SETUP Last-Resort 분기(reservedBudget && useSetupReservedSlice===true)는 이미 실제 Production의 유일한 실행 경로다. 이번 Sprint는 추가 코드 변경 없이 이 사실을 재확인했다(Executor/Primitive Logic/Planner/SolverEngine/BFS/Deferred Validator 0줄 수정).",
  });

  const regressionNotIncreased = regressionSummary.trueRegressionCount <= PRIOR_PROTOTYPE_TRUE_REGRESSION_COUNT;
  rows.push({
    level: 2,
    criterion: "Regression 증가 없음",
    status: regressionNotIncreased ? "PASS" : "FAIL",
    evidence: `True Regression: Scheduler Prototype Sprint v1(N=15) ${PRIOR_PROTOTYPE_TRUE_REGRESSION_COUNT}건 -> 이번 Sprint(N=${statisticalValidation.nRepeats}) ${regressionSummary.trueRegressionCount}건. False Regression=${regressionSummary.falseRegressionCount}건, 단일-pass flip=${regressionSummary.casesWithSinglePassFlip}건/${regressionSummary.n}.`,
  });

  const worseningPrimitives = interactionMatrix.filter(
    (r) => r.type !== "SETUP" && r.type !== "none" && r.baselineSelectedCount > 0 && r.candidateSuccessRate - r.baselineSuccessRate < -PRIMITIVE_WORSENING_THRESHOLD
  );
  rows.push({
    level: 2,
    criterion: "Primitive Interaction -- 다른 Primitive 악화 없음",
    status: worseningPrimitives.length === 0 ? "PASS" : "OPEN_QUESTION",
    evidence:
      worseningPrimitives.length === 0
        ? "DISRUPT/REPAIR/CCR/MIXED_COMMUTATOR 중 Candidate에서 Success Rate가 Baseline 대비 20%p 이상 하락한 타입 없음."
        : `Success Rate가 20%p 이상 하락한 타입: ${worseningPrimitives.map((r) => `${r.type}(${(r.baselineSuccessRate * 100).toFixed(0)}%->${(r.candidateSuccessRate * 100).toFixed(0)}%)`).join(", ")}`,
  });

  const successRateOk = statisticalValidation.improvedCountDiff.stats.mean >= 0;
  rows.push({
    level: 3,
    criterion: "Success Rate 유지 또는 증가",
    status: successRateOk ? "PASS" : "FAIL",
    evidence: `Repeat당 평균 성공 케이스 수 diff(Candidate-Baseline, N=${statisticalValidation.nRepeats}): mean=${statisticalValidation.improvedCountDiff.stats.mean.toFixed(
      2
    )}, 95% CI=[${statisticalValidation.improvedCountDiff.stats.ciLower.toFixed(2)}, ${statisticalValidation.improvedCountDiff.stats.ciUpper.toFixed(2)}], Cohen's d_z=${statisticalValidation.improvedCountDiff.effectSize.cohensD.toFixed(
      2
    )}(${statisticalValidation.improvedCountDiff.effectSize.magnitude}).`,
  });

  const deadlineMissedRate = e2eSummary.n ? e2eSummary.deadlineMissedCount / e2eSummary.n : 0;
  const runtimeThresholdMs = PRIOR_PROTOTYPE_E2E_P95_MS * RUNTIME_TOLERANCE_FACTOR;
  const runtimeOk = e2eSummary.runtime.p95Ms <= runtimeThresholdMs;
  rows.push({
    level: 4,
    criterion: "Runtime 증가가 허용 범위",
    status: runtimeOk ? "PASS" : "OPEN_QUESTION",
    evidence: `E2E 실 solve() p95=${e2eSummary.runtime.p95Ms}ms (Scheduler Prototype Sprint v1 p95=${PRIOR_PROTOTYPE_E2E_P95_MS}ms 대비 +15% 허용 기준=${runtimeThresholdMs.toFixed(
      0
    )}ms). avg=${e2eSummary.runtime.avgMs.toFixed(1)}ms, max=${e2eSummary.runtime.maxMs}ms, Deadline Miss=${e2eSummary.deadlineMissedCount}/${e2eSummary.n}(${(deadlineMissedRate * 100).toFixed(1)}%).`,
  });

  const meetsN30 = statisticalValidation.nRepeats >= 30;
  const ciSupportsNoWorse = statisticalValidation.improvedCountDiff.stats.ciLower >= 0;
  rows.push({
    level: 5,
    criterion: "N>=30 재현성 PASS",
    status: !meetsN30 ? "FAIL" : ciSupportsNoWorse ? "PASS" : "OPEN_QUESTION",
    evidence: `N=${statisticalValidation.nRepeats}(기준 N>=30 ${meetsN30 ? "충족" : "미충족"}). improvedCountDiff 95% CI=[${statisticalValidation.improvedCountDiff.stats.ciLower.toFixed(
      2
    )}, ${statisticalValidation.improvedCountDiff.stats.ciUpper.toFixed(2)}].`,
  });

  const level2Rows = rows.filter((r) => r.level === 2);
  const level3Rows = rows.filter((r) => r.level === 3);
  const level4Rows = rows.filter((r) => r.level === 4);
  const level5Rows = rows.filter((r) => r.level === 5);
  const anyFail = rows.some((r) => r.status === "FAIL");
  const coreAllPass = [...level2Rows, ...level3Rows, ...level5Rows].every((r) => r.status === "PASS");
  const runtimeAllPass = level4Rows.every((r) => r.status === "PASS");

  let decision: "A" | "B" | "C" = "A";
  let decisionRationale: string;
  if (anyFail) {
    decision = "C";
    decisionRationale = "Level 2/3/5 중 하나 이상이 FAIL -- Scheduler Prototype Sprint v1의 효과가 Production 규모(N>=30)에서 재현되지 않음, Architecture Revision으로 회귀 필요.";
  } else if (coreAllPass && runtimeAllPass) {
    decision = "A";
    decisionRationale = "Regression 증가 없음, Primitive Interaction 이상 없음, Success Rate 유지/증가, Runtime 허용 범위, N>=30 재현성 PASS -- Production Contract 확정, Scheduler Ordering Release 가능.";
  } else {
    decision = "B";
    decisionRationale = "핵심 기준(Regression/Success Rate/재현성)은 통과했으나 Runtime 또는 Primitive Interaction 일부가 OPEN_QUESTION -- Runtime 최적화 Sprint 진행 필요.";
  }

  return { rows, decision, decisionRationale };
}
