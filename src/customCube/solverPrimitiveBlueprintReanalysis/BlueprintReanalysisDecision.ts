// --- BlueprintReanalysisDecision (Solver Primitive Blueprint Reanalysis
// Sprint v1) -------------------------------------------------------------
// STEP5: compares the best NEW feature/combination candidate against each
// Primitive's OLD Blueprint precondition (cited from Primitive Blueprint
// Sprint v1 / Refinement Sprint v1), decides Level 1~3, and reaches this
// Sprint's own required A/B/C conclusion.
import type { CombinationResult } from "./FeatureCombinationAnalysis";

export interface PrimitiveReanalysis {
  primitiveName: string;
  oldBlueprint: CombinationResult;
  bestNew: CombinationResult | null;
  improvementPercentagePoints: number;
  level2Pass: boolean;
  level3Pass: boolean;
}

// A candidate with fewer than this many matched replays can't support a
// confident claim either way -- this whole project has repeatedly flagged
// small-N buckets as unable to support majority-vote/threshold claims
// (e.g. DatasetBiasReport's own UNDERREPRESENTED_THRESHOLD=2).
const MIN_SAMPLE_SIZE = 5;
const LEVEL3_IMPROVEMENT_THRESHOLD_PP = 15;

export function analyzePrimitive(primitiveName: string, results: readonly CombinationResult[]): PrimitiveReanalysis {
  const oldBlueprint = results.find((r) => r.isOldBlueprint)!;
  // isBareGate candidates (the Prototype's own hard-coded activation
  // condition, e.g. Multi-Hop Bridge's cycleLength gate or Conflict
  // Sacrifice's conflictEdgeCount>0) are excluded here -- restricting to a
  // necessary condition trivially "predicts" success (nothing outside it
  // can ever succeed by construction) and was already known/disclosed
  // before this Sprint, so it can't count as this Sprint's own discovery.
  const candidates = results.filter((r) => !r.isOldBlueprint && !r.isBareGate && r.matchedCount >= MIN_SAMPLE_SIZE);
  const bestNew = candidates.length ? candidates.reduce((best, c) => (c.successRate > best.successRate ? c : best)) : null;

  const improvementPercentagePoints = bestNew ? (bestNew.successRate - oldBlueprint.successRate) * 100 : 0;
  const level2Pass = !!bestNew && bestNew.successRate > oldBlueprint.successRate;
  const level3Pass = level2Pass && improvementPercentagePoints >= LEVEL3_IMPROVEMENT_THRESHOLD_PP;

  return { primitiveName, oldBlueprint, bestNew, improvementPercentagePoints, level2Pass, level3Pass };
}

export type FinalDecision = "A" | "B" | "C";

export interface ReanalysisOutcome {
  decision: FinalDecision;
  rationale: string;
}

export function decideOutcome(analyses: readonly PrimitiveReanalysis[]): ReanalysisOutcome {
  const anyLevel3 = analyses.some((a) => a.level3Pass);
  const anyLevel2 = analyses.some((a) => a.level2Pass);

  if (anyLevel3) {
    const winners = analyses.filter((a) => a.level3Pass);
    return {
      decision: "A",
      rationale: `${winners.map((a) => `${a.primitiveName}: "${a.bestNew?.name}"가 기존 Blueprint(${(a.oldBlueprint.successRate * 100).toFixed(1)}%) 대비 +${a.improvementPercentagePoints.toFixed(1)}%p 개선(${(a.bestNew!.successRate * 100).toFixed(1)}%, ${a.bestNew!.matchedCount}건 표본)`).join("; ")} -- 새 Blueprint를 확보할 명확한 근거가 있다.`,
    };
  }

  if (anyLevel2) {
    const partial = analyses.filter((a) => a.level2Pass);
    return {
      decision: "B",
      rationale: `${partial.map((a) => `${a.primitiveName}: "${a.bestNew?.name}"가 기존 Blueprint 대비 +${a.improvementPercentagePoints.toFixed(1)}%p 개선되긴 했지만 ${LEVEL3_IMPROVEMENT_THRESHOLD_PP}%p 기준에는 못 미친다(표본 ${a.bestNew?.matchedCount}건)`).join("; ")} -- 방향성은 있으나 근거가 아직 명확하지 않아 추가 데이터 분석이 필요하다.`,
    };
  }

  return {
    decision: "C",
    rationale: `${analyses.map((a) => `${a.primitiveName}: 어떤 Feature/조합도 기존 Blueprint(${(a.oldBlueprint.successRate * 100).toFixed(1)}%)보다 나은 설명력을 보이지 못함`).join("; ")} -- Feature 선택의 문제가 아니라 이 두 Primitive의 메커니즘 자체가 근본적으로 이 Failure 유형을 해결하지 못한다는 뜻일 가능성이 크다. Primitive 접근 자체의 한계로 판단한다.`,
  };
}
