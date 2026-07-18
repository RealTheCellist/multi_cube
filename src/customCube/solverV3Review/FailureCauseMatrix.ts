// --- FailureCauseMatrix (Solver v3 Strategy Review Sprint v1) ------------
// STEP2: reclassifies every Sprint in ResearchTimeline.ts (unmodified,
// imported) along 6 causal axes, and marks whether each Sprint's finding
// is the SAME underlying root cause recurring, or an INDEPENDENT new
// cause. No new measurement -- this is a re-reading of ResearchTimeline's
// already-real, already-cited numbers.
import { RESEARCH_TIMELINE } from "./ResearchTimeline";

export type CauseAxis = "Representation" | "Primitive" | "Contract" | "Dataset" | "Search" | "Measurement";
export type CauseRelation = "SAME_ROOT_CAUSE" | "INDEPENDENT_NEW_CAUSE";

export interface FailureCauseEntry {
  sprintId: string;
  axes: CauseAxis[];
  primaryAxis: CauseAxis;
  relation: CauseRelation;
  relatedSprintIds: string[]; // sprints sharing the same underlying root cause (only when relation === SAME_ROOT_CAUSE)
  reasoning: string;
}

export const FAILURE_CAUSE_MATRIX: FailureCauseEntry[] = [
  {
    sprintId: "PLANNER_V2",
    axes: ["Search", "Measurement"],
    primaryAxis: "Search",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["GOAL_INTEGRATION"],
    reasoning: "특정 replay에 과적합된 전략 -- 다음 Sprint(Goal Integration)와 동일한 '오케스트레이션이 일반화되지 않는다'는 근본 문제의 첫 발현.",
  },
  {
    sprintId: "GOAL_INTEGRATION",
    axes: ["Measurement", "Contract"],
    primaryAxis: "Measurement",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["PLANNER_V2"],
    reasoning: "실측 없이 예약한 시간 예산 자체가 비용으로 작용 -- Planner v2와 동일한 과적합/일반화 실패 계열.",
  },
  {
    sprintId: "POLICY_GENERALIZATION",
    axes: ["Dataset", "Measurement"],
    primaryAxis: "Dataset",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["BP4", "SOLVER_V3_KICKOFF"],
    reasoning: "다수결이 성립하려면 같은 상태 시그니처를 공유하는 replay가 여러 건 필요한데 대부분 1건뿐이었다 -- BP-4/v3 Kickoff가 나중에 정식으로 측정한 'Dataset 희소성'의 가장 이른 실증 사례.",
  },
  {
    sprintId: "CYCLECHASE",
    axes: ["Primitive"],
    primaryAxis: "Primitive",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "이 트랙에서 처음 발명된 새 Primitive. 이후 BP-1/BP-3가 같은 '탐색 범위'를 다르게 조정하는 변형이 됨 (그 두 개는 SAME_ROOT_CAUSE로 서로 연결).",
  },
  {
    sprintId: "COVERAGE_EXPANSION",
    axes: ["Measurement"],
    primaryAxis: "Measurement",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "순수 진단/분류 Sprint -- FIRST_HOP_FAIL이라는 새로운 실패 모드 명명 자체가 이전에 없던 정보.",
  },
  {
    sprintId: "FIRST_HOP_ANALYSIS",
    axes: ["Search", "Primitive"],
    primaryAxis: "Search",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["CONTRACT_ANALYSIS", "BP5"],
    reasoning: "'탐색 예산/깊이를 늘려도 소용없다'는 이 Sprint의 결론은, Contract Analysis(비용이 과도해 늘릴 수 없다)와 BP-5(실제로 늘려봐도 비용 병목은 그대로)가 3개 Sprint에 걸쳐 반복 확인한 동일한 벽의 첫 관측.",
  },
  {
    sprintId: "CONTRACT_ANALYSIS",
    axes: ["Contract", "Primitive"],
    primaryAxis: "Contract",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["FIRST_HOP_ANALYSIS", "BP5"],
    reasoning: "이 Sprint 당시엔 'Contract(즉시개선 요구)를 완화하는 비용'으로 프레이밍됐지만, BP-5가 실측으로 재확인한 결과 진짜 원인은 Contract 설계가 아니라 enumerateWingCandidates() 자체의 호출 비용이었다 -- 같은 벽을 다른 이름으로 부른 사례.",
  },
  {
    sprintId: "SOLVER_V2_KICKOFF",
    axes: ["Primitive", "Measurement"],
    primaryAxis: "Measurement",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "Hard Gap을 정식으로 정의하고 4개의 독립적 Blueprint 가설을 세운 최초의 메타 수준 Sprint.",
  },
  {
    sprintId: "BP1",
    axes: ["Primitive", "Contract"],
    primaryAxis: "Primitive",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "Deferred Validation(끝에서만 검증)이라는 이 트랙 유일의 실질적으로 긍정적인(+2.7pp, 0% Regression) 결과. BP-2/3/5가 이 설계를 재사용하지만 BP-1 자체는 독립적 성과.",
  },
  {
    sprintId: "BP2",
    axes: ["Primitive"],
    primaryAxis: "Primitive",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "Parity 특정 가설을 명확히 반증한 독립적 실험 -- 이후 어느 Sprint도 Parity를 다시 주된 원인으로 다루지 않음 (가설이 깨끗하게 종료됨).",
  },
  {
    sprintId: "BP3",
    axes: ["Primitive", "Search"],
    primaryAxis: "Search",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["BP1", "CYCLECHASE"],
    reasoning: "CycleChase/BP-1과 동일한 '탐색 범위(walk order)를 넓히면 나아지는가' 계열의 세 번째 변형 -- 이번엔 범위를 넓혔지만 오히려 낮은 결과.",
  },
  {
    sprintId: "BP4",
    axes: ["Representation", "Dataset"],
    primaryAxis: "Dataset",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["POLICY_GENERALIZATION", "SOLVER_V3_KICKOFF"],
    reasoning: "75건이 69개 고유 Shape로 분산 -- Policy Generalization이 훨씬 이전에 정성적으로 겪었던 것과 동일한 Dataset 희소성 문제를 정량으로 확정.",
  },
  {
    sprintId: "SOLVER_V3_KICKOFF",
    axes: ["Dataset", "Representation", "Primitive", "Measurement"],
    primaryAxis: "Representation",
    relation: "INDEPENDENT_NEW_CAUSE",
    relatedSprintIds: [],
    reasoning: "BP-4까지 뒤섞여 있던 Representation/Dataset/Primitive 원인을 최초로 축별로 분리 측정 -- 이 Review Sprint 자체의 축소판 선례. Representation을 고치는 것만으로 재군집화 품질이 크게 개선됨을 실측으로 증명(독립적 긍정 결과).",
  },
  {
    sprintId: "BP5",
    axes: ["Primitive", "Contract"],
    primaryAxis: "Primitive",
    relation: "SAME_ROOT_CAUSE",
    relatedSprintIds: ["CONTRACT_ANALYSIS", "FIRST_HOP_ANALYSIS"],
    reasoning: "Contract Analysis Sprint v1이 분석적으로 추정했던 비용 문제를 실제로 실행해 재확인 -- 단, 원인을 branching factor에서 enumerateWingCandidates() 호출 비용으로 더 정밀하게 좁혔다는 점이 이 반복의 새로운 정보.",
  },
];

// Level 1 check: every ResearchTimeline entry must have exactly one
// FailureCauseMatrix entry, and vice versa -- "모든 Sprint가 동일 기준으로
// 재분류된다."
export function verifyFullCoverage(): { covered: boolean; missing: string[]; extra: string[] } {
  const timelineIds = new Set(RESEARCH_TIMELINE.map((t) => t.id));
  const matrixIds = new Set(FAILURE_CAUSE_MATRIX.map((m) => m.sprintId));
  const missing = [...timelineIds].filter((id) => !matrixIds.has(id));
  const extra = [...matrixIds].filter((id) => !timelineIds.has(id));
  return { covered: missing.length === 0 && extra.length === 0, missing, extra };
}
