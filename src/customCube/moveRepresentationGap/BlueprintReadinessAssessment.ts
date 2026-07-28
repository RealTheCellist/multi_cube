// --- BlueprintReadinessAssessment (Move Representation Gap Analysis
// Sprint v1, Deliverable #5, Success Criteria A/B/C) -------------------------
import type { RepresentationGapResult } from "./RepresentationGapMatrix";

export type GapConclusion = "A_GAP_CLEAR" | "B_OTHER_LAYER_BOTTLENECK" | "C_INSUFFICIENT_EVIDENCE";

export interface GapAssessmentResult {
  conclusion: GapConclusion;
  conclusionLabel: string;
  rationale: string;
}

// Same 60%-dominance-style convention this whole research arc has used
// repeatedly to distinguish a real, actionable population effect from
// noise (Recovery Necessity/Primitive Set Completeness/Primitive Family
// Prioritization/PURE_CYCLE_ISOLATION Sprints all used a comparable
// threshold).
const CLEAR_GAP_SHARE_THRESHOLD = 0.6;
const MIN_EVIDENCE_CASES = 5;

export function assessGapReadiness(gap: RepresentationGapResult): GapAssessmentResult {
  if (gap.totalCases < MIN_EVIDENCE_CASES) {
    return {
      conclusion: "C_INSUFFICIENT_EVIDENCE",
      conclusionLabel: "Conclusion C -- Representation Gap을 입증할 증거가 부족하다",
      rationale: `측정된 케이스가 ${gap.totalCases}건으로 최소 근거 기준(${MIN_EVIDENCE_CASES}건) 미만.`,
    };
  }

  if (gap.casesWithNoImprovingCandidateShare >= CLEAR_GAP_SHARE_THRESHOLD) {
    return {
      conclusion: "A_GAP_CLEAR",
      conclusionLabel: "Conclusion A -- 현재 Move Generator의 표현력 부족이 Residual Failure의 주요 원인이다",
      rationale: `${gap.totalCases}건 중 ${gap.casesWithNoImprovingCandidateAtAll}건(${(gap.casesWithNoImprovingCandidateShare * 100).toFixed(
        1
      )}%)에서 어떤 cycle hop의 후보도 wrongWingCount를 개선하지 못함 -- 임계치(${(CLEAR_GAP_SHARE_THRESHOLD * 100).toFixed(
        0
      )}%) 이상. 탐색 알고리즘(BP-1/CCR)이 아니라 이동 후보 생성 자체의 표현력 한계가 주 원인으로 확인됨. Move Representation Blueprint Sprint 착수 가능.`,
    };
  }

  return {
    conclusion: "B_OTHER_LAYER_BOTTLENECK",
    conclusionLabel: "Conclusion B -- Move Generator보다 다른 계층이 병목이다",
    rationale: `개선 후보가 전혀 없는 케이스는 ${gap.casesWithNoImprovingCandidateAtAll}/${gap.totalCases}건(${(
      gap.casesWithNoImprovingCandidateShare * 100
    ).toFixed(1)}%)로 임계치(${(CLEAR_GAP_SHARE_THRESHOLD * 100).toFixed(0)}%) 미만 -- 상당수 케이스에 개선 후보 자체는 존재하므로, 탐색 스케줄링/선택 로직 등 다른 계층을 재검토해야 한다.`,
  };
}
