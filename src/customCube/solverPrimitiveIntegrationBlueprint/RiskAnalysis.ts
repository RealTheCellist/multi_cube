// --- RiskAnalysis (Solver Primitive Integration Blueprint Sprint v1) ---
// STEP5: risks of wiring W2_widerHop into Recovery as a REPAIR-typed
// candidate, each with likelihood/impact/mitigation grounded in the
// real, already-measured numbers from this research series (cited, not
// re-derived -- no Prototype execution in this Sprint).
export type Likelihood = "낮음" | "중간" | "높음";
export type Impact = "낮음" | "중간" | "높음";

export interface RiskEntry {
  name: string;
  likelihood: Likelihood;
  impact: Impact;
  mitigation: string;
}

export const RISK_ANALYSIS: RiskEntry[] = [
  {
    name: "Planner starvation",
    likelihood: "낮음",
    impact: "낮음",
    mitigation: "PlannerDependencyAnalysis.ts에서 확인했듯 Planner는 Recovery 존재 자체를 모른다(캡슐화 완전). REPAIR 후보 추가가 Planner의 Strategy 시뮬레이션/선택에 영향을 줄 경로가 없다.",
  },
  {
    name: "Primitive priority conflict (REPAIR가 DISRUPT/SETUP과 점수 스케일이 안 맞아 항상 이기거나 항상 짐)",
    likelihood: "중간",
    impact: "중간",
    mitigation:
      "REPAIR의 score도 기존과 동일한 공식(futurePotential - moves.length*MOVE_COST_WEIGHT)을 그대로 쓰므로 스케일 자체는 호환된다. 다만 W2가 net-improvement만 채택하는 반면 DISRUPT는 의도적으로 wrongWingCount를 늘렸다가 회복하는 방식이라 futurePotential의 분포가 다를 수 있다 -- Integration Prototype Sprint에서 실제 점수 분포를 측정해 필요시 보정한다(이 Blueprint는 문제를 식별할 뿐 코드로 고치지 않는다).",
  },
  {
    name: "Infinite retry",
    likelihood: "낮음",
    impact: "높음", // 발생 시 영향도가 크다는 뜻 -- likelihood가 낮아 종합 리스크는 낮음
    mitigation: "attemptRecovery의 기존 visited 상태-해시 루프 방지 + MAX_RECOVERY_RETRIES=1 캡이 REPAIR 후보에도 동일하게 적용된다(후보 유형과 무관하게 attemptRecovery 레벨에서 이미 보장). REPAIR 자체 로직(runInstrumentedBoundedSearch)도 MAX_LEAVES_EXPLORED로 자체 상한이 있어 이중으로 안전하다.",
  },
  {
    name: "Regression 가능성",
    likelihood: "낮음",
    impact: "높음", // 발생 시 영향도가 크다는 뜻 -- likelihood가 낮아 종합 리스크는 낮음
    mitigation:
      "이중 검증(IntegrationContract.ts의 deferredValidation 참고): W2 자체의 validateDeferred + attemptRecovery의 originalBaseline/finalWrong 비교. " +
      "실측 근거: Prototype Refinement Sprint v2에서 W2_widerHop은 N=15회 전부 Regression 0건(paired diff가 매 회 0 또는 +1, 한 번도 음수 없음).",
  },
  {
    name: "Recovery interaction (REPAIR가 선택된 뒤 기존 retryTask 재시도 단계와 의미가 겹치거나 낭비됨)",
    likelihood: "중간",
    impact: "낮음",
    mitigation:
      "REPAIR의 moves는 이미 net-improving임이 자체 검증되어 있으므로, DISRUPT/SETUP처럼 반드시 retryTask로 재시도해야 성공을 인정받는 기존 흐름과 의미가 다르다 -- IntegrationContract.ts의 primitivePriority에서 논의한 short-circuit 여부가 바로 이 리스크에 대한 대응이다. 이번 Blueprint는 이 설계 결정을 명시적으로 다음 Sprint(Integration Prototype Sprint v1)로 넘긴다 -- 코드가 없는 이번 Sprint 범위에서는 실제 비효율을 만들지 않는다.",
  },
  {
    name: "Time budget 초과",
    likelihood: "중간",
    impact: "중간",
    mitigation:
      "RECOVERY_GEN_BUDGET_MS=300ms를 이제 4개 후보(기존 DISRUPT x2/SETUP x1 + REPAIR)로 나누면 후보당 slice()가 약 300/4=75ms로 줄어든다. " +
      "Prototype Sprint v3 실측: gate_matched 상태의 평균 실행 시간 157.90ms(당시 400ms 독립 예산 기준) -- 75ms 공유 슬라이스로는 자주 시간 내 완료 못 할 수 있다. " +
      "완화책 후보(이 Blueprint는 선택만 제시, 코드 변경 없음): (a) RECOVERY_GEN_BUDGET_MS를 소폭 늘린다, (b) REPAIR에 다른 후보보다 큰 slice 비율을 배정한다(현재 slice()는 후보 수로 균등 분배), (c) 시간 내 완료 못 하면 그냥 후보 미생성으로 두고(기존 add()의 실패-시-미포함 계약 그대로) DISRUPT/SETUP만으로 진행 -- (c)가 가장 기존 계약과 일치하며 이번 Blueprint의 기본 권장안이다.",
  },
];

export const ANY_HIGH_LIKELIHOOD_HIGH_IMPACT_UNMITIGATED = RISK_ANALYSIS.some((r) => r.likelihood === "높음" && r.impact === "높음" && !r.mitigation);
