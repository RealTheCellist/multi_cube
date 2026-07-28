// --- MechanismAssessment (Mixed Commutator Design Space Validation
// Sprint v1, Deliverable #5, Success Criteria) ----------------------------
// Disclosed thresholds, fixed before evaluating any result:
//   - Conclusion A: global min footprintRatio (across the WHOLE expanded
//     design space) <= 2.0, OR a "comparable repeatable result" defined
//     as >=3 distinct cases independently reaching <=2.2 (a disclosed,
//     generous near-miss band, reused nowhere else, chosen because it is
//     10% above the literal 2.0 bar -- not tuned post-hoc).
//   - Conclusion B: footprint improves stage-over-stage (global min keeps
//     dropping as design space grows) but does not cross the Conclusion A
//     bar -- a real but insufficient improvement, with no evidence of a
//     firm floor yet.
//   - Conclusion C: global min does NOT improve beyond Novel Low-Footprint
//     Move Existence Validation Sprint v1's own already-found 2.33 despite
//     the expanded design space (mixed pattern + longer setups) -- a real
//     structural floor, not a search-budget artifact.
import type { StagePoint } from "./ConvergenceAnalysis";
import type { LimitingFactorResult } from "./LimitingFactorAnalysis";

export type MechanismDecision = "A_SUFFICIENT_DESIGN_SPACE" | "B_PARTIAL_VALIDITY" | "C_STRUCTURAL_LIMIT_CONFIRMED";

export interface MechanismAssessmentResult {
  decision: MechanismDecision;
  decisionLabel: string;
  globalMinFootprintRatio: number | null;
  nearMissCaseCount: number; // distinct cases reaching <= 2.2
  priorSprintBest: number;
  improvedBeyondPrior: boolean;
  rationale: string;
}

const CONCLUSION_A_TARGET = 2.0;
const NEAR_MISS_BAND = 2.2;
const NEAR_MISS_MIN_COUNT = 3;
const PRIOR_SPRINT_BEST = 2.33; // Novel Low-Footprint Move Existence Validation Sprint v1's own best result

export function assessMechanism(finalStage: StagePoint, nearMissCaseCount: number, limitingFactor: LimitingFactorResult): MechanismAssessmentResult {
  const globalMinFootprintRatio = finalStage.globalMinFootprintRatio;
  const improvedBeyondPrior = globalMinFootprintRatio !== null && globalMinFootprintRatio < PRIOR_SPRINT_BEST;

  let decision: MechanismDecision;
  let decisionLabel: string;
  let rationale: string;

  const hitsTargetDirectly = globalMinFootprintRatio !== null && globalMinFootprintRatio <= CONCLUSION_A_TARGET;
  const hitsRepeatableNearMiss = nearMissCaseCount >= NEAR_MISS_MIN_COUNT;

  if (hitsTargetDirectly || hitsRepeatableNearMiss) {
    decision = "A_SUFFICIENT_DESIGN_SPACE";
    decisionLabel = "Conclusion A -- Bracket Commutator는 충분한 설계 공간을 가진다. Prototype 확장 가능.";
    rationale = `globalMinFootprintRatio=${globalMinFootprintRatio?.toFixed(2) ?? "N/A"} (목표 <=${CONCLUSION_A_TARGET}), near-miss(<=${NEAR_MISS_BAND}) 케이스 ${nearMissCaseCount}건(기준 ${NEAR_MISS_MIN_COUNT}건) -- 확장된 설계 공간에서 목표 또는 이에 준하는 반복 가능한 결과를 확보했다.`;
  } else if (improvedBeyondPrior) {
    decision = "B_PARTIAL_VALIDITY";
    decisionLabel = "Conclusion B -- 부분적으로만 유효하다. 보조 Primitive로 유지.";
    rationale = `globalMinFootprintRatio=${globalMinFootprintRatio?.toFixed(2) ?? "N/A"}가 이전 Sprint의 2.33보다 개선되었으나 목표(${CONCLUSION_A_TARGET}) 또는 near-miss 기준(${NEAR_MISS_MIN_COUNT}건 <=${NEAR_MISS_BAND})에는 미달 -- Footprint는 개선되지만 명확한 하한에 아직 수렴하지 않았다.`;
  } else {
    decision = "C_STRUCTURAL_LIMIT_CONFIRMED";
    decisionLabel = "Conclusion C -- 설계 공간을 충분히 탐색해도 구조적 한계가 확인된다. Bracket 연구 종료.";
    rationale = `globalMinFootprintRatio=${globalMinFootprintRatio?.toFixed(2) ?? "N/A"}가 이전 Sprint의 2.33을 넘어서지 못했다 -- Mixed Pattern(${limitingFactor.mixedPatternImproved ? "개선함" : "개선 못함"})과 Setup 길이 확장(${limitingFactor.setupLengthImproved ? "개선함" : "개선 못함"}) 모두 시도했음에도 한계 요인은 '${limitingFactor.limitingFactor}'로 귀속된다: ${limitingFactor.rationale}`;
  }

  return { decision, decisionLabel, globalMinFootprintRatio, nearMissCaseCount, priorSprintBest: PRIOR_SPRINT_BEST, improvedBeyondPrior, rationale };
}
