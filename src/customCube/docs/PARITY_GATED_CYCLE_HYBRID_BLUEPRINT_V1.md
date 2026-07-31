# Parity-Gated Cycle Hybrid Primitive Blueprint Sprint v1

## Section 0. 범위 및 방법론 disclosure

Comparative Prototype Sprint v1의 결론은 "두 Primitive(Dual Wing
Bridge, Multi-Component Merge) 모두 Baseline보다 확실히 좋지만, 서로는
통계적으로 구분되지 않는다"(Dual vs Multi improvedCountDiff 95%
CI=[-0.0335, 0.0054], 0을 포함)였다. 이 Sprint는 그 결론을 그대로
존중하고, 억지로 하나를 선택하는 대신 두 Primitive의 상호보완성
(additivity)을 검증했다.

**이번 Sprint는 설계(Blueprint)만 진행한다 -- 실제 코드를 구현하지
않는다.** 새로운 Replay도 실행하지 않았다 -- Comparative Prototype
Sprint v1이 이미 만들어 둔 실측 결과 JSON
(`parity-gated-cycle-comparative-prototype-v1-result.json`, 142-case
전체 population의 per-case `dualImproved`/`multiImproved` 포함)을
그대로 재사용해 STEP1-6을 도출했다. Production Solver 및 보호 파일
(`fiveByFiveEdgeRecovery.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeSolverEngine.ts`,
`fiveByFiveEdges.ts`, `solverV2Prototype/DeferredValidator.ts`,
`solverV2Prototype/MultiCycleAnalyzer.ts`)는 `git diff --stat` 결과
0건 변경 확인.

검증 원칙(Directive 원문):
1. Comparative Sprint의 결론(두 Primitive 간 통계적 동률)을 그대로 존중한다.
2. 원시 성공 건수(11 vs 13)가 아니라 Overlap과 Exclusive Capability를 기준으로 Hybrid 가능성을 판단한다.
3. Blueprint 단계에서는 실제 코드를 구현하지 않고, Replay 데이터를 기반으로 Hybrid의 기대 효과와 Integration 구조를 설계한다.
4. Hybrid의 타당성은 추가 Capability(Expected Rescue)와 Duplicate Success를 함께 고려하여 평가한다.

## STEP1. Capability Overlap Analysis

`CapabilityOverlapAnalysis.ts` -- 142-case 전체에 대해 Dual/Multi 각각의
`improved` 플래그를 4-way 분류(DUAL_ONLY/MULTI_ONLY/BOTH/NEITHER)한 뒤
Jaccard Index, Overlap Ratio, Exclusive Capability를 계산.

실측 결과:

| 지표 | 값 |
|---|---|
| dualOnlyCount | **0** |
| multiOnlyCount | 2 |
| bothCount | 11 |
| neitherCount | 129 |
| dualTotalSuccessCount | 11 |
| multiTotalSuccessCount | 13 |
| unionSuccessCount | 13 |
| jaccardIndex | 0.846 |
| overlapRatioOfSmaller | 1.000 |
| exclusiveCapabilityCount | 2 |
| exclusiveCapabilityPercentOfUnion | 15.4% |

**핵심 발견**: `dualOnlyCount=0` -- Dual Wing Bridge가 단독으로만
성공시키는 케이스가 전체 142건 중 단 하나도 없다. Dual의 성공 11건은
전부 Multi의 성공 13건에 포함된다(`overlapRatioOfSmaller=1.000`).
즉 이 population 위에서 Multi-Component Merge는 Dual Wing Bridge의
Capability를 실증적으로 완전히 포함하는 상위집합이다. Exclusive
Capability는 전부 Multi 쪽(2건)에서만 나온다.

## STEP2. Hybrid Scheduling Design

`HybridSchedulingDesign.ts` -- 3개 호출 순서 옵션을 설계, 각각 STEP1의
`dualOnlyCount=0` 실측을 근거로 Runtime/Budget/Scheduler 영향을 분석.

