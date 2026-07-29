// --- Recommendation (CONFLICT_DEEP_DEPENDENCY Structural Mechanism
// Analysis Sprint v1, Success Criteria / Deliverable #5) ---------------------
// Directive's own Success Criteria, applied in this fixed order (disclosed
// before running any measurement):
//   A: a single dominant mechanism explains >=60% of the 16 cases (uniform
//      FailureReason signature across Primitives), OR the population
//      splits into clearly separated Subtypes (>=2 Subtypes with >=2
//      members each) -- AND a next-Blueprint direction can be stated.
//   B: partial explanation only -- some per-Primitive dominant reason is
//      found (>=1 Primitive has a reason covering >=60% of cases) but the
//      cross-Primitive mechanism signature is too scattered (<60% dominant
//      AND no clean Subtype separation) for a single coherent story.
//   C: neither condition holds at all -- current ConflictGraphFeatures
//      cannot explain the observed failure pattern; a new measurement
//      framework is needed before any Blueprint work.
import type { MechanismSummaryResult } from "./MechanismSummary";
import type { SubtypeSummary } from "./SubtypeClassification";
import { hasCleanSubtypeSeparation } from "./SubtypeClassification";
import type { PrimitiveDominantReason } from "./FailureMatrix";

export type MechanismConclusion = "A_MECHANISM_IDENTIFIED" | "B_PARTIAL_EXPLANATION" | "C_NEW_FRAMEWORK_NEEDED";

export interface RecommendationResult {
  conclusion: MechanismConclusion;
  conclusionLabel: string;
  isSingleDominantMechanism: boolean;
  hasSubtypeSeparation: boolean;
  rationale: string;
  nextStepDirection: string;
}

export function recommendMechanism(mechanism: MechanismSummaryResult, subtypeSummaries: readonly SubtypeSummary[], perPrimitiveDominant: readonly PrimitiveDominantReason[]): RecommendationResult {
  const hasSubtypeSeparation = hasCleanSubtypeSeparation(subtypeSummaries);
  const isSingleDominantMechanism = mechanism.isSingleDominantMechanism;

  if (isSingleDominantMechanism || hasSubtypeSeparation) {
    const direction = isSingleDominantMechanism
      ? `모든 사례가 사실상 동일한 실패 시그니처(${mechanism.dominantGroup.signature})를 공유 -- Gate 기반 3개 Primitive(REPAIR/CCR/MIXED_COMMUTATOR)는 구조적으로 cycle을 요구해 conflict-only DAG를 원천적으로 배제하고, Gate 없는 2개(DISRUPT/SETUP)는 탐색 능력 부족으로 실패. 다음 Blueprint는 "cycle 없이 CONFLICT-only DAG를 직접 순회하는 새 Primitive"를 목표로 설계 가능.`
      : `Subtype이 명확히 분리됨(${subtypeSummaries.map((s) => `${s.subtype}=${s.n}`).join(", ")}) -- Subtype별로 별도 Blueprint 방향을 설계 가능 (예: LINEAR_CHAIN은 단순 순차 해결 Primitive, BRANCHING/MULTI_COMPONENT은 더 복잡한 순회 전략 필요).`;
    return {
      conclusion: "A_MECHANISM_IDENTIFIED",
      conclusionLabel: "Conclusion A -- 단일 지배적 메커니즘 또는 명확히 분리된 Subtype 확인, 다음 Blueprint 방향 제시 가능.",
      isSingleDominantMechanism,
      hasSubtypeSeparation,
      rationale: `dominantGroup.share=${(mechanism.dominantGroup.share * 100).toFixed(1)}% (>=60% 기준: ${isSingleDominantMechanism}), hasSubtypeSeparation=${hasSubtypeSeparation}.`,
      nextStepDirection: direction,
    };
  }

  const anyPrimitiveDominant = perPrimitiveDominant.some((p) => p.dominantShare >= 0.6);
  if (anyPrimitiveDominant) {
    return {
      conclusion: "B_PARTIAL_EXPLANATION",
      conclusionLabel: "Conclusion B -- 메커니즘이 일부 설명되지만 추가 계측이 필요.",
      isSingleDominantMechanism,
      hasSubtypeSeparation,
      rationale: `dominantGroup.share=${(mechanism.dominantGroup.share * 100).toFixed(
        1
      )}% (<60%) AND hasSubtypeSeparation=false -- 이나, 개별 Primitive 단위로는 dominant reason이 존재(${perPrimitiveDominant
        .filter((p) => p.dominantShare >= 0.6)
        .map((p) => `${p.primitive}=${p.dominantReason}(${(p.dominantShare * 100).toFixed(0)}%)`)
        .join(", ")}). Cross-Primitive 통합 메커니즘 서술을 위해 추가 Feature 또는 더 세밀한 Failure Reason 분해가 필요.`,
      nextStepDirection: "각 Primitive별 dominant reason은 확인되었으나 population 전체를 아우르는 단일 서술이 부족하다 -- Subtype 경계를 더 세분화하거나 새로운 구조적 Feature를 추가하는 후속 계측 Sprint를 권고.",
    };
  }

  return {
    conclusion: "C_NEW_FRAMEWORK_NEEDED",
    conclusionLabel: "Conclusion C -- 현재 Feature만으로는 설명 불가능, 새 계측 Framework 필요.",
    isSingleDominantMechanism,
    hasSubtypeSeparation,
    rationale: `dominantGroup.share=${(mechanism.dominantGroup.share * 100).toFixed(1)}% (<60%), hasSubtypeSeparation=false, 개별 Primitive dominant reason도 없음 -- 현재 ConflictGraphFeatures/FailureReason taxonomy로는 관측된 실패 패턴을 설명할 수 없음.`,
    nextStepDirection: "새로운 구조적 Feature 정의 및 더 세밀한 Shadow 계측(예: 각 탐색 단계별 leavesExplored/nodesVisited)이 필요.",
  };
}
