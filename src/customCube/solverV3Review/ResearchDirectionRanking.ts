// --- ResearchDirectionRanking (Solver v3 Strategy Review Sprint v1) ------
// STEP4: scores the 6 candidate research directions (spec section 5) on
// 5 criteria, grounded in EvidenceMap.ts's Q1~Q4 answers (imported,
// unmodified) -- no new measurement, only synthesis.
import { EVIDENCE_MAP } from "./EvidenceMap";

export type ScoreLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ResearchDirectionScore {
  direction: string;
  expectedImpact: ScoreLevel;
  feasibility: ScoreLevel;
  existingEvidence: ScoreLevel;
  duplicationRisk: ScoreLevel; // HIGH duplication risk = BAD (already tried, low marginal value)
  productApplicability: ScoreLevel;
  reasoning: string;
  relatedEvidenceIds: string[];
}

export const RESEARCH_DIRECTION_RANKING: ResearchDirectionScore[] = [
  {
    direction: "Dataset 확장",
    expectedImpact: "HIGH",
    feasibility: "MEDIUM",
    existingEvidence: "HIGH",
    duplicationRisk: "LOW",
    productApplicability: "MEDIUM",
    reasoning:
      "STEP0 Gate가 실측으로 확인한 유일한 미해결 축(Replay 다양성 92.0% FAIL)이며, 이 트랙 전체에서 단 한 번도 직접 시도된 적이 없다. Dataset이 커지면 Representation 검증/Cluster 안정성/Lookup류 접근 전부의 신뢰도가 함께 올라가는 레버리지 효과가 있다. 다만 새로운 실패 replay 수집/생성 인프라가 필요해 착수 비용은 다른 축보다 높을 수 있다.",
    relatedEvidenceIds: ["Q1_HARD_GAP_CAUSE", "Q4_COST_EFFECTIVE_DIRECTION"],
  },
  {
    direction: "Representation 개선",
    expectedImpact: "MEDIUM",
    feasibility: "HIGH",
    existingEvidence: "HIGH",
    duplicationRisk: "LOW",
    productApplicability: "MEDIUM",
    reasoning:
      "Solver v3 Kickoff STEP2가 이미 실측으로 검증(Coarse Shape: Singleton 92.8%->66.7%, 재등장률 14.7%->60.0%). 코드도 이미 존재해 착수 비용이 가장 낮다. 다만 '재군집화가 잘 된다'는 것이 '실제 WrongWing 해소로 이어진다'는 것과 같지 않다는 것이 아직 증명되지 않은 간극이다.",
    relatedEvidenceIds: ["Q1_HARD_GAP_CAUSE"],
  },
  {
    direction: "제품 통합",
    expectedImpact: "MEDIUM",
    feasibility: "HIGH",
    existingEvidence: "HIGH",
    duplicationRisk: "LOW",
    productApplicability: "HIGH",
    reasoning:
      "BP-1(Bounded Multi-Cycle Resolver)이 이 트랙 전체에서 유일하게 0% Regression과 함께 실측 Coverage 상승(CycleChase 대비 +2.7~6.7pp, run마다 상이)을 보인 결과다. Level1/3 문턱을 못 넘겨 지금까지 보류돼 왔지만, 그 문턱 자체가 '완전한 해결책'을 요구하는 기준이었지 '제품에 위험 없이 보탬이 되는가'를 묻는 기준은 아니었다.",
    relatedEvidenceIds: ["Q3_HYPOTHESIS_NOVELTY"],
  },
  {
    direction: "Primitive 연구 지속",
    expectedImpact: "LOW",
    feasibility: "MEDIUM",
    existingEvidence: "HIGH",
    duplicationRisk: "HIGH",
    productApplicability: "LOW",
    reasoning:
      "CycleChase/BP-1/BP-2/BP-3/BP-5, 5차례의 서로 다른 시도가 전부 전체 75건 Coverage 0~32% 구간에 머물렀다. 같은 패러다임(기존 계약 유지 + 탐색/구조 조정) 안에서 6번째 변형을 시도할 경우 한계효용이 낮을 것으로 판단된다.",
    relatedEvidenceIds: ["Q2_REPETITION_VS_INDEPENDENT", "Q3_HYPOTHESIS_NOVELTY", "Q4_COST_EFFECTIVE_DIRECTION"],
  },
  {
    direction: "Contract 변경 연구",
    expectedImpact: "LOW",
    feasibility: "LOW",
    existingEvidence: "HIGH",
    duplicationRisk: "HIGH",
    productApplicability: "LOW",
    reasoning:
      "Contract Analysis Sprint v1(분석적 추정)과 BP-5(실제 실행 측정)가 서로 다른 방법론으로 동일한 결론에 도달했다: 병목은 Contract 설계가 아니라 enumerateWingCandidates() 자체의 호출 비용이다. Contract를 더 연구해도 이 병목은 풀리지 않는다 -- 풀려면 보호 파일(Primitive 구현) 자체를 건드려야 하는데, 이는 이 연구 트랙 전체의 정책 범위 밖이다.",
    relatedEvidenceIds: ["Q1_HARD_GAP_CAUSE", "Q2_REPETITION_VS_INDEPENDENT"],
  },
  {
    direction: "Solver 연구 종료",
    expectedImpact: "LOW",
    feasibility: "HIGH",
    existingEvidence: "MEDIUM",
    duplicationRisk: "LOW",
    productApplicability: "LOW",
    reasoning:
      "Primitive/Search 축은 명확히 한계효용이 낮아졌지만, Dataset과 Representation 축은 아직 실측으로 소진되지 않았다 (Dataset은 시도된 적조차 없음). 지금 전면 종료하면 BP-1의 실측된 긍정적 결과(제품 통합 후보)와 Dataset 확장이라는 미시도 축을 모두 포기하게 된다 -- 아직 이르다.",
    relatedEvidenceIds: ["Q1_HARD_GAP_CAUSE", "Q4_COST_EFFECTIVE_DIRECTION"],
  },
];

// Level 2 check helper: every ranking entry must cite EvidenceMap ids that
// actually exist.
export function verifyRankingGrounding(): { grounded: boolean; unresolvedCitations: string[] } {
  const evidenceIds = new Set(EVIDENCE_MAP.map((e) => e.id));
  const unresolvedCitations: string[] = [];
  for (const score of RESEARCH_DIRECTION_RANKING) {
    for (const eid of score.relatedEvidenceIds) {
      if (!evidenceIds.has(eid)) unresolvedCitations.push(`${score.direction}: 존재하지 않는 evidence id 인용 (${eid})`);
    }
  }
  return { grounded: unresolvedCitations.length === 0, unresolvedCitations };
}
