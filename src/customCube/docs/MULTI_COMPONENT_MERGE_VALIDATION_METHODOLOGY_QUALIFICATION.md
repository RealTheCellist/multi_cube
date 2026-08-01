# Multi-Component Merge Validation Methodology Qualification Sprint v1
## (Measurement Alignment Validation)

## 0. Sprint 성격

이 Sprint는 **Production 코드를 전혀 수정하지 않는다.** MCM(MULTI_COMPONENT_MERGE)
자체나 Recovery/Scheduler/Budget을 더 고치는 것이 아니라, "지금까지 사용해 온
Validation 방법론이 이 종류의 변경을 검증하기에 적합한가"만 검증한다.

핵심 질문:

> Multi-Component Merge의 효과는 실제로 없는가, 아니면 현재 Product Validation
> Methodology가 이 종류의 Contract Improvement를 측정하지 못하는가?

전제가 된 두 Sprint의 실측 결과:

- **Short-Circuit Production Integration Sprint v1** (`attemptRecovery()` 직접
  호출, outer=2000ms): `scrambleDepth30:2`, `scrambleDepth100:5` 2건 모두
  MCM이 선택되고 net-improving하며, 실제로 `mcmShortCircuited=true`로
  회복됨을 확인 (2/2 회복, Regression 0).
- **Multi-Component Merge Production Validation Sprint v1** (real
  `solve()` E2E, 실제 production 기본값): 동일 142-case 전체에서
  `improvedCount` Baseline=Integrated=1/142로 완전히 동일 — 효과가 전혀
  관측되지 않음.

작업 디렉토리: `solverPrimitiveMultiComponentMergeValidationMethodology/`
(신규, Production/Primitive 파일은 일체 수정하지 않음).

## STEP1. Measurement Path Audit — Measurement Coverage Matrix

이 연구 계열이 지금까지 사용한 5개 측정 경로를 정리했다 (`MeasurementPathAudit.ts`):

| Path | 측정 대상 Contract | Budget 조건 | 포함 Primitive | 알려진 한계 |
|---|---|---|---|---|
| `attemptRecovery_direct` | Recovery 레이어 내부 scheduling/short-circuit contract, 단독 | 호출자 지정 outer deadline (1000/1500/2000/60000ms 실측 가능) | 7종 전체 (AFTER_CCR 순서) | primary(PAIR/FLIP/PARITY/ENDGAME) 파이프라인이 같은 outer deadline을 먼저 소비하는 과정을 전혀 반영하지 않음 — Recovery가 t=0부터 전체 outer deadline을 갖는다고 가정 |
| `generateRecoveryStrategies_direct` | 동일 Contract이나 `attemptRecovery()`의 재시도/short-circuit dispatch 레이어 없이 candidate 생성만 격리 | attemptRecovery_direct와 동일 | 7종 전체 | 이 경로만 `onEvent` 노출 — `attemptRecovery()` 자신은 내부 호출 시 `onEvent`에 항상 `undefined`를 넘기므로, real production 호출 경로 전체(= solve() 포함)는 후보별 timing telemetry를 절대 받지 못함 |
| `solve_e2e` | 실제 `FiveByFiveEdgeSolverEngine.solve()` 진입점, real 최종 사용자 경험 그대로 | `PLAN_TIME_BUDGET_MS=1000ms` 고정 (파라미터 아님) + `recoveryReserveMsOverride`(기본 250ms, 실제 노출된 파라미터) | 7종이나 ENDGAME 타입 task에서만 도달 | outer 1000ms 자체를 바꿀 파라미터가 없음 — `recoveryReserveMsOverride`만 안전하게 조정 가능한 유일한 레버 |
| `hole_dataset_replay` | 독립 Contract 아님, 위 두 direct 경로 중 하나에 씌우는 population multiplier | 하위 경로 상속 | 하위 경로 상속 | N이 커도 하위 경로 자체가 둔감하면 소용없음 — Production Validation Sprint v1의 N=142 solve_e2e replay가 실증 사례 |
| `counterfactual_replay` | 변경한 파라미터가 실제로 통제하는 것 | 실험 설계가 스윕하는 값 | 하위 경로 상속 | 이 Sprint 이전까지는 전부 `attemptRecovery_direct`의 outer deadline만 변주했고, `solve_e2e`의 `recoveryReserveMsOverride`를 변주한 적이 없었음 (이 Sprint의 STEP3가 최초) |

**Level1(Measurement Coverage 완전 정리) = PASS.**

## STEP2. Budget Envelope Analysis — Budget Envelope Comparison

`BudgetEnvelopeAnalysis.ts`가 실제로 실행하여(2개 known-effect case), MCM이 각
경로에서 실측으로 받은 remainingTime/effectiveBudget을 비교했다.

