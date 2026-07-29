// --- FinalRecommendation (Solver Primitive Set Completeness Validation
// Sprint v2, Success Criteria / Deliverable #6) ------------------------------
// Directive's own Success Criteria, applied in this fixed order (disclosed
// before running any measurement, per this arc's own convention):
//   A: explainableRate >= MEANINGFUL_CLOSURE_THRESHOLD (0.80, the Directive's
//      own stated number) AND no coherent NEW_FAMILY cluster found
//      -> "Primitive Discovery 종료 가능"
//   B: not A, but no coherent NEW_FAMILY cluster found either -- i.e. the
//      residual population is still explainable by existing structural
//      categories in principle, yet the current Gate/Budget configuration
//      of an EXISTING primitive (most plausibly CCR, whose Gate already
//      targets the single-component-isolated-cycle shape that
//      PURE_CYCLE_ISOLATION residuals fall into) is leaving some of them
//      unresolved -- room for Gate/Budget tuning, not new Primitive Family
//      research.
//   C: a coherent NEW_FAMILY cluster IS found (isCoherentCluster===true)
//      -> "새로운 Primitive Family 탐색 시작" regardless of explainableRate.
import type { ClosureSummary } from "./StructuralClosureAssessment";
import type { UnknownSignatureCheck } from "./StructuralClosureAssessment";

export const MEANINGFUL_CLOSURE_THRESHOLD = 0.8; // Directive's own explicit ">=80%"

export type FinalConclusion = "A_DISCOVERY_CLOSED" | "B_GATE_BUDGET_ROOM" | "C_NEW_PRIMITIVE_DISCOVERY";

export interface FinalRecommendationResult {
  conclusion: FinalConclusion;
  conclusionLabel: string;
  explainableRate: number;
  newFamilyFound: boolean;
  rationale: string;
}

export function recommendFinal(closure: ClosureSummary, unknownSignature: UnknownSignatureCheck): FinalRecommendationResult {
  const explainableRate = closure.explainableRate;
  const newFamilyFound = unknownSignature.isCoherentCluster;

  if (newFamilyFound) {
    return {
      conclusion: "C_NEW_PRIMITIVE_DISCOVERY",
      conclusionLabel: "Conclusion C -- 기존 Primitive Set으로 설명되지 않는 새로운 독립 Failure Family 발견. 새로운 Primitive Family 탐색을 시작한다.",
      explainableRate,
      newFamilyFound,
      rationale: `UNKNOWN 잔여 ${unknownSignature.n}건이 공통 구조 신호(${unknownSignature.sharedDescription})를 공유함 -- 우연한 산발적 사례가 아니라 일관된 새 형태로 판단.`,
    };
  }

  if (explainableRate >= MEANINGFUL_CLOSURE_THRESHOLD) {
    return {
      conclusion: "A_DISCOVERY_CLOSED",
      conclusionLabel: "Conclusion A -- 잔여 대부분이 기존 Primitive Set으로 구조적으로 설명되며, 새로운 독립 Family는 관측되지 않음. Primitive Discovery 종료 가능.",
      explainableRate,
      newFamilyFound,
      rationale: `explainableRate=${(explainableRate * 100).toFixed(1)}% >= ${(MEANINGFUL_CLOSURE_THRESHOLD * 100).toFixed(0)}% 기준 충족, newFamilyFound=false -- 이후 연구의 중심을 Primitive 발견에서 완전성 검증/엔지니어링 최적화로 이동 가능.`,
    };
  }

  return {
    conclusion: "B_GATE_BUDGET_ROOM",
    conclusionLabel: "Conclusion B -- 새로운 Primitive는 필요하지 않으나, 기존 Primitive의 Gate 또는 Budget에 개선 여지가 있음.",
    explainableRate,
    newFamilyFound,
    rationale: `explainableRate=${(explainableRate * 100).toFixed(
      1
    )}% < ${(MEANINGFUL_CLOSURE_THRESHOLD * 100).toFixed(0)}% 기준이나 newFamilyFound=false -- 잔여는 이미 이름 붙은 구조적 범주(PURE_CYCLE_ISOLATION 등) 안에 있어 새 Family 탐색보다 기존 Primitive(CCR 등)의 Gate/Budget 조정이 우선.`,
  };
}
