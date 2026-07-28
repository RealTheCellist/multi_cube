// --- BlueprintReadinessAssessment (PURE_CYCLE_ISOLATION Structural
// Mechanism Analysis Sprint v1, Deliverable #5, Success Criteria A/B/C) -----
import type { SubtypeSummary } from "./SubtypeDiscovery";

export type ReadinessConclusion = "A_COMMON_MECHANISM_IDENTIFIED" | "B_MULTIPLE_SUBTYPES_NEED_SEPARATE_RESEARCH" | "C_INSUFFICIENT_DATA";

export interface ReadinessAssessmentResult {
  conclusion: ReadinessConclusion;
  conclusionLabel: string;
  rationale: string;
}

// Same 60%-dominance convention Solver Primitive Set Completeness
// Validation Sprint v1 and Primitive Family Prioritization Sprint v1 both
// already used for "is this one structure, or several".
const DOMINANT_SUBTYPE_SHARE = 0.6;

export function assessBlueprintReadiness(subtypes: SubtypeSummary[], totalCases: number): ReadinessAssessmentResult {
  if (totalCases === 0) {
    return {
      conclusion: "C_INSUFFICIENT_DATA",
      conclusionLabel: "Conclusion C -- 현재 데이터만으로는 공통 메커니즘을 정의할 수 없다",
      rationale: "측정된 PURE_CYCLE_ISOLATION 케이스가 없다.",
    };
  }

  const dominant = [...subtypes].sort((a, b) => b.n - a.n)[0];
  const dominantShare = dominant.n / totalCases;

  if (dominantShare >= DOMINANT_SUBTYPE_SHARE) {
    return {
      conclusion: "A_COMMON_MECHANISM_IDENTIFIED",
      conclusionLabel: "Conclusion A -- PURE_CYCLE_ISOLATION의 공통 실패 메커니즘이 규명되었다",
      rationale: `단일 Subtype(${dominant.subtype})이 전체의 ${(dominantShare * 100).toFixed(1)}%를 차지 -- 하나의 공통 구조적 원인으로 대부분을 설명 가능. Blueprint Sprint 착수 가능.`,
    };
  }

  return {
    conclusion: "B_MULTIPLE_SUBTYPES_NEED_SEPARATE_RESEARCH",
    conclusionLabel: "Conclusion B -- 여러 Subtype이 존재한다",
    rationale: `${subtypes.length}개의 Subtype으로 나뉘며 최대 Subtype(${dominant.subtype})도 ${(dominantShare * 100).toFixed(
      1
    )}%로 지배적이지 않다(임계치 ${(DOMINANT_SUBTYPE_SHARE * 100).toFixed(0)}%) -- 단일 Blueprint로 전체를 포괄할 수 없으며, Subtype별 개별 연구가 필요하다.`,
  };
}
