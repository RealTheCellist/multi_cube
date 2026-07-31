// --- StructuralFeasibility (Parity-Gated Cycle Alternative Primitive
// Blueprint Sprint v1, STEP3) --------------------------------------------------
// Design-only -- no implementation, no Production file touched. For each
// STEP2 mechanism, assesses impact on the 4 real architectural layers
// (Planner/Recovery/Primitive/BFS) and records which real files WOULD
// need to change if it were ever implemented (a future Sprint's scope,
// not this one's).
import type { MechanismId } from "./AlternativeMechanisms";

export interface LayerImpact {
  layer: "Planner" | "Recovery" | "Primitive" | "BFS";
  impact: "none" | "low" | "medium" | "high";
  note: string;
}

export interface FeasibilityEntry {
  mechanismId: MechanismId;
  layerImpacts: LayerImpact[];
  productionModificationScope: string[]; // real file paths that WOULD need changes if implemented (future Sprint, not this one)
  feasibilitySummary: string;
}

export const STRUCTURAL_FEASIBILITY: FeasibilityEntry[] = [
  {
    mechanismId: "DUAL_WING_BRIDGE",
    layerImpacts: [
      { layer: "Planner", impact: "none", note: "Planner는 Task 단위만 다루고 Recovery 내부 후보 생성 방식에는 관여하지 않는다 -- 영향 없음." },
      { layer: "Recovery", impact: "low", note: "genParityGatedCycle() 자체(fiveByFiveEdgeRecovery.ts)는 Bridge 후보를 그대로 소비하므로, Bridge 후보의 '내용'만 2-move 조합으로 바뀌면 Recovery 레이어 자체는 무변경 가능." },
      { layer: "Primitive", impact: "high", note: "BridgeCandidateGeneration.ts의 candidatesForDirection 자체를 재작성 -- source wing 2개 조합 x target slot 조합 탐색으로 확장 필요." },
      { layer: "BFS", impact: "medium", note: "bfsMoveWingToPosition을 2회 순차 호출하거나, 2-wing 동시 목표를 지원하는 새 BFS 변형이 필요할 수 있음(현재 함수는 단일 wing 목표만 지원)." },
    ],
    productionModificationScope: ["parityGatedCyclePrototypeV1/BridgeCandidateGeneration.ts (신규 Prototype 파일로 별도 구현 가능 -- Production 자체는 무변경 가능)"],
    feasibilitySummary: "가장 구현 범위가 작다 -- 기존 Prototype 디렉토리에 새 Candidate Generation 함수만 추가하면 되고, Recovery/Planner 레이어는 그대로 재사용 가능.",
  },
  {
    mechanismId: "BRIDGE_CHAIN",
    layerImpacts: [
      { layer: "Planner", impact: "none", note: "영향 없음." },
      { layer: "Recovery", impact: "medium", note: "genParityGatedCycle()의 단일 순회 루프를 반복 루프로 바꿔야 함 -- MAX_RECOVERY_RETRIES와 유사한 반복 상한 및 visited-state 체크 필요." },
      { layer: "Primitive", impact: "medium", note: "Bridge 실패 시에도 상태를 실제로 적용하고 재평가하는 상위 오케스트레이션 로직이 필요 -- BridgeCandidateGeneration.ts 자체는 무변경 가능." },
      { layer: "BFS", impact: "none", note: "BFS 자체는 무변경 -- 매 chain 단계에서 기존 BFS를 그대로 재호출." },
    ],
    productionModificationScope: ["fiveByFiveEdgeRecovery.ts (반복 루프 도입 시 -- 이번 Sprint는 미변경, 향후 Sprint 범위)"],
    feasibilitySummary: "Primitive 로직은 크게 안 바뀌지만 오케스트레이션(반복/종료 조건) 설계가 새로 필요 -- 무한 루프 위험을 막을 안전장치 설계가 핵심 과제.",
  },
  {
    mechanismId: "TEMPORARY_EXPANSION",
    layerImpacts: [
      { layer: "Planner", impact: "low", note: "'병합까지의 거리'가 여러 단계에 걸쳐 유지되어야 한다면 Planner의 Task 판단 기준에도 간접 영향 가능." },
      { layer: "Recovery", impact: "high", note: "'즉시 성공/실패' 이진 판정 대신 '거리' 기반 판정으로 Recovery의 candidate 채택 로직 자체를 재설계해야 함." },
      { layer: "Primitive", impact: "high", note: "새로운 evaluator(병합까지의 거리 척도)를 처음부터 설계해야 함 -- 기존 어떤 Primitive에도 없는 새 개념." },
      { layer: "BFS", impact: "low", note: "BFS 자체보다는 그 결과를 평가하는 방식이 바뀜." },
    ],
    productionModificationScope: ["신규 evaluator 모듈 필요(기존 fiveByFiveEdgeEvaluator.ts와 별도) -- 설계 자체가 아직 없어 Production 파일 특정 불가"],
    feasibilitySummary: "4개 후보 중 설계 성숙도가 가장 낮다 -- '거리' 척도 자체가 정의되지 않아 Structural Feasibility를 구체적으로 논하기 어렵다.",
  },
  {
    mechanismId: "MULTI_COMPONENT_MERGE",
    layerImpacts: [
      { layer: "Planner", impact: "none", note: "영향 없음." },
      { layer: "Recovery", impact: "low", note: "genParityGatedCycle()의 largestTwo/smallestTwo 전략 선택 부분만 다중 컴포넌트 선택으로 확장." },
      { layer: "Primitive", impact: "high", note: "ComponentDetection.ts의 결과(components 배열)에서 2개가 아니라 N개를 선택하는 전략과, targetedComponentsMerged()를 N개 컴포넌트 병합 판정으로 일반화해야 함." },
      { layer: "BFS", impact: "medium", note: "여러 컴포넌트를 동시에 겨냥하는 BFS 목표 설계가 필요." },
    ],
    productionModificationScope: ["parityGatedCyclePrototypeV1/BridgeCandidateGeneration.ts, ComponentDetection.ts 관련 Prototype 확장 (Production 자체는 무변경 가능)"],
    feasibilitySummary: "구현 범위는 중간이지만, 적용 대상 모집단이 작다(componentCount>2인 6/41=14.6%) -- ROI 관점에서 우선순위가 낮다.",
  },
];
