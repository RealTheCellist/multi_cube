// --- ResidualMoveRequirement (Move Representation Gap Analysis Sprint v1,
// RQ-4, Deliverable #4 -- SPECIFICATION ONLY, no implementation) -----------
import type { RepresentationGapResult } from "./RepresentationGapMatrix";
import type { MoveClassTally } from "./MoveCoverageMatrix";

export interface ResidualMoveRequirementSpec {
  observedLimitation: string;
  requiredStructuralCondition: string;
  expectedMechanismShape: string;
  evidenceNote: string;
}

export function buildResidualMoveRequirement(gap: RepresentationGapResult, coverage: MoveClassTally[]): ResidualMoveRequirementSpec {
  const lateral = coverage.find((c) => c.moveClass === "LATERAL_NO_CHANGE");
  const regressive = coverage.find((c) => c.moveClass === "REGRESSIVE");
  const improving = coverage.find((c) => c.moveClass === "CYCLE_ROTATION_IMPROVING");

  return {
    observedLimitation: `${gap.casesWithNoImprovingCandidateAtAll}/${gap.totalCases}건(${(gap.casesWithNoImprovingCandidateShare * 100).toFixed(
      1
    )}%)에서 enumerateWingCandidates()가 cycle의 어느 hop에서도 wrongWingCount를 개선하는 후보를 단 하나도 내놓지 못한다 -- LATERAL_NO_CHANGE(${
      lateral?.count ?? 0
    }건, 평균 영향 wing수=${(lateral?.avgAffectedWingCount ?? 0).toFixed(2)})와 REGRESSIVE(${regressive?.count ?? 0}건)만 존재하고, CYCLE_ROTATION_IMPROVING(${
      improving?.count ?? 0
    }건)은 이 하위집합에서 관측되지 않는다.`,
    requiredStructuralCondition:
      "현재 enumerateWingCandidates()가 생성하는 모든 후보는 평균적으로 소수(측정된 avgAffectedWingCount)의 wing만 재배치하며, 이 재배치는 cycle/component 구조를 바꾸지 않고 '어떤 wing이 틀렸는가'만 이동시킨다(LATERAL_NO_CHANGE) -- 이는 순수 고립 cycle에서 한 조각을 목표 위치로 옮기면 그 조각이 있던 자리가 새로 틀리게 되는 zero-sum 특성과 일치한다. 이 zero-sum을 깨려면, 한 번의 논리적 이동(setup+commutator 조합 포함)이 cycle 내 2개 이상의 wing을 '동시에' 자신의 목표 위치로 옮기는 이동이 필요하다 -- 즉 현재처럼 '이 wing을 어디로 옮길까'가 아니라 '이 cycle 전체를 어떻게 재배열할까'를 단위로 하는 이동.",
    expectedMechanismShape:
      "기존 코드베이스 개념으로 표현하면: enumerateWingCandidates()가 제공하는 '단일 wing 재배치' 이동의 조합이 아니라, cycle의 여러 노드를 함께 재배열하는 commutator류 이동(예: A->B->C->A 순환을 한 번에 A<->C, B는 그대로 두는 형태) -- 이는 새 Primitive/Prototype 설계 단계에서 검토할 사항이며 이번 Sprint는 '무엇이 필요한가'만 정의하고 구현하지 않는다.",
    evidenceNote: `Representable move classes observed across the full population: ${gap.representableMoveClasses.join(", ") || "(none)"}. Never-generated classes: ${
      gap.neverGeneratedMoveClasses.join(", ") || "(none)"
    }.`,
  };
}
