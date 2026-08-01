// --- RootCauseDecision (Multi-Component Merge Production Integration
// Refinement Sprint v2, STEP6) -----------------------------------------------
// Resolves the Directive's own 3-hypothesis Decision (A: Outer Deadline is
// the direct bottleneck / B: partial effect, not sufficient / C: Primitive
// itself is fundamentally limited) from STEP2-5's own real outputs --
// judged by whether the paired-diff 95% CI excludes zero, never by raw
// counts alone (this arc's own repeatedly-enforced discipline).
import type { PairwiseComparison } from "./StatisticalValidation";
import type { FrameworkValidationResult } from "./ValidationFramework";
import type { ConsistencySummary } from "./ComparativeConsistency";
import type { DeadlineReplaySummary } from "./DeadlineReplay";

export type RootCauseDecision = "A_OUTER_DEADLINE_IS_BOTTLENECK" | "B_PARTIAL_NOT_SUFFICIENT" | "C_PRIMITIVE_LIMITATION";

export interface RootCauseMatrixRow {
  factor: string;
  evidence: string;
  contribution: "HIGH" | "MEDIUM" | "LOW" | "NONE";
}

export interface RootCauseDecisionResult {
  decision: RootCauseDecision;
  rationale: string;
  matrix: RootCauseMatrixRow[];
}

export function decideRootCause(
  armCVsArmA: PairwiseComparison,
  frameworkArmCVsArmA: FrameworkValidationResult,
  consistency: ConsistencySummary,
  replaySummary: DeadlineReplaySummary
): RootCauseDecisionResult {
  const significantRecovery = armCVsArmA.improvedCountDiff.stats.ciLower > 0;
  const frameworkPass = frameworkArmCVsArmA.pipelineResult.decision === "A";
  const anyRecoveryAtAll = replaySummary.armCNewCapabilityVsA > 0;
  // High consistency between the production Arm C path and Comparative
  // Prototype Sprint v1's own isolated 2000ms test means the production
  // pipeline's OTHER Primitives (competing for the same enlarged outer
  // deadline) are NOT meaningfully diluting what a truly isolated MCM
  // would achieve -- i.e. Arm C is a reasonably faithful stand-in for
  // "the Comparative Sprint's own success condition, reproduced in
  // production."
  const highConsistencyWithIsolatedTest = consistency.matchRate >= 0.8;

  let decision: RootCauseDecision;
  let rationale: string;

  if (significantRecovery && frameworkPass) {
    decision = "A_OUTER_DEADLINE_IS_BOTTLENECK";
    rationale = `Arm C(2000ms) vs Arm A(1000ms) improvedCountDiff 95% CI 하한>0 -- 통계적으로 유의한 회복 확인. Outer Deadline 확장만으로 Capability가 회복되므로 이를 직접 병목으로 확정, 새로운 Operating Contract(Outer Deadline 확장)를 채택한다.`;
  } else if (!significantRecovery && anyRecoveryAtAll && !highConsistencyWithIsolatedTest) {
    decision = "B_PARTIAL_NOT_SUFFICIENT";
    rationale = `일부 신규 rescue(armCNewCapabilityVsA=${replaySummary.armCNewCapabilityVsA}건)는 있으나 95% CI가 0을 포함해 통계적으로 유의하지 않고, Comparative Prototype Sprint v1의 독립 테스트와의 일치율도 ${(consistency.matchRate * 100).toFixed(1)}%로 낮아(다른 Primitive와의 경쟁이 여전히 결과를 흐리고 있음을 시사) Outer Deadline 확장만으로는 충분조건이 아니다 -- Refinement Sprint v3에서 추가 요인(다른 Primitive와의 경쟁 자체를 제거하는 조건)을 검증해야 한다.`;
  } else if (!significantRecovery && highConsistencyWithIsolatedTest) {
    decision = "C_PRIMITIVE_LIMITATION";
    rationale = `Arm C(2000ms, production 경로)가 Comparative Prototype Sprint v1의 독립 2000ms 테스트와 ${(consistency.matchRate * 100).toFixed(1)}% 일치했다 -- 즉 Production 경로에서도 사실상 그 Sprint가 측정한 조건에 근접하게 재현되었음에도, Arm A 대비 통계적으로 유의한 Capability 회복이 없었다(95% CI가 0 포함). Outer Deadline을 최대한 확장해도 Capability가 회복되지 않으므로 Primitive 자체의 구조적 한계로 결론짓고 Primitive Blueprint 단계로 회귀한다.`;
  } else {
    decision = "B_PARTIAL_NOT_SUFFICIENT";
    rationale = `증거가 혼재되어 있다(significantRecovery=${significantRecovery}, consistency=${(consistency.matchRate * 100).toFixed(1)}%) -- 확정적 결론을 내리기엔 이르므로 Refinement Sprint v3로 추가 검증한다.`;
  }

  const matrix: RootCauseMatrixRow[] = [
    {
      factor: "Outer Deadline 확장 효과 (Arm C vs Arm A)",
      evidence: `improvedCountDiff mean=${armCVsArmA.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${armCVsArmA.improvedCountDiff.stats.ciLower.toFixed(4)}, ${armCVsArmA.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${armCVsArmA.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${armCVsArmA.improvedCountDiff.effectSize.magnitude})`,
      contribution: significantRecovery ? "HIGH" : anyRecoveryAtAll ? "MEDIUM" : "NONE",
    },
    {
      factor: "Comparative Prototype 일치도",
      evidence: `matchRate=${(consistency.matchRate * 100).toFixed(1)}% (successMatch=${consistency.successMatchCount}, successMismatch=${consistency.successMismatchCount})`,
      contribution: highConsistencyWithIsolatedTest ? "HIGH" : "MEDIUM",
    },
    {
      factor: "Validation Framework(Category B) Decision",
      evidence: `${frameworkArmCVsArmA.pipelineResult.decision}: ${frameworkArmCVsArmA.pipelineResult.decisionRationale}`,
      contribution: frameworkPass ? "HIGH" : "LOW",
    },
  ];

  return { decision, rationale, matrix };
}
