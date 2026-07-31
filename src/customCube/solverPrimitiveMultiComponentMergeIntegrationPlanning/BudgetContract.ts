// --- BudgetContract (Multi-Component Merge Production Integration
// Planning Sprint v1, STEP3) -------------------------------------------------
// Design-only. Compares 4 Budget policies for Multi-Component Merge,
// grounded in this arc's own established Budget Contract vocabulary
// (fixed reserved-slice vs "remainingTime", already used for CCR/
// PARITY_GATED_CYCLE/MIXED_COMMUTATOR/REPAIR/SETUP) and the real measured
// runtime from the Comparative Prototype Sprint v1
// (multiAvgRuntimeMs=528.5ms) and MultiComponentMergePrototype.ts's own
// real deadline arithmetic (PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms
// reused as its own outer deadline, BRIDGE_SUB_BUDGET_MS=300ms per merge
// step, MAX_SEQUENTIAL_MERGES=4).
export type BudgetPolicyId = "REMAINING_TIME" | "FIXED_BUDGET" | "DEDICATED_SLICE" | "SHARED_SLICE";

export interface BudgetPolicyOption {
  id: BudgetPolicyId;
  name: string;
  description: string;
  pros: string;
  cons: string;
}

export const BUDGET_POLICY_OPTIONS: BudgetPolicyOption[] = [
  {
    id: "REMAINING_TIME",
    name: "Remaining Time",
    description: "CCR과 동일한 스타일 -- 앞선 단계(REPAIR/CCR)가 남긴 시간을 그대로 MCM에 넘긴다(자체 상한 없음).",
    pros: "예산 낭비가 없다 -- 남은 시간을 최대한 활용.",
    cons:
      "Integration Architecture Analysis Sprint v1이 CCR의 remainingTime 계약이 뒤따르는 Primitive를 굶기는 " +
      "근본 원인임을 이미 실측으로 확인했다 -- MCM에도 동일한 위험이 재현된다. MCM은 componentCount>=3(실측 " +
      "9/142, 6.3%)에서만 발동하므로 REPAIR/CCR이 이미 대부분의 시간을 소비한 뒤에는 MCM 자신의 " +
      "avgRuntimeMs(528.5ms)조차 확보 못 할 위험.",
  },
  {
    id: "FIXED_BUDGET",
    name: "Fixed Budget",
    description: "MCM 전용 고정 슬라이스를 부여한다 -- 실측 avgRuntimeMs(528.5ms)를 반올림한 600ms 제안.",
    pros: "예측 가능성이 높고, PARITY_GATED_CYCLE_RESERVED_SLICE_MS(2000ms)보다 훨씬 작아 Outer Deadline(1000ms) " +
      "전체를 침해할 위험이 낮다.",
    cons: "componentCount>=3 케이스 중 MAX_SEQUENTIAL_MERGES=4번의 병합 시도가 모두 필요한 극단적 케이스에서는 " +
      "600ms가 부족할 수 있다(4번의 BRIDGE_SUB_BUDGET_MS=300ms 순차 시도만으로도 이론상 최대 1200ms).",
  },
  {
    id: "DEDICATED_SLICE",
    name: "Dedicated Slice",
    description:
      "PARITY_GATED_CYCLE_RESERVED_SLICE_MS(2000ms)를 그대로 재사용 -- MultiComponentMergePrototype.ts의 " +
      "runMultiComponentMergePipeline()이 이미 이 값을 자신의 deadline으로 쓰고 있다(코드 변경 없이 그대로 재사용 " +
      "가능).",
    pros:
      "실제 Prototype 코드가 이미 이 예산 계약으로 실측(avgRuntimeMs=528.5ms, 2000ms 예산의 26.4%만 사용)됐으므로 " +
      "추가 검증 없이 그대로 채택 가능 -- 구현 복잡도가 가장 낮다.",
    cons:
      "PARITY_GATED_CYCLE도 이미 동일한 2000ms 슬라이스를 쓰고 있어, STEP1의 BEFORE_PARITY 위치와 결합하면 " +
      "MCM+PARITY_GATED_CYCLE 합산 Worst-Case가 4000ms까지 늘어날 수 있다(다만 MCM Gate가 componentCount>=3일 " +
      "때만 발동하고, 그 경우 PARITY_GATED_CYCLE은 componentCount==2 케이스만 남으므로 두 슬라이스가 같은 케이스에서 " +
      "동시에 전부 소진되는 일은 Gate 설계상 없다 -- STEP2/STEP6 Gate 배타성 참고).",
  },
  {
    id: "SHARED_SLICE",
    name: "Shared Slice",
    description: "MCM이 PARITY_GATED_CYCLE_RESERVED_SLICE_MS(2000ms)를 PARITY_GATED_CYCLE과 공유한다(둘 중 먼저 " +
      "실행되는 쪽이 남긴 시간만큼만 뒤쪽이 쓴다).",
    pros: "새 예산 상수를 도입하지 않아도 된다.",
    cons:
      "Hybrid Primitive Blueprint Sprint v1의 STEP3(BudgetArchitecture.ts, Shared Budget 옵션)가 이미 같은 " +
      "결론을 냈다 -- 공유 예산에서는 먼저 실행되는 쪽이 뒤쪽을 굶긴다(Budget Starvation). STEP2/STEP6 Gate " +
      "배타성으로 두 Primitive가 같은 케이스에서 동시에 실행될 일이 없다면 이 리스크 자체가 발생하지 않지만, " +
      "그 전제가 깨지면(예: Gate 완화) 즉시 재현되는 구조적 취약점이다.",
  },
];
