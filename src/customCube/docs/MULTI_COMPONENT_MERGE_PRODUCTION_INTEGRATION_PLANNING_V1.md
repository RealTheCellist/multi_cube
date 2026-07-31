# Multi-Component Merge Production Integration Planning Sprint v1

## Section 0. 범위 및 방법론 disclosure

Hybrid Primitive Blueprint Sprint v1의 Decision C(Hybrid 이득 없음, 단일
Primitive Integration으로 회귀)에 따라, 이번 Sprint는 Multi-Component
Merge를 Production Recovery Pipeline에 통합하기 위한 Integration
Contract를 설계했다. **이번 Sprint는 설계(Planning)만 수행하며,
Production Solver는 수정하지 않았다** -- 보호 파일(`fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdges.ts`,
`solverV2Prototype/DeferredValidator.ts`,
`solverV2Prototype/MultiCycleAnalyzer.ts`) `git diff --stat` 결과 0건
변경 확인.

STEP1/STEP2/STEP4는 실제 Production 함수(`generateRecoveryStrategies`,
`chooseBestRecovery`, `detectComponents`, `generateBridgeCandidates`,
`computeStructuralFeatures`, `analyzeCcrGate`)를 **읽기 전용**으로
호출해 전체 142-case Hole Dataset에서 실측했다. STEP2/STEP4의 Capability
숫자(rescue/duplicate)는 Comparative Prototype Sprint v1의 실제 142-case
Replay 결과(JSON)를 그대로 재사용했다 -- 새 Replay 없음.

## 핵심 발견: PARITY_GATED_CYCLE과의 구조적 관계

**MCM의 componentCount==2 fallback은 실제 프로덕션 `genParityGatedCycle()`과
코드 수준에서 동일하다** (`fiveByFiveEdgeRecovery.ts`의
`genParityGatedCycle()`과 `MultiComponentMergePrototype.ts`의
componentCount==2 fallback 모두 `detectComponents` -> 단일
`generateBridgeCandidates(..., "largestTwo")` -> `traverseAllCycles` ->
`bestEffortCleanup` -> `validateDeferred`의 동일한 파이프라인). 이는 MCM의
실질적 신규 가치가 **componentCount>=3에만 존재**함을 의미한다.

## STEP1. Integration Position Analysis

`IntegrationPositionAnalysis.ts` -- 실제 production
`generateRecoveryStrategies()`를 읽기 전용으로 전체 142-case에 호출.

| 지표 | 실측값 |
|---|---|
| parityGatedCycleGeneratedRate (실제 파이프라인에서 accepted 후보 생성률) | 1.4% (2/142) |
| finalCandidatesEmptyRate (pipeline_last 도달 가능성) | 83.8% (119/142) |

**중요 disclosure**: 오늘 실제 프로덕션 순서(DISRUPT x2, REPAIR, CCR,
PARITY_GATED_CYCLE, MIXED_COMMUTATOR, SETUP)에서 CCR과
PARITY_GATED_CYCLE 사이에는 아무 것도 없다 -- Directive의 `after_CCR`과
`before_PARITY`는 물리적으로 동일한 슬롯이다(숨기지 않고 그대로 보고).

4개 후보 위치 비교 결과, **BEFORE_PARITY**를 권장한다: MCM의
componentCount>=3 Gate가 PARITY_GATED_CYCLE의 Gate(componentCount>1)의
부분집합이므로, MCM이 먼저 실행되면 두 Primitive의 Gate가 상호 배타적으로
분리된다(PARITY_GATED_CYCLE은 사실상 componentCount==2만 처리). AFTER_REPAIR는
불필요하게 CCR의 실측 22.2% overlap 케이스를 먼저 가로채고, PIPELINE_LAST는
PARITY_GATED_CYCLE이 먼저 상태를 변형시켜 MCM 자신의 Gate가 무효화될
위험이 있다.

## STEP2. Gate Design

`GateDesign.ts` -- 4개 Gate 후보를 실제 `detectComponents`/
`generateBridgeCandidates` 계산 + Comparative Sprint의 실제
componentCountBefore/multiImproved ground truth와 결합해 평가.

| Gate | Coverage | newCapabilityCount | duplicateOfProduction | Precision |
|---|---|---|---|---|
| **componentCount>=3** | 6.3%(9/142) | **4** | 0 | **44.4%** |
| paritySatisfied(짝수) | 52.8%(75/142) | 3 | 4 | 4.0% |
| bridgeCandidateExists | 8.5%(12/142) | 0 | 2 | 0.0% |
| cycleCount>=2 | 45.8%(65/142) | 4 | 8 | 6.2% |

