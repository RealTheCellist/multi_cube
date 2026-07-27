// --- ResearchRecommendation (Solver Primitive Set Completeness Validation
// Sprint v1, Deliverable #5 + Success Criteria A/B/C) ------------------------
import type { PrimitiveCoverageSummary } from "./PrimitiveCoverageMatrix";
import type { ResidualClassSummary } from "./ResidualFailureTaxonomy";

export type SetCompletenessConclusion = "A_CURRENT_SET_SUFFICIENT" | "B_EXTEND_EXISTING_PRIMITIVE" | "C_NEW_PRIMITIVE_FAMILY_NEEDED";

export interface ResearchRecommendationResult {
  conclusion: SetCompletenessConclusion;
  conclusionLabel: string;
  rationale: string;
}

// Matches this research arc's own precedent for "meaningful population
// effect" (Recovery Necessity Validation Sprint v1's 5%/2.1% distinction,
// CCR Completeness Validation Sprint v1's own 5% threshold).
const MEANINGFUL_RESIDUAL_SHARE = 0.05;
// RQ-3's "one structure vs several independent structures": if the single
// largest residual class already accounts for the bulk of the residual
// population, the remaining Population is structurally homogeneous enough
// that extending ONE existing primitive's reach plausibly covers it
// (Conclusion B). If no single class dominates (multiple comparably-sized,
// structurally distinct classes), a single extension cannot cover all of
// them -- a genuinely new Primitive Family is the only fit (Conclusion C).
const DOMINANT_CLASS_SHARE_OF_RESIDUAL = 0.6;

export function recommendResearch(coverage: PrimitiveCoverageSummary, residualClasses: ResidualClassSummary[]): ResearchRecommendationResult {
  const residualShare = coverage.totalCases ? coverage.residualCount / coverage.totalCases : 0;

  if (residualShare < MEANINGFUL_RESIDUAL_SHARE) {
    return {
      conclusion: "A_CURRENT_SET_SUFFICIENT",
      conclusionLabel: "Conclusion A -- 현재 Primitive Set이 Failure Population 대부분을 구조적으로 설명한다",
      rationale: `잔여 미해결 ${coverage.residualCount}/${coverage.totalCases}건(${(residualShare * 100).toFixed(1)}%)은 이 연구 계열의 유의미성 임계치(${(
        MEANINGFUL_RESIDUAL_SHARE * 100
      ).toFixed(0)}%) 미만 -- 현재 5개 Primitive(BASE/FLIP/CASE/PARITY/CCR)의 Union Coverage가 이미 압도적 다수를 설명한다.`,
    };
  }

  const totalResidual = residualClasses.reduce((a, c) => a + c.n, 0);
  const dominant = [...residualClasses].sort((a, b) => b.n - a.n)[0];
  const dominantShare = totalResidual ? (dominant?.n ?? 0) / totalResidual : 0;

  if (dominantShare >= DOMINANT_CLASS_SHARE_OF_RESIDUAL) {
    return {
      conclusion: "B_EXTEND_EXISTING_PRIMITIVE",
      conclusionLabel: "Conclusion B -- 기존 Primitive 확장만으로 남은 Population을 설명할 수 있다",
      rationale: `잔여 ${coverage.residualCount}건(${(residualShare * 100).toFixed(1)}%) 중 단일 구조 클래스 ${dominant?.failureClass}가 ${(dominantShare * 100).toFixed(
        1
      )}%를 차지 -- 미해결 Population이 구조적으로 단일하다(RQ-3: 하나의 구조). 새 Primitive Family 없이 해당 구조를 겨냥한 기존 Primitive 확장 연구로 충분.`,
    };
  }

  return {
    conclusion: "C_NEW_PRIMITIVE_FAMILY_NEEDED",
    conclusionLabel: "Conclusion C -- 현재 Primitive Set으로는 설명 불가능한 독립적인 Failure Class가 존재한다",
    rationale: `잔여 ${coverage.residualCount}건(${(residualShare * 100).toFixed(1)}%)이 ${
      residualClasses.length
    }개의 서로 다른 구조 클래스로 나뉘며, 어느 하나도 지배적이지 않다(최대 클래스 ${dominant?.failureClass} 비중 ${(dominantShare * 100).toFixed(
      1
    )}%, 임계치 ${(DOMINANT_CLASS_SHARE_OF_RESIDUAL * 100).toFixed(0)}% 미만) -- 미해결 Population이 구조적으로 여러 독립 구조(RQ-3)로 구성되어, 단일 Primitive 확장으로는 전체를 포괄할 수 없다.`,
  };
}
