// --- HybridSchedulingDesign (Parity-Gated Cycle Hybrid Primitive
// Blueprint Sprint v1, STEP2) --------------------------------------------------
// Design-only. Three candidate hybrid call orders, per the Directive's
// own spec, with Runtime/Budget/Scheduler impact grounded in the
// Comparative Prototype Sprint v1's own real measured avgRuntimeMs
// (Dual=492.9ms, Multi=528.5ms, cited not re-derived).
export type HybridOptionId = "A_DUAL_THEN_MULTI" | "B_MULTI_THEN_DUAL" | "C_GATE_BASED_SELECTION";

export interface HybridSchedulingOption {
  id: HybridOptionId;
  name: string;
  description: string;
  runtimeImpact: string;
  budgetImpact: string;
  schedulerImpact: string;
}

export function buildHybridSchedulingOptions(dualAvgRuntimeMs: number, multiAvgRuntimeMs: number): HybridSchedulingOption[] {
  const sequentialRuntimeMs = dualAvgRuntimeMs + multiAvgRuntimeMs;
  return [
    {
      id: "A_DUAL_THEN_MULTI",
      name: "Option A: Dual -> Multi",
      description: "Dual Wing Bridge를 먼저 시도하고, 실패(또는 개선 없음)할 때만 Multi-Component Merge를 시도한다.",
      runtimeImpact:
        `Overlap 분석(STEP1) 결과 dualOnlyCount=0이므로, Dual이 성공하는 모든 케이스는 Multi도 이미 성공한다 -- ` +
        `Dual을 먼저 실행해도 그 성공 케이스에서 Multi 실행이 생략되어 실제로는 절약이 있을 수 있으나, Dual이 ` +
        `실패하는 압도적 다수(129/142 Neither + 2/142 Multi-only 케이스)에서는 항상 Dual+Multi 순차 실행 ` +
        `비용(약 ${sequentialRuntimeMs.toFixed(0)}ms)을 전부 지불한다.`,
      budgetImpact: "Dual의 실제 2000ms reserved slice를 다 쓰고도 실패하면 Multi에게 남는 예산이 줄어들 위험 -- Shared Budget 정책에서 특히 문제.",
      schedulerImpact: "genParityGatedCycle() 내부에 두 번째 호출을 추가하는 정도 -- Recovery/Planner 레이어 변경 없음(둘 다 이미 그렇게 설계됨).",
    },
    {
      id: "B_MULTI_THEN_DUAL",
      name: "Option B: Multi -> Dual",
      description: "Multi-Component Merge를 먼저 시도하고, 실패할 때만 Dual Wing Bridge를 시도한다.",
      runtimeImpact:
        "Multi가 이미 Dual의 모든 성공 케이스를 커버하므로(dualOnlyCount=0), Multi가 실패하면 Dual도 거의 항상 " +
        "실패한다(overlapRatioOfSmaller=1.0) -- Dual을 2차로 두는 것은 사실상 추가 실행 비용만 발생시키고 " +
        "추가로 구제하는 케이스가 이론상 0에 가깝다.",
      budgetImpact: "Option A와 대칭적이나, 실질적 이득이 Option A보다도 낮다(아래 STEP4 Expected Rescue 참고).",
      schedulerImpact: "Option A와 동일하게 Recovery/Planner 레이어 변경 없음.",
    },
    {
      id: "C_GATE_BASED_SELECTION",
      name: "Option C: Gate 기반 선택",
      description: "componentCount 등 구조적 신호로 둘 중 하나만 실행 -- 예: componentCount>2면 Multi, ==2면 Dual.",
      runtimeImpact:
        "두 Primitive를 항상 순차 실행하지 않아 Option A/B보다 평균 runtime이 낮다 -- 다만 STEP1 Overlap 분석이 " +
        "이미 Multi가 Dual의 상위집합임을 보였으므로, componentCount==2일 때 Dual을 선택하는 것은 Multi보다 " +
        "나은 결과를 주지 못하고(오히려 multiOnlyCount=2인 케이스를 놓칠 위험), Gate 설계의 이점이 실증적으로 약하다.",
      budgetImpact: "Gate 판정 자체는 이미 계산된 componentCount를 재사용하므로 추가 비용 거의 없음.",
      schedulerImpact: "Recovery/Planner 레이어 변경 없음 -- 다만 Gate 로직 자체가 genParityGatedCycle() 내부에 새로 필요.",
    },
  ];
}
