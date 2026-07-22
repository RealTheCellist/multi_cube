// --- AlternativeArchitectureComparison (Recovery Architecture Review
// Sprint v1) --------------------------------------------------------------
// STEP4. Compares the current architecture against 3 alternatives, using
// STEP1-3's own real, already-measured numbers as grounding -- no new
// production code, purely a design comparison document.
import type { DeadlineConsumptionSummary } from "./DeadlineConsumptionTimeline";
import type { PerTypeProgressStats } from "./RecoveryNecessityAnalysis";

export type ArchitectureId = "current" | "early" | "incremental" | "opportunistic";

export interface ArchitectureProfile {
  id: ArchitectureId;
  label: string;
  description: string;
  groundedRationale: string;
}

export function describeArchitectures(deadline: DeadlineConsumptionSummary, progressStats: readonly PerTypeProgressStats[]): ArchitectureProfile[] {
  const preEndgameShare = deadline.avgTotalMs ? (deadline.avgPreEndgameTaskMs / deadline.avgTotalMs) * 100 : 0;
  const endgame = progressStats.find((s) => s.type === "ENDGAME");

  return [
    {
      id: "current",
      label: "현재 구조 (Recovery는 ENDGAME 태스크 전용, 항상 마지막)",
      description: "PAIR/FLIP/PARITY 태스크들이 먼저 순차 실행되고, 마지막 ENDGAME 태스크의 기본 파이프라인이 실패했을 때만 Recovery(DISRUPT/SETUP/REPAIR/CCR)가 시도된다.",
      groundedRationale: `실측: 평균 계획(Planning) ${deadline.avgPlanningMs.toFixed(1)}ms, PAIR/FLIP/PARITY 태스크 합계 ${deadline.avgPreEndgameTaskMs.toFixed(1)}ms(전체의 ${preEndgameShare.toFixed(1)}%), ENDGAME+Recovery ${deadline.avgEndgameAndRecoveryMs.toFixed(1)}ms. Recovery는 이미 대부분(${preEndgameShare.toFixed(1)}%)이 소진된 뒤 남은 몫만 받는다.`,
    },
    {
      id: "early",
      label: "Early Recovery (Recovery 자체 예산을 Plan 단계에서 미리 확보)",
      description: "Planner/Executor가 전체 1000ms 중 일정 비율(예: 200-300ms)을 Recovery 전용으로 처음부터 떼어두고, PAIR/FLIP/PARITY+ENDGAME 기본 파이프라인은 나머지 예산 내에서만 동작하도록 한다.",
      groundedRationale: `Blueprint Revision Sprint v1의 counterfactual 실측(+300ms 조기 트리거 시 CCR 생성률 0%->4.1%)에 따르면, 단순히 시간을 더 주는 것만으로는 개선 폭이 작다 -- Early Recovery도 유사한 한계를 가질 가능성이 높다. 다만 그 실험은 "트리거 시점"만 당긴 것이고, Early Recovery는 "예산 자체"를 구조적으로 보장한다는 점에서 다르다.`,
    },
    {
      id: "incremental",
      label: "Incremental Recovery (각 태스크마다 소규모 Recovery 시도)",
      description: "PAIR/FLIP/PARITY 각 태스크가 no-progress로 끝날 때마다 그 자리에서 작은 예산의 Recovery를 한 번씩 시도 -- ENDGAME까지 기다리지 않는다.",
      groundedRationale: `실측: ENDGAME 자체의 no-progress율은 ${((endgame?.noProgressRate ?? 0) * 100).toFixed(1)}%. PAIR/FLIP/PARITY 태스크들에서도 no-progress가 발생하는 비율에 따라(STEP3 참고) 이 전략의 실질적 모집단 크기가 결정된다 -- 만약 그 비율이 낮다면 Incremental Recovery를 구현하는 복잡도 대비 실익이 작을 수 있다.`,
    },
    {
      id: "opportunistic",
      label: "Opportunistic Recovery (전역 예산 여유가 있을 때만, 태스크 무관하게 기회주의적으로 시도)",
      description: "특정 태스크 타입에 묶이지 않고, 매 태스크 완료 시점마다 '지금 남은 시간이 Recovery 한 번을 시도하기에 충분한가'를 판단해, 충분하면 즉시 시도한다.",
      groundedRationale: "CCR/REPAIR 모두 이미 자기 자신의 Gate 체크가 매우 저렴하므로(analyzeMultiCycle 등), '항상 체크만 해보고 예산이 부족하면 스킵'하는 방식은 코드 복잡도 증가가 상대적으로 작다 -- 다만 어느 시점에 검사할지(매 태스크? 매 N ms?)에 대한 정책 설계가 새로 필요하다.",
    },
  ];
}
