// --- SchedulingVariants (Solver Primitive Integration Refinement Sprint
// v1) -- named, disclosed descriptions of the 3 candidate-generation
// scheduling rules under comparison. The actual scheduling LOGIC lives in
// fiveByFiveEdgeRecovery.ts's generateRecoveryStrategies() (this Sprint's
// authorized scheduling change) -- this file only carries the reporting
// labels, no behavior of its own.
import type { SchedulingStrategy } from "../fiveByFiveEdgeRecovery";

export type { SchedulingStrategy };

export interface SchedulingVariantInfo {
  strategy: SchedulingStrategy;
  label: string;
  description: string;
}

export const SCHEDULING_VARIANTS: SchedulingVariantInfo[] = [
  {
    strategy: "baseline",
    label: "Baseline (현재 production)",
    description: "DISRUPT,DISRUPT,SETUP,REPAIR 순서, 4개 후보가 공유 genDeadline(300ms)을 순서대로 나눠 쓴다 -- Integration Prototype Sprint v1이 실제로 배선한, 지금 production이 쓰는 그 동작.",
  },
  {
    strategy: "priorityGate",
    label: "Strategy A: Priority Scheduling",
    description: "REPAIR를 가장 먼저 시도한다(REPAIR -> DISRUPT -> DISRUPT -> SETUP). 공유 genDeadline 메커니즘 자체는 그대로-- 순서만 바꿔 REPAIR가 아직 아무도 쓰지 않은 예산을 먼저 받게 한다.",
  },
  {
    strategy: "reservedBudget",
    label: "Strategy B: Reserved Budget",
    description: "순서는 기존 그대로(DISRUPT,DISRUPT,SETUP,REPAIR) 유지하되, REPAIR 차례에는 DISRUPT/SETUP이 genDeadline을 이미 넘겼는지와 무관하게 항상 실행하고, 별도의 전용 75ms 창(REPAIR_RESERVED_SLICE_MS)을 준다.",
  },
];
