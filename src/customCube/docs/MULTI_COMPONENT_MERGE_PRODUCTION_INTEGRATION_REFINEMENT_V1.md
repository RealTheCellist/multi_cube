# Multi-Component Merge Production Integration Refinement Sprint v1

## Section 0. 범위 및 방법론 disclosure

Production Integration Sprint v1이 발견한 Budget Starvation(gate-matched 9건
전원, 평균 실제 가용 예산 493.6ms/명목 2000ms)이 실제 Capability 부재의
직접 원인인지 반사실(counterfactual) 실험으로 검증했다. Primitive 알고리즘
(`tryMultiComponentMerge`, CCR 알고리즘 등)은 전혀 수정하지 않았다 -- 변경은
`fiveByFiveEdgeRecovery.ts`에 새 `multiComponentMergeOrder: "AFTER_CCR" |
"BEFORE_CCR"` 파라미터를 추가해 MCM을 CCR보다 먼저/나중에 실행하도록 재배치
하는 것뿐이다. 기본값(`"AFTER_CCR"`)은 이전 Sprint의 실제 production 순서와
완전히 동일하다. Planner/Executor/SolverEngine/BFS/Deferred Validator/
MultiCycle Analyzer/Primitive 알고리즘(MCM/CCR/REPAIR/PARITY_GATED_CYCLE
내부 구현)은 `git diff --stat` 결과 0건 변경 확인.

## STEP1. Budget Starvation 독립 재현

`BudgetAudit.ts` -- 실제 `generateRecoveryStrategies()`를 새 fresh replay로
재실행(이전 Sprint의 결과 JSON을 재사용하지 않음).

| 지표 | AFTER_CCR(기존) | BEFORE_CCR(재배치) |
|---|---|---|
| avgConsumedBudgetMs(MCM 차례가 오기까지 소비된 시간) | 564.9ms | 319.0ms |
| avgActualBudgetAvailableMs(MCM이 실제로 받은 예산) | 435.1ms | 681.0ms |
| starvedRate(< 명목 2000ms) | 100% | 100% |

**중요한 disclosure**: `starvedRate`는 명목 2000ms 대비 정의되어 있는데,
Outer Deadline 자체가 1000ms이므로 이 지표는 **어떤 스케줄링을 택하든
항상 100%가 나올 수밖에 없는 정의상 항상-참(tautological) 지표**다. 진짜
의미 있는 비교는 연속값인 `avgActualBudgetAvailableMs`다 -- BEFORE_CCR은
AFTER_CCR 대비 실제 가용 예산을 **약 56% 더 확보**했다(435.1ms → 681.0ms).
STEP1 자체는 이전 Sprint의 실측(493.6ms)과 이번 fresh AFTER_CCR 재현치
(435.1ms)가 근접함을 확인했다 -- 완전히 동일하지는 않은데, 이는 실제
wall-clock 기반 시스템의 run-to-run 변동(아래 STEP2/3에서도 재확인)이다.

## STEP2/3. Counterfactual Budget Replay + Scheduler Ordering Experiment

`CapabilityReplay.ts` -- 실제 `attemptRecovery()` 3-arm 실측(Baseline/MCM
없음, AFTER_CCR=Option A, BEFORE_CCR=Option B), 142-case 전체.

| Arm | improvedCount | newCapabilityCount | regressionCount | trueRegressionCount |
|---|---|---|---|---|
| Baseline(MCM 없음) | 15 | -- | -- | -- |
| **AFTER_CCR**(Option A, 기존) | 17 | 3 | 1 | 0 |
| **BEFORE_CCR**(Option B, 재배치) | 15 | 2 | 2 | 0 |

**Option C(조건부 스케줄러)**: `genMultiComponentMerge()`는 이미
componentCount>=3 Gate를 즉시 체크하고 아니면 no-op하므로, "무조건
재배치"(BEFORE_CCR)와 "Gate 통과 시에만 재배치"(Conditional)는 실제로
바이트 단위로 동일한 실행 결과를 낸다 -- 별도 재현 없이 BEFORE_CCR과
동일한 데이터로 취급함을 disclose한다.

**Arm C(Unlimited Budget)**: Comparative Prototype Sprint v1의 실측을
그대로 인용 -- componentCount>=3인 9개 케이스 중 **4/9(44.4%)**가 경쟁 없는
전체 2000ms 예산에서 성공했다. 이것이 이 Primitive/Gate 조합의 이론적
상한이다.

**핵심 발견**: BEFORE_CCR이 AFTER_CCR보다 예산은 더 받았지만(681ms vs
435ms), 실제 개선 케이스 수는 오히려 더 적었다(15 vs 17)고 Regression은
더 많았다(2 vs 1) -- 예산 증가가 Capability 증가로 이어지지 않았다.
또한 이번 fresh replay의 AFTER_CCR 결과(baseline 15, 개선 17, 신규
Capability 3)는 이전 Sprint의 동일 설정 실측(baseline 14, 개선 15, 신규
Capability raw 1/보정 0)과 다르다 -- 이는 이 시스템의 wall-clock 기반
Budget 경쟁이 두 개의 독립적인 실제 실행 사이에서도 유의미한 변동을 만든다는
것을 재확인한다(작은 절대 건수이므로 이 변동 자체가 Statistical Validation
에서 CI를 넓게 만드는 원인이기도 하다).

## STEP4. Primitive Interaction Audit

`PrimitiveInteractionAudit.ts`