- **Option A (Dual → Multi)**: Dual이 실패하는 129/142 Neither +
  2/142 Multi-only 케이스에서는 항상 순차 실행 비용(약 1021ms =
  dualAvgRuntimeMs 492.9 + multiAvgRuntimeMs 528.5)을 전부 지불.
- **Option B (Multi → Dual)**: Multi가 이미 Dual의 모든 성공 케이스를
  커버하므로(`overlapRatioOfSmaller=1.0`), Multi 실패 시 Dual도 거의
  항상 실패 -- 2차로 Dual을 두는 이득이 이론상 0에 가까움.
  Option A보다도 실질 이득이 낮음.
- **Option C (Gate 기반 선택, 예: componentCount>2→Multi, ==2→Dual)**:
  두 Primitive를 상시 순차 실행하지 않아 평균 runtime은 낮지만,
  componentCount==2일 때 Dual을 택하는 것은 Multi보다 나은 결과를
  주지 못하고(오히려 multiOnlyCount=2 케이스를 놓칠 위험) -- Gate
  설계의 이점이 실증적으로 약함.

## STEP3. Budget Architecture

`BudgetArchitecture.ts` -- 4개 예산 배분 정책, 각각 pros/cons 기록.

- **Shared Budget**: 구현 단순하나, Integration Architecture Analysis
  Sprint v1이 CCR-PARITY_GATED_CYCLE 사이에서 실측으로 확인한 Budget
  Starvation 패턴(공유 예산에서 먼저 실행되는 쪽이 뒤쪽을 굶긴다)이
  두 Hybrid 구성요소 사이에도 그대로 재현될 위험.
- **Dedicated Slice**: 예측 가능성은 높으나, `dualOnlyCount=0`이므로
  Dual에 별도 슬라이스를 항상 할당하는 것은 대부분 낭비.
- **Remaining Time**: 예산 낭비는 없으나, 이 아크에서 이미 CCR의
  `remainingTime` 계약이 뒤따르는 Primitive를 굶기는 근본 원인으로
  확인됨(같은 위험 재현).
- **Adaptive Split**: 이론상 가장 정교하나, STEP1이 이미 Dual의
  실증적 기여가 0에 가깝다는 것을 보여줘 이 정교함을 투자할 실익이 낮음.

## STEP4. Counterfactual Capability Estimation

`CounterfactualCapabilityEstimation.ts` -- 실제 구현 없이, STEP1의
`OverlapSummary`만으로 Expected Rescue / Upper Bound / Duplicate
Success를 계산.

| 지표 | 값 |
|---|---|
| bestSinglePrimitive | MULTI |
| bestSingleSuccessCount | 13 |
| upperBoundSuccessCount | 13 |
| **expectedRescueOverBestSingle** | **0** |
| duplicateSuccessCount | 11 |
| marginalRescuePercentOfPopulation | 0.0% |
| extraRuntimeCostForMarginalRescueMs | 492.9 |

**핵심 발견**: Multi-Component Merge 단독이 이미 union upper bound
(13/13)를 전부 달성한다. Hybrid가 Multi 단독 대비 추가로 얻는
Capability(Expected Rescue)는 정확히 **0**이다. 반면 두 Primitive를
모두 실행하면 duplicateSuccessCount=11건에서 이미 중복 계산이 발생하고,
Dual이 아무 것도 구제하지 못하는 나머지 대다수 케이스에서도 매번
Dual의 런타임(약 493ms)을 추가로 지불해야 한다.

## STEP5. Integration Risk

`IntegrationRisk.ts` -- Hybrid가 현재 Recovery 구조에 미치는 영향을
Scheduler/Recovery/Runtime/Production 변경량/Regression 위험 축으로 분석.

- **Scheduler 영향**: 낮음 -- 두 Prototype 모두 `genParityGatedCycle()`과
  동일한 단일 호출 구성을 재사용하므로 새 Scheduler 없이 같은 자리에서
  순차 호출하는 정도로 구현 가능.
