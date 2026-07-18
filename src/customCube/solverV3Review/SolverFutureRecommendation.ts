// --- SolverFutureRecommendation (Solver v3 Strategy Review Sprint v1) ----
// STEP5: the final recommendation, required by spec section 6 Level 3 to
// resolve to exactly one of A/B/C/D/E. Synthesizes EvidenceMap.ts (Q1~Q4)
// and ResearchDirectionRanking.ts (both imported, unmodified) -- no new
// measurement.
import { EVIDENCE_MAP } from "./EvidenceMap";
import { RESEARCH_DIRECTION_RANKING } from "./ResearchDirectionRanking";

export type FinalOutcome = "A" | "B" | "C" | "D" | "E";

export interface FinalRecommendation {
  outcome: FinalOutcome;
  outcomeLabel: string;
  reasoning: string;
  parallelNoRegretActions: string[]; // cheap, already-validated actions worth doing regardless of the primary outcome
  specMappingNote: string; // discloses a real gap in the work order itself
  q1Answer: string;
  q2Answer: string;
  q3Answer: string;
  q4Answer: string;
}

function findEvidence(id: string): string {
  const link = EVIDENCE_MAP.find((e) => e.id === id);
  return link ? link.conclusion : "(누락된 evidence id)";
}

export const SOLVER_FUTURE_RECOMMENDATION: FinalRecommendation = {
  outcome: "C",
  outcomeLabel: "Dataset 확장 우선",
  reasoning:
    "ResearchDirectionRanking.ts의 5개 기준 전반에서 Dataset 확장이 유일하게 '기존근거=HIGH, 중복위험=LOW, 기대효과=HIGH'를 동시에 만족한다. " +
    "Solver v2/v3 두 세대에 걸쳐 Primitive/Search 축은 5차례(CycleChase/BP-1/BP-2/BP-3/BP-5) 시도돼 한계효용이 뚜렷이 감소했고, Contract 축은 " +
    "두 번(Contract Analysis/BP-5)의 서로 다른 방법론이 같은 결론(병목은 Contract가 아니라 Primitive 호출 비용)에 도달해 더 연구할 이유가 " +
    "적다. 반면 Dataset 부족은 Solver v3 Kickoff STEP0 Gate가 실측으로 확인했음에도(Replay 다양성 92.0% FAIL) 이 트랙 전체에서 단 한 번도 " +
    "직접 다뤄진 적이 없다 -- 유일하게 남은, 근거는 있지만 아직 시도되지 않은 축이다. Dataset이 확장되면 Representation/Cluster 안정성/Lookup류 " +
    "접근 전부의 신뢰도가 함께 올라가는 레버리지 효과도 있다.",
  parallelNoRegretActions: [
    "제품 통합 검토: BP-1(Bounded Multi-Cycle Resolver)은 이 트랙 전체에서 유일하게 0% Regression과 함께 실측 Coverage 상승(+2.7~6.7pp, run마다 상이)을 보인 결과다. Dataset 확장을 기다릴 필요 없이 별도 정책 결정 Sprint로 즉시 검토 가능.",
    "Representation 개선 반영: Coarse Structural Shape(Solver v3 Kickoff STEP2)는 이미 구현되어 있고 재군집화 개선이 실측으로 확인됐다. Dataset 확장과 병행해 기존 진단 도구들(GapDetector 등)에 우선 반영할 수 있다.",
  ],
  specMappingNote:
    "spec 5절은 '제품 통합'을 6개 연구 방향 후보 중 하나로 나열하지만, 6절의 최종 권고 A~E 다섯 글자 중 어디에도 '제품 통합'에 직접 대응하는 글자가 없다 " +
    "(A 새Blueprint계속/B Representation우선/C Dataset확장우선/D Contract연구전환/E Solver연구종료). 이는 spec 자체의 실제 불일치이므로, 이 Review는 " +
    "'제품 통합'을 별도의 병행 가능한 액션(parallelNoRegretActions)으로 명시적으로 분리해 다뤘다 -- 다섯 글자 중 하나로 억지로 욱여넣지 않았다.",
  q1Answer: findEvidence("Q1_HARD_GAP_CAUSE"),
  q2Answer: findEvidence("Q2_REPETITION_VS_INDEPENDENT"),
  q3Answer: findEvidence("Q3_HYPOTHESIS_NOVELTY"),
  q4Answer: findEvidence("Q4_COST_EFFECTIVE_DIRECTION"),
};

// Level 3 check: outcome must be exactly one of A~E, and the direction it
// names must actually appear (and be scored) in ResearchDirectionRanking.
export function verifyFinalRecommendation(): { resolved: boolean; reason: string } {
  const OUTCOME_TO_DIRECTION: Record<FinalOutcome, string | null> = {
    A: "Primitive 연구 지속",
    B: "Representation 개선",
    C: "Dataset 확장",
    D: "Contract 변경 연구",
    E: "Solver 연구 종료",
  };
  const directionName = OUTCOME_TO_DIRECTION[SOLVER_FUTURE_RECOMMENDATION.outcome];
  const scored = RESEARCH_DIRECTION_RANKING.some((r) => r.direction === directionName);
  return {
    resolved: !!directionName && scored,
    reason: scored ? `결론 ${SOLVER_FUTURE_RECOMMENDATION.outcome} (${directionName})이 ResearchDirectionRanking에서 실제로 평가됨` : "결론이 평가된 방향과 대응되지 않음",
  };
}
