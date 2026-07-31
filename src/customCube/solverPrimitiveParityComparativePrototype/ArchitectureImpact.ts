// --- ArchitectureImpact (Parity-Gated Cycle Comparative Prototype
// Sprint v1, STEP5) -----------------------------------------------------------
// Unlike the prior Blueprint Sprint's speculative STRUCTURAL_FEASIBILITY
// (design-only estimates), this compares the two Prototypes based on
// what was ACTUALLY implemented in STEP1/STEP2: real line counts, real
// confirmed zero Planner/Recovery-layer changes (neither Prototype
// touches fiveByFiveEdgeRecovery.ts/fiveByFiveEdgePlanner.ts -- both
// reuse the exact same single-call bridge->traversal->cleanup->validate
// composition genParityGatedCycle() itself already uses), and real
// measured runtime from STEP3/STEP4.
export interface PrototypeCodeFootprint {
  mechanismName: string;
  newFileLineCount: number;
  reusesExistingCandidateGenerator: boolean; // true if the mechanism calls the real generateBridgeCandidates() directly, false if it needed its own raw-candidate-finder reimplementation
  plannerFilesTouched: number; // always 0 for both -- confirmed by git diff
  recoveryFilesTouched: number; // always 0 for both -- confirmed by git diff
}

export const PROTOTYPE_CODE_FOOTPRINTS: PrototypeCodeFootprint[] = [
  {
    mechanismName: "Dual Wing Bridge",
    newFileLineCount: 170,
    reusesExistingCandidateGenerator: false, // needed its own findRawBridgeMoves (disclosed duplicate of the private candidatesForDirection), since generateBridgeCandidates() only returns already merge-filtered candidates
    plannerFilesTouched: 0,
    recoveryFilesTouched: 0,
  },
  {
    mechanismName: "Multi-Component Merge",
    newFileLineCount: 143,
    reusesExistingCandidateGenerator: true, // calls the real generateBridgeCandidates() directly and repeatedly -- only the sequential-loop orchestration is new
    plannerFilesTouched: 0,
    recoveryFilesTouched: 0,
  },
];

export interface ArchitectureImpactSummary {
  mechanismName: string;
  codeFootprint: PrototypeCodeFootprint;
  avgRuntimeMs: number;
  integrationDifficultyNote: string;
}

export function buildArchitectureImpactSummary(dualAvgRuntimeMs: number, multiAvgRuntimeMs: number): ArchitectureImpactSummary[] {
  return [
    {
      mechanismName: "Dual Wing Bridge",
      codeFootprint: PROTOTYPE_CODE_FOOTPRINTS[0],
      avgRuntimeMs: dualAvgRuntimeMs,
      integrationDifficultyNote:
        "실제 구현 결과 170줄, 기존 generateBridgeCandidates()를 그대로 쓸 수 없어 " +
        "raw candidate finder(findRawBridgeMoves)를 별도 작성해야 했다 -- Planner/Recovery " +
        "레이어는 0건 변경(둘 다 genParityGatedCycle()과 동일한 단일 호출 구성 재사용). " +
        "Production Integration 시 BridgeCandidateGeneration.ts에 신규 함수 1개 추가로 충분.",
    },
    {
      mechanismName: "Multi-Component Merge",
      codeFootprint: PROTOTYPE_CODE_FOOTPRINTS[1],
      avgRuntimeMs: multiAvgRuntimeMs,
      integrationDifficultyNote:
        "실제 구현 결과 143줄(Dual Wing Bridge보다 27줄 적음), 기존 generateBridgeCandidates()를 " +
        "수정 없이 반복 호출하는 오케스트레이션만 추가 -- Planner/Recovery 레이어는 0건 변경. " +
        "Production Integration 시 genParityGatedCycle() 자체를 반복 루프로 감싸는 정도의 " +
        "변경이면 충분해 통합 난이도가 더 낮다.",
    },
  ];
}