- **Recovery 영향**: 낮음 -- Comparative Prototype Sprint v1 실측상 두
  Prototype 모두 `fiveByFiveEdgeRecovery.ts`/`fiveByFiveEdgePlanner.ts`
  변경 없이 구현됨(plannerFilesTouched=0, recoveryFilesTouched=0).
- **Runtime 영향**: 불균형 -- STEP4 실측 기준 marginal rescue는 0건
  (0.0%)인 반면, 나머지 대다수 케이스에서도 매번 추가 Primitive
  런타임(493ms)을 지불해야 함.
- **Production 변경량**: 작음 -- 두 Prototype 각각 143~170줄, 결합해도
  Prototype 코드 추가 수준. 다만 오케스트레이션 코드는 추가 필요.
- **Regression 위험**: 원칙적으로 안전(두 Prototype 모두 실측
  regression=0)하나, duplicateSuccessCount=11건에서는 두 Primitive를
  모두 실행하는 것이 이미 불필요한 computation(같은 결과 중복 계산)이라
  그 자체가 성능상의 위험 요소.

## STEP6. Blueprint Selection

`BlueprintSelection.ts` -- STEP1-5의 실측 결과를 결합해 Directive의
Decision A/B/C를 판정. 판정 기준은 raw count가 아니라
`expectedRescueOverBestSingle`(STEP4)과 `dualOnlyCount`/
`exclusiveCapabilityCount`(STEP1)이다.

- **decision = C_SINGLE_PRIMITIVE_INTEGRATION**
- 근거: `dualOnlyCount=0`, `expectedRescueOverBestSingle=0`(전체의
  0.0%) -- MULTI 단독이 이미 union upper bound(13건)를 전부 달성하므로
  Hybrid가 추가로 제공하는 Capability는 실측상 0. 반면
  `duplicateSuccessCount=11`건에서는 두 Primitive를 모두 실행하는 것이
  불필요한 computation이며, STEP5 Integration Risk 분석 결과 marginal
  rescue 대비 runtime 비용도 불균형하게 크다.
- 선정 기준: Capability(unionSuccessCount=13, bestSingle(MULTI)=13,
  expectedRescueOverBestSingle=0, jaccardIndex=0.846) / Runtime(STEP5
  runtimeImpact) / Risk(STEP5 regressionRisk) / 구현 복잡도(Hybrid
  오케스트레이션 불필요 -- 이미 검증된 단일 Primitive를 그대로
  Production Integration Planning으로 넘긴다).

## Level 1-3 판정

- **Level1 (Capability 중복 구조 규명)**: PASS -- STEP1 Overlap
  Analysis로 Dual이 Multi의 실증적 부분집합임을 확인.
- **Level2 (Hybrid Architecture 확정)**: N/A -- Decision C이므로 Hybrid
  Architecture를 확정하지 않는다(확정할 실익이 없다는 것 자체가 이번
  Sprint의 결론).
- **Level3 (Prototype 구현 대상 1개 선정)**: MULTI_SINGLE_PRIMITIVE_INTEGRATION
  -- Hybrid가 아니라 Multi-Component Merge 단일 Primitive를 다음 단계
  (Production Integration Planning)의 대상으로 선정.

## 결론 및 다음 단계

이 Sprint의 실측 데이터는 Hybrid 가설을 기각한다: 두 Primitive가
Baseline 대비로는 서로 다른 통계적 우위를 보이지 않았지만(Comparative
Sprint), 실제 case-level Overlap을 들여다보면 Dual Wing Bridge는
Multi-Component Merge가 커버하는 케이스의 부분집합만 성공시킨다
(`dualOnlyCount=0`). 따라서 두 Primitive를 결합해도 상호보완
(additivity)이 발생하지 않으며, Hybrid는 추가 Capability 없이 Runtime과
구현 복잡도만 늘린다.

**Decision C: 단일 Primitive Integration으로 회귀 -- Multi-Component
Merge를 다음 Sprint(Production Integration Planning Sprint)의 유일한
대상으로 진행한다.**
