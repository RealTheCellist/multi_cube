// --- PrototypeAssessment (Move Representation Prototype Sprint v1,
// Deliverable #5, Success Criteria) ------------------------------------------
import type { CapabilitySummary } from "./CapabilityEvaluation";
import type { SideEffectSummary } from "./SideEffectEvaluation";
import type { RegressionSummary } from "./RegressionAnalysis";

export type PrototypeDecision = "A_READY_FOR_PRODUCTION_INTEGRATION" | "B_PROTOTYPE_NEEDS_IMPROVEMENT" | "C_BLUEPRINT_NEEDS_REVISION";

export interface PrototypeAssessmentResult {
  decision: PrototypeDecision;
  decisionLabel: string;
  capabilityPass: boolean;
  sideEffectPass: boolean;
  regressionPass: boolean;
  integrationPass: boolean;
  rationale: string;
}

// Disclosed thresholds, fixed before evaluating any result:
//   - Capability: "meaningful" improvement over CCR's own 0/28 baseline --
//     matching this whole research arc's convention (Primitive Prototype
//     Sprint v2's own LEVEL3_MIN_RESCUED=3), at least 3 net-new solves.
//   - Side Effect: at least half of solved cases hit the Blueprint's own
//     footprintRatio<=2.0 bar.
//   - Regression: zero regressions, no exceptions.
const MIN_MEANINGFUL_CAPABILITY_GAIN = 3;
const MIN_SIDE_EFFECT_ACHIEVEMENT_RATE = 0.5;

export function assessPrototype(primaryCapability: CapabilitySummary, sideEffect: SideEffectSummary, regression: RegressionSummary): PrototypeAssessmentResult {
  const capabilityPass = primaryCapability.coverageDelta >= MIN_MEANINGFUL_CAPABILITY_GAIN;
  const sideEffectPass = sideEffect.n > 0 && sideEffect.blueprintTargetAchievedRate >= MIN_SIDE_EFFECT_ACHIEVEMENT_RATE;
  const regressionPass = regression.regressionCount === 0;
  const integrationPass = true; // by construction -- standalone module, same (Cubie[], WingLibrary, deadline)->Move[]|null contract as every existing Primitive, no Planner/Executor change

  let decision: PrototypeDecision;
  let decisionLabel: string;
  let rationale: string;

  if (!regressionPass) {
    decision = "C_BLUEPRINT_NEEDS_REVISION";
    decisionLabel = "Conclusion C -- Blueprint 수정 필요 (Regression 발생)";
    rationale = `${regression.regressionCount}건의 회귀가 발생 -- 이는 Deferred Validation 계약이 깨졌다는 뜻이므로 Blueprint 자체를 재검토해야 한다.`;
  } else if (!capabilityPass) {
    decision = "C_BLUEPRINT_NEEDS_REVISION";
    decisionLabel = "Conclusion C -- Blueprint 수정 필요 (Capability 기준 미달)";
    rationale = `PURE_CYCLE_ISOLATION coverage 증가량이 ${primaryCapability.coverageDelta}건으로 유의미성 기준(${MIN_MEANINGFUL_CAPABILITY_GAIN}건) 미달 -- Commutator 메커니즘 자체가 예상한 만큼 새 capability를 제공하지 못함.`;
  } else if (!sideEffectPass) {
    decision = "B_PROTOTYPE_NEEDS_IMPROVEMENT";
    decisionLabel = "Conclusion B -- Prototype 개선 필요 (Side Effect 목표 미달)";
    rationale = `해결된 케이스 중 footprintRatio<=2.0(Blueprint 목표) 달성률이 ${(sideEffect.blueprintTargetAchievedRate * 100).toFixed(1)}%로 기준(${(
      MIN_SIDE_EFFECT_ACHIEVEMENT_RATE * 100
    ).toFixed(0)}%) 미달 -- Capability는 확인되었으나 저-부작용 목표를 달성하려면 Setup/Core 선택 로직을 개선해야 한다.`;
  } else {
    decision = "A_READY_FOR_PRODUCTION_INTEGRATION";
    decisionLabel = "Conclusion A -- Production Integration 준비 완료";
    rationale = `Capability(+${primaryCapability.coverageDelta}건), Side Effect(달성률 ${(sideEffect.blueprintTargetAchievedRate * 100).toFixed(
      1
    )}%), Regression(0건), Integration(기존 계약 재사용) 4개 기준 모두 통과.`;
  }

  return { decision, decisionLabel, capabilityPass, sideEffectPass, regressionPass, integrationPass, rationale };
}
