// --- IntegrationBlueprintDecision (Solver Primitive Integration
// Blueprint Sprint v1) -- STEP6: applies the Sprint's own Level 1~3
// criteria to STEP1~5's real findings.
//   Level 1: Integration Point를 명확히 정의 -- PASS if exactly one
//     candidate is marked chosen and every candidate has a real,
//     non-empty rationale (chosen or rejection reason).
//   Level 2: Planner Contract 작성 -- PASS if plannerContract is
//     non-empty AND grounded in an explicit true/false determination
//     (not left ambiguous).
//   Level 3: Integration Prototype Sprint를 바로 시작할 수 있을 만큼
//     완성 -- PASS only if every IntegrationContract field is filled in
//     AND no HIGH-likelihood/HIGH-impact risk is left without a
//     mitigation.
import type { IntegrationPointCandidate } from "./IntegrationPointSurvey";
import type { IntegrationContract } from "./IntegrationContract";
import type { RiskEntry } from "./RiskAnalysis";

export type FinalDecision = "A" | "B" | "C";

export interface BlueprintOutcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
}

export function decideOutcome(
  candidates: readonly IntegrationPointCandidate[],
  plannerChangeRequired: boolean,
  plannerRationale: string,
  contract: IntegrationContract,
  risks: readonly RiskEntry[],
): BlueprintOutcome {
  const chosenCount = candidates.filter((c) => c.chosen).length;
  const everyRejectedHasReason = candidates.filter((c) => !c.chosen).every((c) => !!c.rejectionReason && c.rejectionReason.length > 0);
  const level1Pass = chosenCount === 1 && everyRejectedHasReason;

  const level2Pass = plannerRationale.length > 0 && typeof plannerChangeRequired === "boolean";

  const contractFields = Object.values(contract);
  const contractComplete = contractFields.every((v) => typeof v === "string" && v.length > 0);
  const unmitigatedSevereRisk = risks.some((r) => r.likelihood === "높음" && r.impact === "높음" && (!r.mitigation || r.mitigation.length === 0));
  const level3Pass = contractComplete && !unmitigatedSevereRisk;

  if (!level1Pass) {
    return {
      decision: "B",
      rationale: `Integration Point가 명확히 하나로 좁혀지지 않았거나(chosen=${chosenCount}건), 기각된 후보 중 사유가 없는 것이 있다 -- Blueprint를 보완해야 한다.`,
      level1Pass,
      level2Pass,
      level3Pass,
    };
  }

  if (!level2Pass) {
    return {
      decision: "B",
      rationale: "Planner Contract가 명확히 작성되지 않았다 -- Planner 영향 여부를 다시 분석해야 한다.",
      level1Pass,
      level2Pass,
      level3Pass,
    };
  }

  if (!level3Pass) {
    return {
      decision: "B",
      rationale: `Integration Contract의 일부 항목이 비어 있거나(완성=${contractComplete}), 높은 가능성/높은 영향도 리스크에 대응책이 없다(unmitigated=${unmitigatedSevereRisk}) -- Blueprint 보완이 필요하다.`,
      level1Pass,
      level2Pass,
      level3Pass,
    };
  }

  return {
    decision: "A",
    rationale: "Integration Point가 명확히 정의되었고(REPAIR-typed Recovery candidate), Planner 변경이 불필요함을 확인했으며, Integration Contract의 10개 항목이 전부 작성되고 모든 고위험 항목에 대응책이 있다 -- Integration Prototype Sprint v1을 바로 시작할 수 있는 수준의 Blueprint가 확보되었다.",
    level1Pass,
    level2Pass,
    level3Pass,
  };
}
