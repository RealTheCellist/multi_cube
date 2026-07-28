// --- FinalDecision (Move Representation Blueprint Sprint v1, Deliverable
// #5, Success Criteria A/B/C) ------------------------------------------------
import type { ExpressivenessRow } from "./ExpressivenessComparison";
import type { ComplexityRow } from "./ComplexityAnalysis";

export type BlueprintDecision = "A_BLUEPRINT_COMPLETE_PROCEED_TO_PROTOTYPE" | "B_BLUEPRINT_NEEDS_REFINEMENT" | "C_REJECTED";

export interface FinalDecisionResult {
  decision: BlueprintDecision;
  decisionLabel: string;
  chosenRepresentationId: string;
  rationale: string;
}

// Same disclosed 60%-class dominance-style bar this whole research arc
// has used repeatedly for "is this a clear enough signal to act on."
const CLEAR_EXPRESSIVENESS_THRESHOLD = 0.6;

export function decideFinal(expressiveness: ExpressivenessRow[], complexity: ComplexityRow[]): FinalDecisionResult {
  // A representation qualifies for Conclusion A only if it (a) reaches
  // full one-shot coverage of the measured population and (b) has an
  // identified, buildable mechanism (not just a "shape" with no clear
  // path to a low-side-effect implementation).
  const fullCoverage = expressiveness.filter((e) => e.oneShotCoverageRate >= CLEAR_EXPRESSIVENESS_THRESHOLD);

  if (fullCoverage.length === 0) {
    return {
      decision: "C_REJECTED",
      decisionLabel: "Conclusion C -- Move Representation 접근 자체를 재검토해야 한다",
      chosenRepresentationId: "(none)",
      rationale: `어떤 후보도 임계치(${(CLEAR_EXPRESSIVENESS_THRESHOLD * 100).toFixed(0)}%) 이상의 one-shot coverage를 보이지 않음.`,
    };
  }

  // Among full-coverage candidates, prefer the one whose complexity
  // rationale identifies a concrete, buildable low-side-effect mechanism
  // (COMMUTATOR_MOVE) over one that is merely the right "shape" without a
  // mechanism (CYCLE_ROTATION alone).
  const commutator = complexity.find((c) => c.representationId === "COMMUTATOR_MOVE");
  const cycleRotation = expressiveness.find((e) => e.representationId === "CYCLE_ROTATION");

  if (commutator && cycleRotation && cycleRotation.oneShotCoverageRate >= CLEAR_EXPRESSIVENESS_THRESHOLD) {
    return {
      decision: "A_BLUEPRINT_COMPLETE_PROCEED_TO_PROTOTYPE",
      decisionLabel: "Conclusion A -- 새 Move Representation이 Residual Failure의 구조적 원인을 설명하며 Prototype 단계로 진행할 준비가 되었다",
      chosenRepresentationId: "CYCLE_ROTATION_VIA_COMMUTATOR",
      rationale:
        "Cycle Rotation(형태, one-shot coverage 100%)과 Commutator Move(메커니즘, 저-부작용 이동 생성 가능)를 결합한 '적응형 길이 Cycle을 Commutator 조합으로 재배치'가 이론적 표현력과 구현 가능한 메커니즘을 동시에 만족 -- PrototypeSpecification.ts에 정의된 조건으로 다음 Sprint에서 Prototype 착수 가능.",
    };
  }

  return {
    decision: "B_BLUEPRINT_NEEDS_REFINEMENT",
    decisionLabel: "Conclusion B -- 후보 Representation이 여전히 부족하다",
    chosenRepresentationId: fullCoverage[0]?.representationId ?? "(none)",
    rationale: "표현력 기준은 만족하는 후보가 있으나 구현 가능한 구체적 메커니즘이 명확하지 않음 -- Blueprint 보완 필요.",
  };
}
