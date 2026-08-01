// --- KnownLimitationRegister (Solver Research Closeout Sprint v1, STEP5)
// -------------------------------------------------------------------------
// Only real, already-disclosed findings from prior committed Sprints are
// recorded here -- nothing speculative. Each entry cites the Sprint that
// actually discovered/confirmed it.
export type LimitationDisposition = "RESOLVED" | "OPERATIONALLY_ACCEPTED" | "FUTURE_RESEARCH_CANDIDATE";

export interface KnownLimitationRow {
  limitation: string;
  disposition: LimitationDisposition;
  evidenceSprint: string;
  note: string;
}

export const KNOWN_LIMITATION_REGISTER: KnownLimitationRow[] = [
  {
    limitation: "attemptRecovery()의 short-circuit allowlist가 MULTI_COMPONENT_MERGE를 누락하고 있어, 이미 net-improving한 결과가 retry-loop 재진입 후 outer deadline 초과 시 조용히 폐기될 수 있었다.",
    disposition: "RESOLVED",
    evidenceSprint: "Multi-Component Merge Short-Circuit Production Integration Sprint v1 (fiveByFiveEdgeRecovery.ts 1줄 수정, 실측 2/2 회복, Regression 0)",
    note: "PARITY_GATED_CYCLE은 이 결함을 애초에 겪은 적이 없었음이 이후 Validation Protocol Qualification Sprint v1에서 코드 감사로 재확인됨.",
  },
  {
    limitation: "MCM/PARITY_GATED_CYCLE처럼 dedicated budget(2000ms)이 real production 기본 Recovery Reserve(250ms)보다 훨씬 큰 Primitive는 solve_e2e 단일 측정만으로 Capability 유무를 판정할 수 없다(구조적으로 관측 안 됨).",
    disposition: "RESOLVED",
    evidenceSprint: "Multi-Component Merge Validation Methodology Qualification Sprint v1 + Validation Protocol Standardization Sprint v1",
    note: "이제 attemptRecovery_direct + solve_e2e 병행 보고를 요구하는 공식 Protocol로 해결됨(측정 방법의 문제였지 Primitive 결함이 아니었음).",
  },
  {
    limitation: "solve()의 PLAN_TIME_BUDGET_MS(1000ms)는 하드코딩되어 있어 외부에서 조정할 수 있는 파라미터가 아니다 -- Recovery의 real 실효 budget을 완전히 독립적으로 조정할 방법이 attemptRecovery_direct 우회 경로 외에는 없다.",
    disposition: "OPERATIONALLY_ACCEPTED",
    evidenceSprint: "Multi-Component Merge Validation Methodology Qualification Sprint v1 STEP1(Measurement Path Audit)",
    note: "solve_e2e에서 유일하게 안전하게 조정 가능한 real 레버는 recoveryReserveMsOverride뿐 -- 이 한계를 인지한 상태로 Validation Protocol(attemptRecovery_direct 병행 측정)이 설계됨. Production 변경 없이 운영 가능.",
  },
  {
    limitation: "PARITY_GATED_CYCLE과 정확히 동일한 2000ms dedicated budget을 가진 것으로 이번 arc에서 새로 확인되었으나, 실제 population 규모(N=142)의 solve_e2e 대규모 실측(Product Validation)은 아직 수행되지 않았다 -- 검증은 3개 known-effect case에 대한 attemptRecovery_direct/solve_e2e 비교로 한정됨.",
    disposition: "OPERATIONALLY_ACCEPTED",
    evidenceSprint: "PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1",
    note: "Decision A(Protocol 채택)는 이미 확정됨 -- 대규모 Product Validation은 Validation Protocol이 이미 그 결과가 실사용 조건에서 낮게 나올 것을 예측/설명할 수 있으므로 필수는 아니나, 원한다면 향후 후속 Sprint로 가능.",
  },
  {
    limitation: "이 프로젝트는 이전에 한 차례 'Production Release Complete, 추가 Primitive 연구는 종료한다'는 공식 종료 선언(PRODUCTION_RELEASE_CLOSEOUT.md)을 했으나, 그 이후로도 CCR/MixedCommutator/MultiComponentMerge/ParityGatedCycle 등 다수의 신규 Primitive 연구가 계속되었다.",
    disposition: "RESOLVED",
    evidenceSprint: "PRODUCTION_RELEASE_CLOSEOUT.md (조기 선언) vs 이후 실제 진행된 15개+ Sprint",
    note: "거버넌스 교훈: '종료 선언'은 그 시점까지 확인된 범위에서만 유효하며, 새로운 Primitive Discovery가 승인되면 언제든 재개될 수 있다. 이번 Research Closeout Sprint v1은 이 교훈을 반영해, 새로운 연구 없이 유지보수만으로 충분한지를 실제로 재확인한 뒤 선언한다(Roadmap 우선순위①).",
  },
  {
    limitation: "일부 Gate 판정이 완전한 PASS가 아니라 OPEN_QUESTION으로 남은 사례가 있다(예: Short-Circuit Sprint의 Gate C/E, starvedTypeCount 지표가 이 population 규모에는 과도하게 엄격한 것으로 disclosed됨).",
    disposition: "OPERATIONALLY_ACCEPTED",
    evidenceSprint: "Multi-Component Merge Short-Circuit Production Integration Sprint v1 STEP6",
    note: "각 사례 모두 실측 근거와 함께 disclosed되었으며, newRegressionCount=0이 확인된 상태에서의 OPEN_QUESTION이므로 운영 리스크로 간주하지 않는다.",
  },
  {
    limitation: "Solver는 확률적(shuffle() 기반) 요소를 가지므로 동일 조건에서도 run-to-run wall-clock 타이밍이 달라질 수 있다(이 arc 전체에서 반복 관측됨, 예: PARITY Sprint의 attemptRecoveryThresholdMs가 재실행 시 1000ms/1500ms로 달라짐).",
    disposition: "OPERATIONALLY_ACCEPTED",
    evidenceSprint: "Production Release Closeout(평가 방법 고정, N-trial 평균 원칙) + PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1(재실행 시 임계값 변동 실측)",
    note: "이미 확정된 평가 방법(Paired 비교, N-trial 평균, 95% CI, Cohen's d)으로 흡수되는 범위 -- 단일 실행 결과를 Release Gate로 쓰지 않는다는 원칙이 이 변동성에 대한 정식 대응책이다.",
  },
];
