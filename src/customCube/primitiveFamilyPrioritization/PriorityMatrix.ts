// --- PriorityMatrix (Primitive Family Prioritization Sprint v1, Required
// Analysis #4, Deliverable #3/#4/#5) -----------------------------------------
// Disclosed rubric, fixed BEFORE any family's score is computed (per the
// Directive's own "평가 기준은 Sprint 시작 전에 명시하고, 모든 Family에
// 동일하게 적용한다"), applied identically to all 3 families:
//
//   1. Population Size            -- raw residual case count, normalized
//                                     by the max across the 3 families.
//   2. Structural Independence     -- OverlapMatrix's own measured rate
//                                     (share of this family's condition-
//                                     satisfying cases that satisfy ONLY
//                                     this condition), normalized by max.
//   3. Existing Prior Art          -- REAL measured success rate of an
//                                     existing, unintegrated prototype
//                                     tested directly against this
//                                     family's residual cases (not a
//                                     binary "exists/doesn't"), normalized
//                                     by max.
//   4. Expected Impact             -- estimated Union Coverage gain if
//                                     this family were fully solved,
//                                     as a share of the FULL 142-case
//                                     population, normalized by max.
//   5. Research Complexity         -- inverse of avgDependencyDepth (this
//                                     family's own measured structural
//                                     feature, reused from
//                                     ResidualFailureTaxonomy.ts) --
//                                     shallower dependency chains score
//                                     higher (simpler to research).
//
// All 5 criteria are weighted EQUALLY (20% each, 1.0 total) -- a single,
// disclosed, uniform weighting scheme decided here rather than tuned
// per-family afterward.
import type { FamilyROI } from "./ExpectedROI";

const CRITERION_WEIGHT = 0.2;

export interface FamilyPriorityScore {
  failureClass: FamilyROI["failureClass"];
  populationSizeScore: number;
  structuralIndependenceScore: number;
  priorArtScore: number;
  expectedImpactScore: number;
  researchComplexityScore: number;
  totalScore: number; // sum of the 5 weighted criteria, max 1.0
}

function normalizeByMax(values: number[]): number[] {
  const max = Math.max(...values, 0);
  return max > 0 ? values.map((v) => v / max) : values.map(() => 0);
}

export function buildPriorityMatrix(rois: FamilyROI[], avgDependencyDepthByClass: Record<string, number>): FamilyPriorityScore[] {
  const populationScores = normalizeByMax(rois.map((r) => r.populationSize));
  const independenceScores = normalizeByMax(rois.map((r) => r.structuralIndependenceRate));
  const priorArtScores = normalizeByMax(rois.map((r) => r.priorArtRealSuccessRate));
  const impactScores = normalizeByMax(rois.map((r) => r.estimatedCoverageGainIfFullySolved));

  // Inverse: shallower dependency chains (lower depth) score HIGHER --
  // normalize depths by max, then invert (1 - normalized).
  const depths = rois.map((r) => avgDependencyDepthByClass[r.failureClass] ?? 0);
  const normalizedDepths = normalizeByMax(depths);
  const complexityScores = normalizedDepths.map((d) => 1 - d);

  return rois.map((r, i) => {
    const populationSizeScore = populationScores[i];
    const structuralIndependenceScore = independenceScores[i];
    const priorArtScore = priorArtScores[i];
    const expectedImpactScore = impactScores[i];
    const researchComplexityScore = complexityScores[i];
    const totalScore =
      CRITERION_WEIGHT * populationSizeScore +
      CRITERION_WEIGHT * structuralIndependenceScore +
      CRITERION_WEIGHT * priorArtScore +
      CRITERION_WEIGHT * expectedImpactScore +
      CRITERION_WEIGHT * researchComplexityScore;
    return { failureClass: r.failureClass, populationSizeScore, structuralIndependenceScore, priorArtScore, expectedImpactScore, researchComplexityScore, totalScore };
  });
}

export interface ResearchRoadmapEntry {
  priority: number; // 1 = highest
  failureClass: FamilyROI["failureClass"];
  totalScore: number;
}

export function buildResearchRoadmap(scores: FamilyPriorityScore[]): ResearchRoadmapEntry[] {
  return [...scores]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((s, i) => ({ priority: i + 1, failureClass: s.failureClass, totalScore: s.totalScore }));
}

export type FinalPriorityRecommendation = "A_PURE_CYCLE_ISOLATION_FIRST" | "B_CONFLICT_DEEP_DEPENDENCY_FIRST" | "C_BRIDGE_MISSING_FIRST";

export interface FinalRecommendationResult {
  recommendation: FinalPriorityRecommendation;
  recommendationLabel: string;
  rationale: string;
}

export function decideFinalRecommendation(roadmap: ResearchRoadmapEntry[], scores: FamilyPriorityScore[]): FinalRecommendationResult {
  const top = roadmap[0];
  const topScore = scores.find((s) => s.failureClass === top.failureClass)!;

  const mapping: Record<string, { rec: FinalPriorityRecommendation; label: string }> = {
    PURE_CYCLE_ISOLATION: { rec: "A_PURE_CYCLE_ISOLATION_FIRST", label: "A -- PURE_CYCLE_ISOLATION부터 연구" },
    CONFLICT_DEEP_DEPENDENCY: { rec: "B_CONFLICT_DEEP_DEPENDENCY_FIRST", label: "B -- CONFLICT_DEEP_DEPENDENCY부터 연구" },
    BRIDGE_MISSING: { rec: "C_BRIDGE_MISSING_FIRST", label: "C -- BRIDGE_MISSING부터 연구" },
  };
  const chosen = mapping[top.failureClass];

  return {
    recommendation: chosen.rec,
    recommendationLabel: chosen.label,
    rationale: `${top.failureClass}가 5개 균등가중 기준(인구 규모=${topScore.populationSizeScore.toFixed(2)}, 구조적 독립성=${topScore.structuralIndependenceScore.toFixed(
      2
    )}, 기존 Prior Art 실측 성공률=${topScore.priorArtScore.toFixed(2)}, 기대 효과=${topScore.expectedImpactScore.toFixed(2)}, 연구 복잡도(역산)=${topScore.researchComplexityScore.toFixed(
      2
    )}) 종합 점수 ${top.totalScore.toFixed(3)}으로 최우선.`,
  };
}
