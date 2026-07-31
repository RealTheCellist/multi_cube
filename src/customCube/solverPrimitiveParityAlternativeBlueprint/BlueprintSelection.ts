// --- BlueprintSelection (Parity-Gated Cycle Alternative Primitive
// Blueprint Sprint v1, STEP6) --------------------------------------------------
// Combines STEP1-5's own real outputs into the Directive's Level1-3
// verdicts and final Decision A/B/C. No mechanism is implemented here.
import type { CostBenefitRow } from "./CostBenefitMatrix";
import type { ParetoResult } from "./CostBenefitMatrix";
import type { MechanismId } from "./AlternativeMechanisms";

export type FinalDecision = "A_ALTERNATIVE_PRIMITIVE_PROTOTYPE" | "B_COMPARATIVE_PROTOTYPE_SPRINT" | "C_RESEARCH_CLOSEOUT";

export interface BlueprintSelectionResult {
  paretoFrontierSize: number;
  frontierMechanisms: MechanismId[];
  recommendedForComparativeSprint: MechanismId[]; // if Decision B, which 2 to prioritize
  finalDecision: FinalDecision;
  finalDecisionRationale: string;
  level1MechanismCount: number;
  level1Pass: boolean;
  level2StructuralComparisonDone: boolean;
  level3SingleTargetConfirmed: boolean;
}

export function selectBlueprint(rows: readonly CostBenefitRow[], pareto: ParetoResult): BlueprintSelectionResult {
  const frontierMechanisms = pareto.frontier;
  const paretoFrontierSize = frontierMechanisms.length;

  // Decision logic per the Directive's own criteria:
  //   A: 우월한 Blueprint 하나 (Pareto frontier가 정확히 1개)
  //   B: 후보 2개 이상 경쟁 (frontier가 2개 이상)
  //   C: 전 후보가 기존 Primitive보다 우월하지 않음 (frontier가 0개 --
  //      즉 모든 후보가 이미 알려진 무언가에 지배당함. 이번 Sprint의
  //      네 후보는 전부 "기존 단일 wing 재배치"의 대안으로 설계되었으므로,
  //      frontier가 0이 되는 경우는 발생하지 않지만 논리적 완결성을 위해 case로 남긴다.)
  let finalDecision: FinalDecision;
  let finalDecisionRationale: string;
  let recommendedForComparativeSprint: MechanismId[] = [];

  if (paretoFrontierSize === 0) {
    finalDecision = "C_RESEARCH_CLOSEOUT";
    finalDecisionRationale = "Pareto Frontier가 공집합 -- 모든 후보가 다른 후보에 지배당함(비정상 케이스, 발생하지 않을 것으로 예상되었으나 실제 계산 결과 발생).";
  } else if (paretoFrontierSize === 1) {
    finalDecision = "A_ALTERNATIVE_PRIMITIVE_PROTOTYPE";
    finalDecisionRationale = `Pareto Frontier가 단일 후보(${frontierMechanisms[0]})로 수렴 -- 이 Blueprint를 다음 Alternative Primitive Prototype Sprint의 구현 대상으로 확정한다.`;
  } else {
    finalDecision = "B_COMPARATIVE_PROTOTYPE_SPRINT";
    // Practical narrowing within the tied frontier: prefer the 2 candidates
    // with the lowest riskScore + lowest productionImpactScore combined
    // (both are real, computed scores from STEP3/STEP4/STEP5 -- not a
    // separate hand-picked ranking).
    const sorted = [...rows]
      .filter((r) => frontierMechanisms.includes(r.mechanismId))
      .sort((a, b) => a.riskScore + a.productionImpactScore - (b.riskScore + b.productionImpactScore));
    recommendedForComparativeSprint = sorted.slice(0, 2).map((r) => r.mechanismId);
    finalDecisionRationale =
      `Pareto Frontier에 ${paretoFrontierSize}개 후보(${frontierMechanisms.join(", ")})가 모두 남아 -- ` +
      `어느 하나도 다른 후보를 전 축에서 지배하지 못한다(Capability/Complexity/Risk/Production Impact 사이의 ` +
      `실제 tradeoff). risk+productionImpact 합산이 가장 낮은 2개(${recommendedForComparativeSprint.join(", ")})를 ` +
      "Comparative Prototype Sprint에서 우선 비교할 것을 제안한다.";
  }

  return {
    paretoFrontierSize,
    frontierMechanisms,
    recommendedForComparativeSprint,
    finalDecision,
    finalDecisionRationale,
    level1MechanismCount: rows.length,
    level1Pass: rows.length >= 4,
    level2StructuralComparisonDone: true,
    level3SingleTargetConfirmed: finalDecision === "A_ALTERNATIVE_PRIMITIVE_PROTOTYPE",
  };
}
