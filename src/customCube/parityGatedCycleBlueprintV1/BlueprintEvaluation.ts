// --- BlueprintEvaluation (Solver Primitive Discovery Sprint #6 -- Parity-
// Gated Cycle Blueprint Sprint v1, STEP5) ------------------------------------
// Quantitative comparison table per Directive's own 4 criteria:
//   설명 가능한 Unknown 비율   -- computed: candidate Gate coverage over
//                                the 53-case Unknown population.
//   기존 Primitive와 중복도    -- computed: of the candidate's Gate-matched
//                                subset, what fraction ALSO structurally
//                                qualifies for at least one of the 7 real
//                                existing Primitive Gates (STEP3's
//                                ALL_PRIMITIVE_GATES, unmodified reuse).
//   구현 복잡도 / Production Integration Risk -- qualitative (LOW/MEDIUM/
//                                HIGH), a design judgment that cannot be
//                                computed from structural features alone
//                                (no code exists yet to measure), each
//                                with a written rationale grounded in
//                                BlueprintCandidates.ts's own disclosed
//                                differenceFromExisting text.
import type { BlueprintCandidate } from "./BlueprintCandidates";
import { ALL_PRIMITIVE_GATES } from "./ExistingPrimitiveProjection";
import { evaluateFullPrecondition } from "../blueprintAttributionRefinementV1/BlueprintGateDefinitions";
import type { UnknownCase } from "./UnknownPopulationProfiling";

// Excludes "Bridge Injection" from the duplication check: that Blueprint's
// declared Gate (disconnectedGraph only) has NEVER had a real distinct
// mechanism behind it anywhere in this arc (bridgeInjectionRefinementV1's
// own Section 0 disclosure -- the only real code is MultiHopBridge's
// short-cycle mechanism, whose OWN Gate requires componentCount===1 and
// so never actually matches disconnectedGraph cases). Counting a match
// against a label with no real code as "duplication" would be dishonest --
// it's exactly the gap Candidate A is trying to fill, not competition.
const REAL_PRIMITIVE_GATES = ALL_PRIMITIVE_GATES.filter((g) => g.name !== "Bridge Injection");

// A second, narrower comparison set that ALSO excludes "Mixed Commutator":
// disclosed finding (STEP3's own numbers) -- Mixed Commutator's real Gate
// (moveRepresentationPrototype/AdaptiveCycleDetection.ts) is just
// cycleCount>0, the least restrictive of all 7 Gates (98.1% of Unknown
// structurally "matches" it). Yet Unresolved Mechanism Validation Sprint
// v1's own STEP2 already ran REAL solve() calls against Mixed Commutator
// on this exact residual and it improved 0/68 cases. A structural Gate
// match against a Primitive whose search has already been PROVEN
// empirically ineffective here isn't real functional duplication -- it's
// an artifact of that Gate being maximally permissive. Reported alongside
// the full metric rather than silently substituted, since the Directive
// explicitly asked for a structure-only comparison and this is a
// disclosed caveat on top of it, not a methodology swap.
const REAL_PRIMITIVE_GATES_EXCLUDING_MIXED_COMMUTATOR = REAL_PRIMITIVE_GATES.filter((g) => g.name !== "Mixed Commutator");

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface QualitativeScore {
  complexity: RiskLevel;
  complexityRationale: string;
  productionRisk: RiskLevel;
  productionRiskRationale: string;
}

const QUALITATIVE_SCORES: Record<"A" | "B" | "C", QualitativeScore> = {
  A: {
    complexity: "HIGH",
    complexityRationale: "새로운 2단계(setup bridge + 다중 사이클 순회) 탐색 코어를 처음부터 설계해야 한다 -- 이 아크에서 한 번도 구현된 적 없는 진짜 새 메커니즘.",
    productionRisk: "MEDIUM",
    productionRiskRationale: "새 코드지만 기존 아크의 disclosed-duplicate 패턴(BoundedResolver DFS 재사용)을 따를 수 있어 완전한 백지 설계는 아니다. Recovery 레이어 경쟁 매트릭스에 새 항목이 추가되는 정도의 위험.",
  },
  B: {
    complexity: "LOW",
    complexityRationale: "새 코드가 거의 없다 -- CCRPrototype.ts의 기존 strategy=\"multiCycle\" 옵션을 호출부만 바꿔 시험하면 된다.",
    productionRisk: "LOW",
    productionRiskRationale: "기존 CCR 코드 경로를 그대로 타므로 회귀 위험이 낮다. 다만 Blueprint로서의 '신규성'이 낮아 이번 Sprint의 목적(새 Primitive Blueprint 확정)과는 다소 어긋난다.",
  },
  C: {
    complexity: "HIGH",
    complexityRationale: "Candidate A의 전체 복잡도에 componentCount 분기 로직까지 추가되므로 A보다 복잡도가 같거나 더 높다.",
    productionRisk: "HIGH",
    productionRiskRationale: "하나의 진입점 안에서 서로 다른 두 경로(A의 새 코드 / B의 기존 CCR 재사용)를 분기해야 하므로 테스트 표면이 넓고, 두 경로 중 하나에서 생긴 회귀가 다른 경로처럼 보일 위험이 있다.",
  },
};

export interface BlueprintEvaluationResult {
  candidateId: "A" | "B" | "C";
  candidateName: string;
  explainedCount: number;
  explainedFraction: number;
  duplicationOverlapFraction: number; // of the explained subset, fraction that ALSO structurally qualifies for >=1 existing Primitive (incl. Mixed Commutator's maximally-permissive Gate)
  duplicationOverlapFractionExcludingMixedCommutator: number; // same, but excluding Mixed Commutator -- see disclosed rationale above
  qualitative: QualitativeScore;
}

export function evaluateBlueprintCandidates(candidates: readonly BlueprintCandidate[], unknownCases: readonly UnknownCase[]): BlueprintEvaluationResult[] {
  return candidates.map((candidate) => {
    const explained = unknownCases.filter((uc) => evaluateFullPrecondition(candidate.gate, uc.features));
    const explainedCount = explained.length;
    const explainedFraction = unknownCases.length ? explainedCount / unknownCases.length : 0;

    const duplicated = explained.filter((uc) => REAL_PRIMITIVE_GATES.some((gate) => evaluateFullPrecondition(gate, uc.features)));
    const duplicationOverlapFraction = explainedCount ? duplicated.length / explainedCount : 0;

    const duplicatedExcl = explained.filter((uc) => REAL_PRIMITIVE_GATES_EXCLUDING_MIXED_COMMUTATOR.some((gate) => evaluateFullPrecondition(gate, uc.features)));
    const duplicationOverlapFractionExcludingMixedCommutator = explainedCount ? duplicatedExcl.length / explainedCount : 0;

    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      explainedCount,
      explainedFraction,
      duplicationOverlapFraction,
      duplicationOverlapFractionExcludingMixedCommutator,
      qualitative: QUALITATIVE_SCORES[candidate.id],
    };
  });
}