| Order | overlapRate(CCR와 공존) | duplicateRescueCount | replacementCount | avgActualBudgetAvailableMs |
|---|---|---|---|---|
| AFTER_CCR | 11.1%(1/9) | 1 | 0 | 435.1ms |
| BEFORE_CCR | 0.0%(0/9) | 0 | 0 | 681.0ms |

BEFORE_CCR에서는 MCM이 먼저 실행되므로 CCR과의 겹침(overlap)이 0%로
사라진다 -- Budget 경쟁이 실제로 완화됨을 확인했지만, STEP2/3에서 보듯
그 완화가 Capability 향상으로 이어지지는 않았다.

## STEP5. Statistical Validation + Validation Framework

`StatisticalValidation.ts`(evaluatePairedDiff 재사용) +
`ValidationFramework.ts`(Category D "Architecture Change", Gate A/B/C/D/E,
`decideFromGates`).

| 비교 | improvedCountDiff mean | 95% CI | Cohen's dz |
|---|---|---|---|
| BEFORE_CCR vs AFTER_CCR | -0.0141 | [-0.0417, 0.0135] | -0.084(negligible) |
| BEFORE_CCR vs Baseline | 0.0000 | [-0.0277, 0.0277] | 0.000(negligible) |
| AFTER_CCR vs Baseline | 0.0141 | [-0.0135, 0.0417] | -- |

세 비교 모두 **95% CI가 0을 포함** -- 어느 쪽도 통계적으로 유의하지 않다.

| Gate | 결과 |
|---|---|
| A(Regression 증가 없음) | PASS |
| B(Runtime 허용 범위) | PASS |
| C(Capability 감소 없음, strict) | OPEN_QUESTION |
| D(Operating Contract 유지) | PASS |
| E(Primitive Interaction 이상 없음) | OPEN_QUESTION |

Pipeline Decision(Category D, production stage) = **B**(필수 Gate FAIL
없음이나 일부 OPEN_QUESTION -- 조건부 승인, 후속 확인 권장).

## STEP6. Operating Contract Selection

`OperatingContractSelection.ts` -- Directive의 4개 후보 중
MCM_THEN_CCR/Dedicated Budget/Conditional Scheduler는 이 코드베이스
구조상 동일한 실제 메커니즘(BEFORE_CCR)으로 수렴함을 disclose하고 하나로
평가했다.

| 후보 | 실제 메커니즘 | capabilityScore | avgActualBudgetAvailableMs | avgRuntimeMs | regressionCount | complexityScore |
|---|---|---|---|---|---|---|
| CURRENT(CCR→MCM) | AFTER_CCR | 2.00 | 435.1ms | 1016.3ms | 1 | 0 |
| MCM→CCR | BEFORE_CCR | 0.00 | 681.0ms | 996.7ms | 2 | 1 |
| Dedicated Budget | BEFORE_CCR | 0.00 | 681.0ms | 996.7ms | 2 | 1 |
| Conditional Scheduler | BEFORE_CCR | 0.00 | 681.0ms | 996.7ms | 2 | 1 |

BEFORE_CCR 계열(3개 후보, 실제로는 1개 메커니즘)이 CURRENT 대비 Pareto
우위를 보이지 않는다 -- 예산은 더 받지만 capabilityScore가 더 낮고
regressionCount가 더 높다.

## Level 1-3 판정

- **Level1 (Budget Starvation 원인 재현)**: PASS -- fresh replay로 독립
  재현(avgActualBudgetAvailableMs=435.1ms, 이전 Sprint의 493.6ms와 근접).
- **Level2 (Budget/Scheduler 수정으로 Capability 회복)**: **FAIL** -- 예산을
  56% 늘렸음에도(681ms) 개선 케이스 수는 오히려 감소(17→15), 모든 비교의
  95% CI가 0을 포함해 통계적으로 유의한 회복이 없다.
- **Level3 (최종 Operating Contract 확정)**: PARTIAL -- BEFORE_CCR 계열이
  CURRENT보다 우월하다는 증거가 없어 CURRENT(AFTER_CCR)를 잠정 유지하되,
  최종 확정을 위해서는 추가 검증이 필요하다.

## Decision

**Decision B: Refinement Sprint v2로 진행한다.**

Budget 재배치(BEFORE_CCR)는 실제로 MCM이 받는 예산을 유의미하게 늘렸지만
(avgConsumedBudgetMs 564.9ms→319.0ms, avgActualBudgetAvailableMs 435.1ms→
681.0ms), 이것이 통계적으로 유의한 Capability 회복으로 이어지지 않았다
(모든 비교 95% CI가 0 포함, Gate C OPEN_QUESTION). 그렇다고 해서 Decision C
(Primitive 자체 한계)로 단정하기에도 이르다 -- 이번에 테스트한 것은 여전히
Outer Deadline(1000ms)에 의해 상한이 걸린 "부분적으로 더 나은" 예산이지,
Comparative Prototype Sprint v1이 측정한 "완전히 경쟁 없는 2000ms"(Arm C,
4/9 성공)는 아니다. 실제 완전 예산 시나리오를 프로덕션에서 안전하게
재현할 방법(예: MCM 전용으로 Outer Deadline을 초과하는 예산을 허용하는
것은 이 코드베이스 전체가 지켜온 "Recovery 전체가 solver-wide 1000ms
cap을 넘지 않는다"는 불변식을 깨는 것이므로 이 Sprint의 scope 밖) 없이는
Decision C도 성급하다. 따라서 **Budget/Scheduler 미세조정을 계속 탐구하는
Refinement Sprint v2**로 진행하는 것이 타당하다.
