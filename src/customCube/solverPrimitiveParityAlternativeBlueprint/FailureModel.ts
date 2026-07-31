// --- FailureModel (Parity-Gated Cycle Alternative Primitive Blueprint
// Sprint v1, STEP1) -----------------------------------------------------------
// Pure structural documentation -- no new computation. Models the real,
// unmodified Primitive pipeline (genParityGatedCycle()'s own composition,
// fiveByFiveEdgeRecovery.ts, cited not modified) as a stage graph, and
// annotates each stage with the real, already-measured failure share from
// the prior two Sprints (Integration Architecture Analysis Sprint v1 and
// Primitive Prototype Refinement Sprint v1's own result JSONs, cited not
// re-derived).
export interface PipelineStage {
  name: string;
  description: string;
  realFailureSharePercent: number | null; // null where not directly measured at this stage
  failureShareSource: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    name: "Input (componentCount>1 Gate)",
    description: "componentCount>1 여부만 확인 -- 통과해야 이후 단계가 시작된다.",
    realFailureSharePercent: 65.5,
    failureShareSource: "Integration Architecture Analysis Sprint v1 STEP6 RootCauseMatrix: GATE_MISS=65.5% of all 142 cases (Primitive가 애초에 시도되지 않는 비율)",
  },
  {
    name: "Single Wing Selection",
    description: "compSource의 wrong wing 최대 5개, compTarget slot 최대 5개를 선택(각 방향, 양방향 시도).",
    realFailureSharePercent: null,
    failureShareSource: "Prototype Refinement Sprint v1 STEP4: 이 bound를 무제한으로 넓혀도 회복률 0% -- 이 단계 자체의 CAP은 병목이 아님이 실측으로 확인됨",
  },
  {
    name: "Bridge Candidate (BFS 경로)",
    description: "bfsMoveWingToPosition으로 선택된 wing을 target slot으로 옮기는 실제 이동 경로를 탐색.",
    realFailureSharePercent: null,
    failureShareSource: "Prototype Refinement Sprint v1 STEP2: avgPairsAttempted=20.2 중 대부분에서 물리적 경로 자체는 발견됨(직접 확인) -- 이 단계는 병목이 아님",
  },
  {
    name: "Validation (targetedComponentsMerged)",
    description: "이동 후 compSource/compTarget에 속했던 슬롯들이 실제로 하나의 Component로 합쳐졌는지 확인.",
    realFailureSharePercent: 75.6,
    failureShareSource: "Prototype Refinement Sprint v1 STEP1/STEP2: CANDIDATE_GENERATION_FAILURE=75.6%(31/41), avgValidCount=0.37/attempted 20.2 -- 이 단계에서 대부분의 시도가 REJECT됨. 핵심 병목.",
  },
  {
    name: "Multi-Cycle Traversal",
    description: "Bridge 이후 병합된 그래프에서 모든 cycle을 concat해 resolveBoundedMultiCycle로 해소.",
    realFailureSharePercent: 19.5,
    failureShareSource: "Prototype Refinement Sprint v1 STEP1: TRAVERSAL_FAILURE=19.5%(8/41), STEP3: hitCapOrDeadlineCount=0/41(탐색 예산 소진 아님) -- Traversal 알고리즘 자체의 한계",
  },
  {
    name: "Cleanup (bestEffortCleanup)",
    description: "잔여 wrong wing 1개에 대해 tryFixWing 1회 시도.",
    realFailureSharePercent: null,
    failureShareSource: "별도 측정 없음 -- Traversal 단계 이후 소규모 정리 단계, 독립적 실패율 미측정",
  },
  {
    name: "Final Validation (validateDeferred)",
    description: "Bridge+Traversal+Cleanup 전체 이동 결과가 원본 대비 순net-개선인지 최종 확인.",
    realFailureSharePercent: 0,
    failureShareSource: "Prototype Refinement Sprint v1 STEP1: VALIDATION_FAILURE=0%(0/41) -- 이 단계는 실측상 원인이 아님",
  },
];

export const FAILURE_MODEL_SUMMARY =
  "현재 Primitive의 실패는 압도적으로 'Validation(targetedComponentsMerged)' 단계에 집중된다(75.6%): " +
  "BFS는 물리적 이동 경로를 찾아내지만(Bridge Candidate 단계는 병목이 아님), 그 이동이 실제로 의도한 두 " +
  "Component를 병합하는지 확인하는 단계에서 대부분 실패한다. 이는 단일 face turn이 겨냥한 wing 외의 다른 " +
  "wing들도 함께 이동시켜, 의도치 않은 collateral effect가 병합을 방해하기 때문으로 추정된다(파일 헤더 " +
  "disclosure, BridgeCandidateGeneration.ts 참고). Traversal 단계도 부차적 원인(19.5%)이나, 탐색 " +
  "예산/bound 문제가 아니라(hitCapOrDeadlineCount=0/41) 알고리즘 자체의 구조적 한계다.";