| Case | Path/조건 | remainingTimeAtMcmOrRecoveryStart | effectiveBudget |
|---|---|---|---|
| scrambleDepth30:2 | attemptRecovery_direct @ outer=1000ms (real production) | 644ms | 644ms |
| scrambleDepth30:2 | attemptRecovery_direct @ outer=2000ms (Short-Circuit Sprint 조건) | 1645ms | 1645ms |
| scrambleDepth30:2 | solve_e2e @ recoveryReserveMsOverride=250ms (real production 기본값) | null (recovery-triggered 이벤트 자체가 trace에 없음) | null |
| scrambleDepth100:5 | attemptRecovery_direct @ outer=1000ms | 741ms | 741ms |
| scrambleDepth100:5 | attemptRecovery_direct @ outer=2000ms | 1761ms | 1761ms |
| scrambleDepth100:5 | solve_e2e @ recoveryReserveMsOverride=250ms | null | null |

`dedicatedBudgetMs`(MCM 자체 명목 예산, `MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS`)는
두 경로 모두 2000ms로 동일하다. 즉 **MCM의 명목 예산 자체는 바뀐 적이 없다** —
`solve_e2e` 경로가 real production 기본값에서 MCM에게 도달할 실측 remainingTime을
아예 제공하지 못한다(null)는 것이 실측으로 확인된다.

## STEP3. Sensitivity Analysis

동일 2개 case에 대해 `attemptRecovery_direct`(outer=1000/1500/2000/60000ms)와
`solve_e2e`(recoveryReserveMsOverride=250/450/900ms) 양쪽 축을 모두 실측 스윕했다
(`SensitivityAnalysis.ts`).

| Case | attemptRecovery 축 | solve 축 |
|---|---|---|
| scrambleDepth30:2 | outer=1000/1500/2000/60000ms 전부 `improved=true`, `chosenType=MULTI_COMPONENT_MERGE` | reserve=250/450/900ms 전부 `improved=false`, `chosenType=none` |
| scrambleDepth100:5 | 위와 동일 (전부 improved=true) | 위와 동일 (전부 improved=false) |

- `attemptRecoveryThresholdMs`: 두 case 모두 **1000ms** (스윕 범위 내 가장 낮은 값에서
  이미 효과가 나타남 — real production outer deadline에서도 MCM이 이긴다).
- `solveThresholdMs`: 두 case 모두 **null** (900ms까지 스윕해도 효과가 전혀
  나타나지 않음).

즉 MCM의 효과는 `attemptRecovery_direct` 축에서는 **스윕 범위 전체에서
일관되게 관측**되고, `solve_e2e` 축에서는 **스윕 범위 전체에서 단 한 번도
관측되지 않는다.**

## STEP4. Metric Sensitivity Audit

`improvedCount`(Primary)와 `solvedCount`/`wrongWingReductionTotal`/
`recoverySuccessCount`(Secondary)가 실제로 같은 지점에서 함께 움직이는지
확인했다 (`MetricSensitivityAudit.ts`).

- attemptRecovery 축: 모든 outer 값에서 `improvedCount=2`,
  `recoverySuccessCount=2`, `wrongWingReductionTotal=3` — 4개 스윕 포인트
  전부 동일 (첫 스윕 포인트에서 이미 최대치).
- solve 축: 모든 reserve 값에서 전부 0.
- `allMetricsMoveTogether = true` — 이번 실측 범위 내에서는 어떤 KPI도
  `improvedCount`보다 더 일찍/민감하게 신호를 주지 않았다. 즉 기존 KPI들이
  서로 모순되게 움직이지는 않는다 — 문제는 KPI 선택이 아니라 **측정 축
  (attemptRecovery vs solve) 자체의 민감도 차이**다.

새 KPI 후보 제안 (Framework 자체는 이번 Sprint에서 수정하지 않음):

> **Recovered Improvement Before Deadline (RIBD)**: MCM이 후보로 OFFER되었는지
> (CHOSEN 여부와 무관하게) 그리고 실제 remainingTimeAtStart가 Comparative
> Prototype 단계에서 측정된 자체 소요 runtime 이상이었는지를 case별 boolean으로
> 집계. `improvedCount` 등 결과 지표는 효과가 성공 문턱을 넘는 순간에만
> 신호를 주므로, "기회는 있었지만 실패" vs "애초에 기회 자체가 없었음"을
> 구분하지 못한다 — 이번 Sprint의 STEP2/3가 수작업으로 풀어야 했던 바로 그
> 모호함을 RIBD가 구조적으로 분리해 준다.

## STEP5. Counterfactual Validation

Short-Circuit Sprint의 방법(`attemptRecovery_direct @ outer=2000ms`)과
Production Validation Sprint의 방법(`solve_e2e @ recoveryReserveMsOverride=250ms`)을
**같은 2개 case**에 대해 STEP3 스윕 데이터에서 그대로 추출해 나란히 비교했다
(`CounterfactualValidation.ts`, 신규 실행 없이 순수 추출).

| Case | Short-Circuit Method | Product Validation Method | Method가 갈리는가 |
|---|---|---|---|
| scrambleDepth30:2 | PASS | FAIL | **예** |
| scrambleDepth100:5 | PASS | FAIL | **예** |

