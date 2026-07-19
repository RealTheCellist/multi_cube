// --- PrimitiveBlueprintSelection (Solver Primitive Blueprint Refinement
// Sprint v1) -------------------------------------------------------------
// STEP5: reaches this Sprint's required A/B/C conclusion:
//   A. Prototype 진행 가능 -- refined genuine-novelty Union Coverage >=40%.
//   B. Blueprint 추가 보완 필요 -- improved over Blueprint Sprint v1 but
//      still short of 40%.
//   C. Primitive 연구 종료 -- refinement produced negligible improvement,
//      or the Gap looks like multiple independent problems rather than
//      something a small candidate set can describe.
import type { CoverageOptimizationReport } from "./CoverageOptimization";

export type FinalDecision = "A" | "B" | "C";

export const SUBSTANTIAL_COVERAGE_THRESHOLD = 0.4;
const NEGLIGIBLE_IMPROVEMENT_PP_THRESHOLD = 5; // <5%p improvement over Blueprint Sprint v1's 26.0% counts as "refinement didn't help"

export interface BlueprintSelectionDecision {
  decision: FinalDecision;
  rationale: string;
}

export function selectBlueprint(report: CoverageOptimizationReport): BlueprintSelectionDecision {
  const { genuineUnionCoverageRate, deltaPercentagePoints, beforeRefinementRate } = report;

  if (genuineUnionCoverageRate >= SUBSTANTIAL_COVERAGE_THRESHOLD) {
    return {
      decision: "A",
      rationale: `Refined 신규 Union Coverage ${(genuineUnionCoverageRate * 100).toFixed(1)}%로 40% 기준을 충족했다(Blueprint Sprint v1 26.0% 대비 ${deltaPercentagePoints >= 0 ? "+" : ""}${deltaPercentagePoints.toFixed(1)}%p) -- Prototype 진행이 가능하다.`,
    };
  }

  if (deltaPercentagePoints < NEGLIGIBLE_IMPROVEMENT_PP_THRESHOLD) {
    return {
      decision: "C",
      rationale: `Preconditions를 완화하고 후보를 확장해도 신규 Union Coverage가 ${(genuineUnionCoverageRate * 100).toFixed(1)}%로, Blueprint Sprint v1(${(beforeRefinementRate * 100).toFixed(1)}%) 대비 ${deltaPercentagePoints.toFixed(1)}%p밖에 개선되지 않았다 -- Research Exit Criteria(반복 개선해도 40% 미달)에 해당해 Primitive 연구 트랙을 종료할 근거가 된다.`,
    };
  }

  return {
    decision: "B",
    rationale: `Refined 신규 Union Coverage ${(genuineUnionCoverageRate * 100).toFixed(1)}%로 Blueprint Sprint v1(${(beforeRefinementRate * 100).toFixed(1)}%) 대비 ${deltaPercentagePoints >= 0 ? "+" : ""}${deltaPercentagePoints.toFixed(1)}%p 개선됐지만 40% 기준에는 아직 못 미친다 -- 추가 Blueprint 보완이 필요하다.`,
  };
}
