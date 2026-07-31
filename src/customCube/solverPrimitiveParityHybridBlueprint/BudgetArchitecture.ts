// --- BudgetArchitecture (Parity-Gated Cycle Hybrid Primitive Blueprint
// Sprint v1, STEP3) -----------------------------------------------------------
// Design-only. Four budget distribution policies for a Hybrid call,
// grounded in this arc's own established Budget Contract vocabulary
// (fixed reserved-slice vs "remainingTime", already used throughout for
// CCR/PARITY_GATED_CYCLE/MIXED_COMMUTATOR) and the real measured
// runtimes from the Comparative Prototype Sprint.
export type BudgetPolicyId = "SHARED_BUDGET" | "DEDICATED_SLICE" | "REMAINING_TIME" | "ADAPTIVE_SPLIT";

export interface BudgetPolicyOption {
  id: BudgetPolicyId;
  name: string;
  description: string;
  pros: string;
  cons: string;
}

export const BUDGET_POLICY_OPTIONS: BudgetPolicyOption[] = [
  {
    id: "SHARED_BUDGET",
    name: "Shared Budget",
    description: "두 Primitive가 하나의 2000ms 예산을 순서대로 나눠 쓴다 -- 1번째가 오래 쓸수록 2번째 몫이 줄어든다.",
    pros: "구현이 가장 단순하다 -- 기존 PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000을 그대로 재사용하면 됨.",
    cons: "Integration Architecture Analysis Sprint v1이 이미 CCR과 PARITY_GATED_CYCLE 사이에서 정확히 이 " +
      "패턴(공유 예산에서 먼저 실행되는 쪽이 뒤쪽을 굶긴다, Budget Starvation)을 실측으로 확인한 바 있다 -- " +
      "같은 위험이 두 Hybrid 구성요소 사이에도 그대로 적용된다.",
  },
  {
    id: "DEDICATED_SLICE",
    name: "Dedicated Slice",
    description: "각 Primitive에 독립적으로 고정 슬라이스(예: 각 1000ms)를 부여한다.",
    pros: "두 Primitive가 서로의 실행 시간에 영향받지 않아 예측 가능성이 높다.",
    cons: "STEP1 Overlap 분석 결과(dualOnlyCount=0) Dual에 별도 슬라이스를 할당하는 것은 대부분의 경우 낭비다 -- " +
      "Dual이 기여하는 추가 Capability가 사실상 없는데도 항상 고정 시간을 소비하게 된다.",
  },
  {
    id: "REMAINING_TIME",
    name: "Remaining Time",
    description: "CCR과 동일한 스타일 -- 앞선 단계가 남긴 시간을 그대로 다음 Primitive에 넘긴다(자체 상한 없음).",
    pros: "예산 낭비가 없다 -- 남은 시간을 최대한 활용.",
    cons: "이 아크에서 이미 CCR의 remainingTime 계약이 뒤따르는 Primitive를 굶기는 근본 원인으로 확인된 바 있다 " +
      "(Integration Architecture Analysis Sprint v1) -- Hybrid 내부에서도 동일한 위험을 재현할 뿐이다.",
  },
  {
    id: "ADAPTIVE_SPLIT",
    name: "Adaptive Split",
    description: "구조적 신호(componentCount 등)에 따라 두 Primitive 사이의 예산 비율을 동적으로 조정한다.",
    pros: "이론상 가장 정교하지만, STEP1 Overlap 분석이 이미 Dual의 실증적 기여가 0에 가깝다는 것을 보여줬으므로, " +
      "이 정교함을 투자할 실익이 낮다.",
    cons: "설계/구현 복잡도가 4개 정책 중 가장 높다 -- Multi-Component Merge 단독 대비 얻는 이득이 " +
      "STEP4(Expected Rescue)에서 확인되는 한계를 넘지 못한다면 정당화되지 않는다.",
  },
];