`componentCount>=3`가 압도적으로 최선이다 -- 가장 좁은 Coverage로 가장
높은 Precision(44.4%)을 달성하고, `duplicateOfProduction=0`(이미 존재하는
componentCount==2 케이스와 절대 겹치지 않음, Gate 정의상 tautological하게
보장됨). 이 Gate를 채택한다.

## STEP3. Budget Contract

`BudgetContract.ts` -- 4개 정책 비교.

- **Remaining Time**: Integration Architecture Analysis Sprint v1의
  Budget Starvation 실측 전례가 그대로 재현될 위험.
- **Fixed Budget(600ms)**: MAX_SEQUENTIAL_MERGES=4회 병합 시 이론상 최대
  1200ms로 부족할 수 있음.
- **Dedicated Slice(PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms 재사용)**:
  `MultiComponentMergePrototype.ts`가 이미 이 값을 실측 사용 중(2000ms의
  26.4%만 사용) -- 구현 복잡도 최저. **채택.**
- **Shared Slice**: Hybrid Blueprint Sprint의 Shared Budget 옵션과 동일한
  Budget Starvation 위험.

## STEP4. Counterfactual Integration Simulation

`CounterfactualIntegrationSimulation.ts` -- Comparative Sprint의 실제
Replay 결과 재사용, 새 Replay 없음.

| 지표 | 값 |
|---|---|
| expectedInvocationCount | 9/142 (6.3%) |
| **expectedRescueCount** | **4/142 (2.8%)** |
| duplicateSuccessCount | 0 |
| runtimeCostTotalMs | 4756.2ms |
| runtimeCostPerRescueMs | 1189.0ms |
| ccrOverlap (실측, 실제 analyzeCcrGate 호출) | 2/9 (22.2%) |
| repairOverlap (실측) | 0/9 (0.0%) |

## STEP5. Risk Assessment

`RiskAssessment.ts` -- 실측 데이터 기반 임계값 판정.

| 항목 | 등급 | 근거 |
|---|---|---|
| Regression Risk | **LOW** | Comparative Sprint 실측 Regression=0건 |
| Runtime Risk | **MEDIUM** | runtimeCostPerRescueMs=1189ms -- Dedicated Slice(2000ms) 안에는 들어오지만 rescue 대비 비용 효율 낮음 |
| Scheduler Risk | **LOW** | 새 Scheduler 불필요, 기존 호출 목록에 한 단계만 추가 |
| Budget Risk | **LOW** | Gate 배타성으로 PARITY_GATED_CYCLE과 동시 슬롯 소진 없음 |
| Primitive Interaction Risk | **MEDIUM** | CCR overlap 22.2% -- 경쟁은 있으나 실측 Regression 유발 사례 없음 |

High 위험 0건.

## STEP6. Production Integration Contract

`ProductionIntegrationContract.ts` -- STEP1-5를 결합한 확정 Contract:

- **Position**: BEFORE_PARITY (genCCR() 다음, genParityGatedCycle() 이전)
- **Gate**: componentCount>=3
- **Budget**: Dedicated Slice (PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms 재사용)
- **Scheduling Rule**: schedulingStrategy(A/B) 옵션과 무관하게 항상 이
  위치에 고정 삽입 (CCR/MIXED_COMMUTATOR Integration Point와 동일한 원칙)

**Decision: A_PRODUCTION_INTEGRATION_SPRINT**

Position/Gate/Budget 모두 실측 데이터로 확정되었고 High 위험 0건이므로
Production Integration Sprint로 진행한다. 다만 expectedRescueCount=4건
(2.8%)로 신규 Capability 규모가 작으므로, 다음 Sprint의 성공 기준은 이
규모에 맞게 보정되어야 한다.

## Level 1-3 판정

- **Level1 (Integration Position 확정)**: PASS -- BEFORE_PARITY
- **Level2 (Gate·Budget Contract 확정)**: PASS -- componentCount>=3 /
  Dedicated Slice
- **Level3 (Production Integration 명세 완료)**: PASS -- STEP6
  `CONFIRMED_CONTRACT` + schedulingRule 명세 완료, 다음 Sprint에서 그대로
  구현 가능한 수준

## 결론 및 다음 단계

Multi-Component Merge의 Production Integration Contract가 실측 데이터로
명확히 확정되었다: `genCCR()` 다음, `genParityGatedCycle()` 이전에
componentCount>=3 Gate로 삽입하고, PARITY_GATED_CYCLE_RESERVED_SLICE_MS
(2000ms)를 Dedicated Slice로 재사용한다. 이 설계는 PARITY_GATED_CYCLE과
Gate가 상호 배타적으로 분리되어 Budget/Regression 위험이 낮다.

**Decision A: Multi-Component Merge Production Integration Sprint v1로
진행한다.**
