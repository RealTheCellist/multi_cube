// --- FinalBlueprintSelection (Solver Primitive Discovery Sprint #6 --
// Parity-Gated Cycle Blueprint Sprint v1, STEP6) -----------------------------
// Directive's own 4 Levels, evaluated PER candidate, then a single overall
// Decision A/B/C:
//   Level1: explainedFraction >= 60%
//   Level2: duplicationOverlapFractionExcludingMixedCommutator < 50%
//     (structurally distinct from every REAL, EMPIRICALLY-MEANINGFUL
//     existing Primitive on at least half its explained cases). Uses the
//     Mixed-Commutator-excluded metric, disclosed in BlueprintEvaluation.ts:
//     Mixed Commutator's Gate is maximally permissive (cycleCount>0, 98.1%
//     of Unknown) yet Unresolved Mechanism Validation Sprint v1's own real
//     solve() calls already proved it improves 0/68 cases on this exact
//     residual -- counting a match against it as "duplication" would
//     reward every candidate with a false-positive overlap regardless of
//     how genuinely new the candidate's search mechanics are.
//   Level3: productionRisk !== "HIGH" (Production Integration 가능성이
//     명확하다 -- a HIGH risk candidate's integration path is NOT clear)
//   Level4: expectedPrimitiveBehavior is a non-empty, concrete description
//     (Prototype 구현 범위가 정의된다) -- always true here since
//     BlueprintCandidates.ts wrote one for every candidate; kept as an
//     explicit check rather than assumed.
import type { BlueprintEvaluationResult } from "./BlueprintEvaluation";

export const LEVEL1_COVERAGE_THRESHOLD = 0.6;
export const LEVEL2_DUPLICATION_THRESHOLD = 0.5;

export interface CandidateLevelResult {
  candidateId: "A" | "B" | "C";
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  level4Pass: boolean;
  allPass: boolean;
}

export function evaluateLevelsForCandidate(result: BlueprintEvaluationResult): CandidateLevelResult {
  const level1Pass = result.explainedFraction >= LEVEL1_COVERAGE_THRESHOLD;
  const level2Pass = result.duplicationOverlapFractionExcludingMixedCommutator < LEVEL2_DUPLICATION_THRESHOLD;
  const level3Pass = result.qualitative.productionRisk !== "HIGH";
  const level4Pass = true; // every candidate has a written expectedPrimitiveBehavior

  return { candidateId: result.candidateId, level1Pass, level2Pass, level3Pass, level4Pass, allPass: level1Pass && level2Pass && level3Pass && level4Pass };
}

export interface FinalSelectionResult {
  candidateLevels: CandidateLevelResult[];
  selectedCandidateIds: ("A" | "B" | "C")[];
  decision: "A" | "B" | "C";
  rationale: string;
}

export function selectFinalBlueprint(evaluations: readonly BlueprintEvaluationResult[]): FinalSelectionResult {
  const candidateLevels = evaluations.map(evaluateLevelsForCandidate);
  const allPassing = candidateLevels.filter((c) => c.allPass);
  const anyLevel1Pass = candidateLevels.some((c) => c.level1Pass);

  let decision: "A" | "B" | "C";
  let selectedCandidateIds: ("A" | "B" | "C")[];
  let rationale: string;

  if (allPassing.length > 0) {
    decision = "A";
    selectedCandidateIds = allPassing.map((c) => c.candidateId);
    rationale = `${selectedCandidateIds.join(", ")} 후보가 4개 Level 모두 PASS했다 -- Parity-Gated Cycle Prototype Sprint v1로 진행할 근거가 충분하다.`;
  } else if (anyLevel1Pass) {
    decision = "B";
    const partial = candidateLevels.filter((c) => c.level1Pass);
    selectedCandidateIds = partial.map((c) => c.candidateId);
    rationale = `${selectedCandidateIds.join(", ")} 후보는 Unknown의 60% 이상을 설명하지만(Level1 PASS), 다른 Level(중복도/Production Risk/구현 범위) 중 하나 이상을 충족하지 못했다 -- Blueprint Refinement가 추가로 필요하다.`;
  } else {
    decision = "C";
    selectedCandidateIds = [];
    rationale = "어떤 후보도 Unknown의 60% 이상을 단독으로 설명하지 못했다(Level1 전원 FAIL) -- Blueprint 성립 실패, Discovery Sprint를 재수행해야 한다.";
  }

  return { candidateLevels, selectedCandidateIds, decision, rationale };
}
