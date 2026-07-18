// --- EvidenceMap (Solver v3 Strategy Review Sprint v1) -------------------
// STEP3: answers the Sprint's 4 required research questions (spec section
// 2), each conclusion explicitly linked to real evidence, counter-evidence
// (if any), and remaining unverified gaps. No speculation without a cited
// source -- every bullet traces to a specific ResearchTimeline/
// FailureCauseMatrix entry.
import { RESEARCH_TIMELINE } from "./ResearchTimeline";
import { FAILURE_CAUSE_MATRIX } from "./FailureCauseMatrix";

export interface EvidenceLink {
  id: string;
  question: string;
  conclusion: string;
  evidence: string[];
  counterEvidence: string[];
  unverifiedGaps: string[];
  sourceSprintIds: string[];
}

export const EVIDENCE_MAP: EvidenceLink[] = [
  {
    id: "Q1_HARD_GAP_CAUSE",
    question: "현재 남아 있는 Hard Gap은 Representation/Primitive/Contract/Dataset 중 무엇 때문인가?",
    conclusion:
      "단일 축의 문제가 아니라 4개 축 모두가 실측으로 확인된 기여 요인이다. 상대적 비중은: Dataset(가장 근본적, 아직 미해결) > Primitive(반복 시도됐으나 정체) > Representation(이미 부분적으로 해결됨) > Contract(원인이 아니라 오귀인이었음이 재확인됨).",
    evidence: [
      "[BP4] Shape Key exact-match가 75건을 69개 고유 Shape로 분산시켜 실패 (Representation 문제, 이후 해결됨).",
      "[SOLVER_V3_KICKOFF] Coarse Structural Shape로 바꾸자 Singleton 92.8%->66.7%, 재등장률 14.7%->60.0%로 개선 -- Representation 문제는 진단 수준에서는 이미 고쳐졌다.",
      "[SOLVER_V3_KICKOFF] STEP0 Gate: Replay 다양성 92.0% FAIL, Shape 재등장률 14.7% CONDITIONAL -- Dataset 자체가 연구를 뒷받침하기에 여전히 얇다는 것이 실측으로 확인됨 (미해결).",
      "[BP1][BP2][BP3][BP5] 여러 세대의 Primitive가 시도됐지만 전체 75건 Coverage가 0~32% 구간을 벗어난 적이 없다 -- Primitive 자체의 표현력/조합이 Hard Gap의 상당 부분을 구조적으로 다루지 못한다.",
      "[BP5] Contract(즉시개선 요구)를 완화해도 진짜 병목은 Contract 설계가 아니라 enumerateWingCandidates() 호출 비용이었다 -- Contract는 원인이 아니라 증상이었다.",
    ],
    counterEvidence: [
      "[SOLVER_V3_KICKOFF] STEP1: BP-1/2/3 결합만으로 원본 Hard Gap의 23.6%가 이미 구제됨 -- '완전히 새로운 문제'라기보다 '측정 방식의 일부 과다분류'도 실제로 섞여 있었다.",
    ],
    unverifiedGaps: [
      "Dataset을 실제로 확장했을 때 Representation/Primitive 결론이 어떻게 바뀌는지는 전혀 검증되지 않았다 (Dataset 확장 자체가 시도된 적 없음).",
      "Representation 개선(Coarse Shape)이 재군집화 품질을 높인다는 것은 확인됐지만, 그것이 실제 WrongWing 해소율 향상으로 직결된다는 것은 아직 증명되지 않았다 (BP-5는 별개의 축을 검증했을 뿐, Coarse Shape 기반 신규 Primitive는 아직 시도되지 않음).",
    ],
    sourceSprintIds: ["BP4", "SOLVER_V3_KICKOFF", "BP1", "BP2", "BP3", "BP5"],
  },
  {
    id: "Q2_REPETITION_VS_INDEPENDENT",
    question: "지금까지 실패한 원인은 같은 원인의 반복인가, 독립적인 원인의 누적인가?",
    conclusion:
      "둘 다다. FailureCauseMatrix 기준 13개 Sprint 중 7개(PLANNER_V2/GOAL_INTEGRATION/FIRST_HOP_ANALYSIS/CONTRACT_ANALYSIS/BP3/BP4/BP5)가 SAME_ROOT_CAUSE로 표시됐고, 6개(CYCLECHASE/COVERAGE_EXPANSION/SOLVER_V2_KICKOFF/BP1/BP2/SOLVER_V3_KICKOFF)가 INDEPENDENT_NEW_CAUSE다. 즉 절반 이상이 이미 확인된 원인의 반복이었지만, 나머지 절반은 실제로 새로운 정보를 추가했다.",
    evidence: [
      "[FIRST_HOP_ANALYSIS][CONTRACT_ANALYSIS][BP5] '탐색을 늘리거나 완화해도 비용 문제로 안 된다'는 동일한 결론이 3개 Sprint, 서로 다른 방법론(예산 증가 실측 / 분석적 비용 추정 / 실제 실행 측정)으로 3번 확인됨 -- 이 정도로 반복되면 우연이 아니라 구조적 사실로 봐야 한다.",
      "[CYCLECHASE][BP3] '탐색 범위(cycle 구성 요소)를 넓히면 나아지는가'라는 동일 가설이 두 번 시도됐고, 두 번째(BP-3)는 오히려 더 나쁜 결과를 냈다 -- 반복된 시도가 새로운 정보를 주지 못한 사례.",
      "[BP2] Parity 특정 가설은 단 한 번 시도되고 깨끗하게 반증됨 -- 반복 없는 독립적 검증.",
      "[SOLVER_V3_KICKOFF] Representation/Dataset/Primitive를 축으로 분리해 측정한 것은 이전 어느 Sprint에서도 시도되지 않은 방법론 -- 명백히 독립적.",
    ],
    counterEvidence: [],
    unverifiedGaps: ["'같은 원인'으로 묶은 판단 자체가 이번 Review의 정성적 재해석이며, 통계적으로 검증된 군집화가 아니다 (STEP2 자체가 이번 Sprint의 유일한 정량 재분류)."],
    sourceSprintIds: ["FIRST_HOP_ANALYSIS", "CONTRACT_ANALYSIS", "BP5", "CYCLECHASE", "BP3", "BP2", "SOLVER_V3_KICKOFF"],
  },
  {
    id: "Q3_HYPOTHESIS_NOVELTY",
    question: "지금까지의 연구가 동일 가설을 여러 번 검증한 것인지, 정말 새로운 가설을 검증한 것인지?",
    conclusion:
      "핵심 가설은 사실상 하나로 수렴한다: '기존 Primitive 계약을 유지한 채 오케스트레이션/탐색/구조 확장만으로 Hard Gap을 줄일 수 있는가.' PLANNER_V2부터 BP3까지(8개 Sprint)는 전부 이 가설의 변형이었고, 전부 부정됐다(Coverage 상한 0~32%). 이후 3개 Sprint(BP4/SOLVER_V3_KICKOFF/BP5)는 서로 다른 새로운 가설(사전계산 Lookup / Representation-Dataset 분리 / 좁힌 표적에서의 실측 비용)을 각각 한 번씩 검증했다.",
    evidence: [
      "8개 Sprint(PLANNER_V2, GOAL_INTEGRATION, POLICY_GENERALIZATION, CYCLECHASE, COVERAGE_EXPANSION, FIRST_HOP_ANALYSIS, CONTRACT_ANALYSIS, BP1, BP3 -- 9개로 카운트하면 BP1도 포함되나 BP1은 유일하게 실측 Coverage가 상승한 예외적 성과)이 모두 '오케스트레이션/탐색'이라는 동일 패러다임 안에 있다.",
      "[BP2] Parity 가설은 이 패러다임과 독립적이었고 명확히 반증됨.",
      "[BP4] '탐색을 아예 포기하고 조회한다'는 패러다임 자체가 다른 첫 시도.",
      "[SOLVER_V3_KICKOFF] 문제 정의(Hard Gap의 정의, 상태 표현)를 재검토한 첫 메타 Sprint.",
    ],
    counterEvidence: ["[BP1]은 같은 '오케스트레이션' 패러다임 안에 있었지만 유일하게 실측 Coverage가 CycleChase 대비 상승(+2.7pp)한 예외 -- '동일 가설=항상 무의미'라고 단정할 수는 없다."],
    unverifiedGaps: [],
    sourceSprintIds: ["PLANNER_V2", "GOAL_INTEGRATION", "POLICY_GENERALIZATION", "CYCLECHASE", "COVERAGE_EXPANSION", "FIRST_HOP_ANALYSIS", "CONTRACT_ANALYSIS", "BP1", "BP2", "BP3", "BP4", "SOLVER_V3_KICKOFF", "BP5"],
  },
  {
    id: "Q4_COST_EFFECTIVE_DIRECTION",
    question: "현재 Solver 연구에서 가장 비용 대비 효과가 큰 연구 방향은 무엇인가?",
    conclusion:
      "Dataset 확장이 가장 근거가 강하고(STEP0 Gate 실측), 아직 한 번도 직접 시도된 적 없는(반복 위험 0) 유일한 축이다. Representation 개선(Coarse Shape)은 이미 부분적으로 검증됐고 비용이 낮아 병행할 만한 '즉시 실행 가능한' 부차 조치다. 반면 새 Primitive/Search 계열 연구는 5차례(CycleChase/BP1/BP2/BP3/BP5) 걸쳐 반복 시도됐고 비용 대비 한계 효용이 뚜렷이 감소했다.",
    evidence: [
      "[SOLVER_V3_KICKOFF] STEP0 Gate=CONDITIONAL, Replay 다양성 92.0% FAIL -- Dataset이 부족하다는 것이 이 트랙에서 유일하게 '아직 아무도 고치려 시도하지 않은' 축.",
      "Dataset을 늘리면 Representation 검증(재군집화 신뢰도), Cluster 안정성 측정, BP-4류 Lookup 접근 전부가 동시에 더 신뢰할 수 있게 된다 -- 다른 모든 축에 대한 레버리지가 크다.",
      "[BP1~BP5] 5개의 서로 다른 Primitive/Search 시도가 모두 0~32% Coverage 구간에 머물렀다 -- 추가로 같은 패러다임 안에서 6번째를 시도할 경우 기대 한계효용이 낮다.",
    ],
    counterEvidence: ["Dataset 확장은 이 연구 트랙 밖의 새로운 인프라(더 많은 실패 replay 수집/생성)를 필요로 하며, 지금까지의 Sprint들처럼 기존 코드 재사용만으로 끝나지 않을 수 있다 -- 착수 비용이 다른 축보다 높을 수 있다."],
    unverifiedGaps: ["Dataset을 몇 배 늘려야 Gate가 PASS로 바뀌는지, 그리고 그 규모가 현실적으로 확보 가능한지는 전혀 측정된 바 없다."],
    sourceSprintIds: ["SOLVER_V3_KICKOFF", "BP1", "BP2", "BP3", "BP4", "BP5"],
  },
];

// Level 2 check: every EvidenceMap entry must cite real evidence AND every
// sourceSprintId must exist in ResearchTimeline -- "모든 결론이 실측
// Evidence와 연결된다."
export function verifyEvidenceGrounding(): { grounded: boolean; unresolvedCitations: string[] } {
  const timelineIds = new Set(RESEARCH_TIMELINE.map((t) => t.id));
  const matrixIds = new Set(FAILURE_CAUSE_MATRIX.map((m) => m.sprintId));
  const unresolvedCitations: string[] = [];
  for (const link of EVIDENCE_MAP) {
    if (link.evidence.length === 0) unresolvedCitations.push(`${link.id}: evidence 없음`);
    for (const sid of link.sourceSprintIds) {
      if (!timelineIds.has(sid) || !matrixIds.has(sid)) unresolvedCitations.push(`${link.id}: 존재하지 않는 sprintId 인용 (${sid})`);
    }
  }
  return { grounded: unresolvedCitations.length === 0, unresolvedCitations };
}