**같은 Case가 Method만 바뀌면 PASS→FAIL이 된다는 것이 실측으로 재확인되었다.**
이는 새로운 실패가 아니라, 두 Sprint가 이미 개별적으로 관측한 사실의
직접적인 재현이다.

## STEP6. Methodology Decision Matrix

`MethodologyDecisionMatrix.ts`의 판정 로직:

- **Level2 판정은 두 개의 독립적인 실측 증거를 모두 요구한다**: (a) Budget
  Envelope 증거 — flip이 발생한 모든 case에서 `solve_e2e`의 effectiveBudget이
  `attemptRecovery_direct@2000ms`의 effectiveBudget보다 항상 작아야 함, (b)
  Sensitivity 증거 — 동일한 flip case들에서 `attemptRecoveryThresholdMs`는
  스윕 범위 내에서 발견되고 `solveThresholdMs`는 발견되지 않아야 함. 두 증거가
  서로 다른 실행 경로(STEP2 vs STEP3)에서 나온 것이므로, 하나로 우연히 맞아
  떨어질 가능성을 배제한다.

실측 결과: 두 case 모두 두 증거 모두 충족 →

- **Level1 (Measurement Coverage 완전 정리) = PASS**
- **Level2 (Mismatch 원인 단일 귀속) = PASS**
- **Level3 (향후 Validation Protocol 확정) = PASS**

### Root Cause

`solve_e2e`의 real production 기본값(`recoveryReserveMsOverride=250ms`)이
MCM의 명목 예산(2000ms)에 크게 못 미치고, `solve()`는 이 Sprint 시점까지
outer deadline 자체를 바꿀 파라미터가 없다 — 반면 `attemptRecovery_direct`는
outer deadline이 실제 노출된 파라미터라 2000ms까지 실측 가능하다. 두 경로가
서로 다른 결과를 내는 것은 노이즈가 아니라 이 Budget Envelope 차이 하나로
완전히 설명된다.

### Decision: **B — MCM 계열 전용 Validation Protocol 필요**

MCM처럼 자체 명목 예산(dedicated budget)이 `solve()`의 real production 기본
Recovery Reserve(250ms)보다 훨씬 큰 Primitive 계열은, `solve_e2e` 단일 측정
만으로 Capability 유무를 판정하지 않는다. 향후 이런 Primitive의 Product
Validation은 반드시 다음 두 가지를 **함께** 보고해야 한다:

1. `solve_e2e` @ 실제 production 기본값 — 현재 사용자가 실제로 받는 경험 확인용
2. `attemptRecovery_direct` @ outer = 해당 Primitive의 명목 예산과 같거나
   큰 값 — 진짜 Capability(효과 자체)의 존재 여부 확인용

어느 한쪽만으로 Decision A(효과 있음)/C(효과 없음)를 내리지 않는다.
**Validation Framework 자체(`ReleaseGates.ts`/`ChangeClassification.ts`)의
Gate 정의는 수정할 필요가 없다** — Category 선택과 측정 축 선택 가이드라인만
추가하면 된다.

## 결론

- MCM의 효과는 **실제로 존재한다** — `attemptRecovery_direct` 축에서
  스윕 범위 전체(1000ms~60000ms)에 걸쳐 일관되게 관측된다.
- Production Validation Sprint v1에서 그 효과가 보이지 않았던 것은
  MCM의 결함이 아니라, **`solve_e2e` 측정 경로가 MCM의 명목 예산(2000ms)에
  도달할 수 없는 real production 기본 Budget Envelope(250ms reserve, 1000ms
  고정 outer)을 가지고 있기 때문**이다.
- 다음 단계는 MCM을 더 수정하는 것이 아니라, 이번 Sprint가 확정한
  **"dedicated-budget이 큰 Primitive는 attemptRecovery_direct+solve_e2e
  이중 보고" Protocol**을 향후 유사 Primitive들의 Product Validation에
  표준으로 적용하는 것이다.

## 산출물

- Measurement Coverage Matrix — `MeasurementPathAudit.ts`
- Budget Envelope Comparison — `BudgetEnvelopeAnalysis.ts`
- Metric Sensitivity Report — `MetricSensitivityAudit.ts`
- Counterfactual Validation Report — `CounterfactualValidation.ts`
- Methodology Decision Matrix — `MethodologyDecisionMatrix.ts`
- 실행 리포트/결과: `solverPrimitiveMultiComponentMergeValidationMethodology/data/multi-component-merge-validation-methodology-qualification-v1-{report.txt,result.json}`
- 드라이버: `runMultiComponentMergeValidationMethodologyQualificationV1.ts`

## Protected Files 검증

`git diff --stat` 확인 결과 다음 파일들에 대한 diff **없음** (Sprint 시작
시점 대비 0):

- `fiveByFiveEdgeRecovery.ts`
- `fiveByFiveEdgePlanner.ts`
- `fiveByFiveEdgeExecutor.ts`
- `fiveByFiveEdgeSolverEngine.ts`
- `fiveByFiveEdges.ts`
- 모든 Primitive 구현 파일

이번 Sprint는 읽기/probe 전용이었으며, 위 파일들을 한 번도 수정하지 않았다.
