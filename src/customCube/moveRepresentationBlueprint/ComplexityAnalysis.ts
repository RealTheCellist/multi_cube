// --- ComplexityAnalysis (Move Representation Blueprint Sprint v1,
// Required Analysis #4) ------------------------------------------------------
// Cost/complexity comparison grounded in REAL, already-measured figures
// from three prior Sprints (cited by value, not re-derived here):
//   - avg per-hop branching factor ~1.7-2.5 (Deep Cycle Resolver
//     Validation Sprint v1's StructuralProfile.ts measurements)
//   - avg leaves explored by BP-1/CCR: 5.6 / 16.3 (PURE_CYCLE_ISOLATION
//     Structural Mechanism Analysis Sprint v1)
//   - avg EXISTING candidate move length ~104-125 physical quarter-turns,
//     avg affectedWingCount ~30 (Move Representation Gap Analysis
//     Sprint v1) -- direct evidence that today's per-wing candidates are
//     NOT minimal-footprint moves.
export type ImplementationDifficulty = "LOW" | "MEDIUM" | "HIGH";
export type ProductionImpact = "NONE_STANDALONE_MODULE" | "NEW_RECOVERY_CANDIDATE_TYPE" | "EXECUTOR_CHANGE_REQUIRED";

export interface ComplexityRow {
  representationId: string;
  expectedBranchingIncrease: string;
  searchCostEstimate: string;
  implementationDifficulty: ImplementationDifficulty;
  productionImpact: ProductionImpact;
  rationale: string;
}

export function buildComplexityAnalysis(): ComplexityRow[] {
  return [
    {
      representationId: "PAIR_MOVE",
      expectedBranchingIncrease: "낮음 (단위 2, 기존 SWAP 처리와 유사)",
      searchCostEstimate: "낮음 -- 단일 hop pair 탐색",
      implementationDifficulty: "LOW",
      productionImpact: "NEW_RECOVERY_CANDIDATE_TYPE",
      rationale: "가장 구현이 쉽지만, 이 모집단(cycleLength 3~6, 2-length 없음)에서 one-shot coverage 0% -- 실효성 없음.",
    },
    {
      representationId: "MULTI_WING_FIXED3",
      expectedBranchingIncrease: "중간 (단위 3)",
      searchCostEstimate: "중간 -- 3-hop 조합 탐색",
      implementationDifficulty: "MEDIUM",
      productionImpact: "NEW_RECOVERY_CANDIDATE_TYPE",
      rationale: "one-shot coverage 10.7%(길이 3 케이스만) -- 나머지 89.3%는 반복 조합이 필요하며 그 조합 자체가 실측되지 않은 가정.",
    },
    {
      representationId: "CYCLE_ROTATION",
      expectedBranchingIncrease: "cycleLength에 비례 (측정된 avgBranchingFactor 1.7~2.5 기준 추정 탐색공간 11~232, 이미 Deep Cycle Resolver Validation Sprint에서 실측됨)",
      searchCostEstimate: "탐색 자체는 이미 저렴함 (BP-1 평균 5.6 leaf, CCR 평균 16.3 leaf 탐색으로 확인됨) -- 병목은 탐색 비용이 아니라 조합 가능한 저-부작용 이동의 부재",
      implementationDifficulty: "HIGH",
      productionImpact: "EXECUTOR_CHANGE_REQUIRED",
      rationale: "one-shot coverage 100%(적응형)지만, 현재 enumerateWingCandidates()가 반환하는 개별 후보 자체가 평균 ~30개 wing에 영향을 주는 큰 부작용(side effect)을 가진 전체 알고리즘 시퀀스(평균 104~125수)라서, 이를 그대로 N개 조합하면 부작용이 누적될 뿐 깨끗한 cycle 치환이 되지 않는다 -- Cycle Rotation은 '형태(shape)'이지 그 자체로 '메커니즘'이 아니다.",
    },
    {
      representationId: "COMMUTATOR_MOVE",
      expectedBranchingIncrease: "낮음 (setup 탐색 + 고정된 3-cycle 전용 알고리즘)",
      searchCostEstimate: "중간 -- setup move 탐색이 추가되지만 각 조각의 부작용은 설계상 최소화됨(원상복구 성질)",
      implementationDifficulty: "HIGH",
      productionImpact: "EXECUTOR_CHANGE_REQUIRED",
      rationale: "저-부작용(low-footprint) 이동을 명시적으로 설계 목표로 삼는 유일한 후보 -- Cycle Rotation이 필요로 하는 '깨끗한 조합 가능한 최소 이동 단위'를 실제로 제공할 수 있는 메커니즘. Cycle Rotation(형태)과 상호 보완적: '적응형 길이의 Cycle을 Commutator 조합으로 재배치'가 실질적 최종 설계 방향.",
    },
  ];
}
