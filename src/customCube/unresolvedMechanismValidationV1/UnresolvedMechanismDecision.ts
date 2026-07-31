// --- UnresolvedMechanismDecision (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP6) --------------------------
// Directive's own success criteria + Decision A/B/C:
//   Level1: >=80% of Residual classified (NOT TRULY_UNKNOWN)
//   Level2: Unknown 집합 추출 (always satisfied once computed -- a data-
//     availability check, no threshold given)
//   Level3: Unknown이 공통 메커니즘을 갖는지 확인 (dominant taxonomyClass
//     covers >=60% of the Unknown set)
//   Decision A: Unknown exists, Level1 FAILS (Unknown is a real chunk, not
//     noise), AND Level3 PASSES (that chunk shares a common structure) ->
//     genuine new-Primitive-Discovery candidate.
//   Decision B: Level1 PASSES (>=80% classified into existing-Primitive
//     causes) -> Unknown is negligible, existing-combination problem.
//   Decision C: Level1 FAILS AND Level3 FAILS (Unknown is a real chunk but
//     shares no common structure) -> can't design around it yet, revisit
//     State Taxonomy.
import type { ResidualClassificationResult } from "./ResidualClassification";
import type { CommonMechanismSummary } from "./CommonMechanismAnalysis";

export const LEVEL1_CLASSIFIED_THRESHOLD = 0.8;
export const LEVEL3_COMMON_MECHANISM_THRESHOLD = 0.6;

export interface DecisionResult {
  totalResidual: number;
  classifiedCount: number;
  classifiedFraction: number;
  level1Pass: boolean;
  level2Pass: boolean; // trivially true once the Unknown set + features exist
  level3Pass: boolean;
  decision: "A" | "B" | "C";
  rationale: string;
}

export function decideUnresolvedMechanism(classifications: readonly ResidualClassificationResult[], unknownSummary: CommonMechanismSummary): DecisionResult {
  const totalResidual = classifications.length;
  const classifiedCount = classifications.filter((c) => c.category !== "TRULY_UNKNOWN").length;
  const classifiedFraction = totalResidual > 0 ? classifiedCount / totalResidual : 1;

  const level1Pass = classifiedFraction >= LEVEL1_CLASSIFIED_THRESHOLD;
  const level2Pass = true; // Unknown set + features always successfully extracted once computed
  const level3Pass = unknownSummary.unknownCount > 0 && unknownSummary.dominantTaxonomyClassShare >= LEVEL3_COMMON_MECHANISM_THRESHOLD;

  let decision: "A" | "B" | "C";
  let rationale: string;

  if (level1Pass) {
    decision = "B";
    rationale = `Residual의 ${(classifiedFraction * 100).toFixed(1)}%가 기존 Primitive(단독/조합/순서/예산)로 설명된다(>=80% 기준 충족) -- Unknown 비중이 미미하다. 기존 Primitive 조합·스케줄링·예산 문제로 결론.`;
  } else if (unknownSummary.unknownCount > 0 && level3Pass) {
    decision = "A";
    rationale = `Residual의 ${(classifiedFraction * 100).toFixed(1)}%만 기존 Primitive로 설명되고(<80%), 나머지 Unknown ${unknownSummary.unknownCount}건 중 ${(unknownSummary.dominantTaxonomyClassShare * 100).toFixed(1)}%가 동일 Taxonomy Class(${unknownSummary.dominantTaxonomyClass})를 공유한다(>=60% 기준 충족) -- 공통 구조를 가진 진짜 미해결 메커니즘이 존재한다.`;
  } else {
    decision = "C";
    rationale = `Residual의 ${(classifiedFraction * 100).toFixed(1)}%만 기존 Primitive로 설명되고(<80%), 나머지 Unknown ${unknownSummary.unknownCount}건이 공통 메커니즘을 공유하지 않는다(dominant class share ${(unknownSummary.dominantTaxonomyClassShare * 100).toFixed(1)}% < 60%) -- 분류 불가능. 현재 State Taxonomy 자체의 재검토가 필요하다.`;
  }

  return { totalResidual, classifiedCount, classifiedFraction, level1Pass, level2Pass, level3Pass, decision, rationale };
}
