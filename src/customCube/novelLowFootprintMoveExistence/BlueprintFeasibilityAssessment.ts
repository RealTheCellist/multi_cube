// --- BlueprintFeasibilityAssessment (Novel Low-Footprint Move Existence
// Validation Sprint v1, Deliverable "Blueprint Feasibility Assessment",
// Success Criteria) ------------------------------------------------------
// Disclosed thresholds, fixed before evaluating any result:
//   - "존재" (existence): at least 1 of 28 PRIMARY cases has an accepted
//     (genuinely wrongWingCount-improving) construction with
//     footprintRatio <= FOOTPRINT_RATIO_TARGET (2.0, this arc's own
//     established Blueprint bar, reused verbatim for continuity).
//   - "공통 구조" (common structure): among cases where SOME improving
//     construction was found (regardless of footprint bar), one
//     StructureClassification label covers >= 60% of them (this arc's own
//     established dominance threshold, reused verbatim).
import type { DistributionSummary } from "./MinimalFootprintDistribution";
import type { StructureSummary } from "./StructureClassification";
import { FOOTPRINT_RATIO_TARGET } from "./MinimalFootprintDistribution";

export type FeasibilityDecision = "A_PROCEED_TO_PRIMITIVE_DESIGN" | "B_FAMILY_SPLIT_NEEDED" | "C_EXISTENCE_NOT_DEMONSTRATED";

export interface FeasibilityAssessmentResult {
  decision: FeasibilityDecision;
  decisionLabel: string;
  existenceConfirmed: boolean;
  lowFootprintAchievedCount: number;
  structureDominant: boolean;
  dominantLabel: string | null;
  dominantShare: number | null;
  rationale: string;
}

export function assessBlueprintFeasibility(distribution: DistributionSummary, structure: StructureSummary): FeasibilityAssessmentResult {
  const existenceConfirmed = distribution.lowFootprintAchievedCount >= 1;
  const structureDominant = structure.dominantLabel !== null && (structure.dominantShare ?? 0) >= 0.6;

  let decision: FeasibilityDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!existenceConfirmed) {
    decision = "C_EXISTENCE_NOT_DEMONSTRATED";
    decisionLabel = "Conclusion C -- 저-footprint Move의 존재를 입증하지 못했다";
    rationale = `28건 중 footprintRatio<=${FOOTPRINT_RATIO_TARGET}를 달성한 개선 구성이 0건 -- 4-part bracket commutator(BASE_ALG/FLIP_ALG/PARITY_ALG를 서로 다르게 conjugate한 두 사본의 진짜 commutator, 이전 Sprint의 단순 conjugation과 달리 A,B,A',B' 전체 구조)조차 저-footprint 해를 찾지 못함 -- 지금까지의 Primitive 연구 방향(기존 라이브러리의 조합/변형) 자체를 재검토해야 한다.`;
  } else if (!structureDominant) {
    decision = "B_FAMILY_SPLIT_NEEDED";
    decisionLabel = "Conclusion B -- 존재는 하지만 구조가 다양하다";
    rationale = `저-footprint 개선 구성이 ${distribution.lowFootprintAchievedCount}건 발견되었으나, 발견된 케이스들의 구조 분류가 하나의 label로 60% 이상 수렴하지 않음(최대 dominant share=${
      structure.dominantShare !== null ? (structure.dominantShare * 100).toFixed(1) + "%" : "N/A"
    }) -- Family 분할 연구가 필요하다.`;
  } else {
    decision = "A_PROCEED_TO_PRIMITIVE_DESIGN";
    decisionLabel = "Conclusion A -- 저-footprint Move가 실제로 존재하며 공통 구조가 있다";
    rationale = `저-footprint 개선 구성이 ${distribution.lowFootprintAchievedCount}건 발견되었고, 그중 ${(
      (structure.dominantShare ?? 0) * 100
    ).toFixed(1)}%가 '${structure.dominantLabel}' 구조로 수렴함 -- 새로운 Primitive 설계에 착수할 근거가 확보되었다.`;
  }

  return {
    decision,
    decisionLabel,
    existenceConfirmed,
    lowFootprintAchievedCount: distribution.lowFootprintAchievedCount,
    structureDominant,
    dominantLabel: structure.dominantLabel,
    dominantShare: structure.dominantShare,
    rationale,
  };
}
