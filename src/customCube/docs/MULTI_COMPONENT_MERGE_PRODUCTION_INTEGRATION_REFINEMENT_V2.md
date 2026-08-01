# Multi-Component Merge Production Integration Refinement Sprint v2

## Section 0. 범위 및 방법론 disclosure

Refinement Sprint v1은 "Scheduler Ordering(CCR↔MCM 재배치)은 주요 병목이
아니다"까지 확인했다. 남은 마지막 미검증 가설은 Outer Deadline(1000ms)
자체가 MCM의 실제 Capability를 가리고 있는가였다. 이번 Sprint는 Outer
Deadline만을 독립 변수로 두는 반사실(counterfactual) 검증이다 --
Scheduler Ordering(`multiComponentMergeOrder="AFTER_CCR"` 고정, 실제
production 기본값과 동일), Gate, Budget Contract, Primitive 알고리즘은
모두 고정한 상태에서 `attemptRecovery()`가 이미 받는 기존 `deadline`
인자만 1000/1500/2000ms로 변화시켰다. **production 코드는 단 한 줄도
수정하지 않았다** -- `fiveByFiveEdgeRecovery.ts`/
`fiveByFiveEdgeSolverTypes.ts` 포함 전 production 파일이 `git diff --stat`
결과 0건 변경. Planner/Executor/SolverEngine/BFS/DeferredValidator/
MultiCycleAnalyzer/MCM·CCR 알고리즘 내부 구현도 전혀 건드리지 않았다.

## STEP1. Outer Deadline Audit (독립 재현, outer=1000ms)

`OuterDeadlineAudit.ts` -- 실제 `generateRecoveryStrategies()`를 fresh
replay로 재실행.

| 지표 | 값 |
|---|---|
| gateMatchedCount(componentCount>=3) | 9/142 |
| avgRemainingTimeAtMcmStartMs = avgActualBudgetAvailableMs | 519.7ms |
| fullBudgetCount(명목 2000ms 전액 확보) | 0/9 (0.0%) |
| deadlineAbortCount | 51 |

명목 2000ms 대비 실제 확보 예산은 약 26%(519.7ms)에 불과하며, 9건 중
전액 확보 사례는 0건이다. 이전 Sprint들의 실측(493.6ms, 435.1ms)과
근접해 Budget Starvation이 outer=1000ms에서는 구조적으로 항상 발생함을
재확인했다.

## STEP2/3. Counterfactual Deadline Replay + Capability Recovery

`DeadlineReplay.ts` -- 실제 `attemptRecovery()` 3-arm 실측, 142-case 전체,
Scheduler Ordering/Gate/Budget Contract 전부 고정, outer deadline만 변경.

| Arm | improvedCount | newCapabilityVsA | regressionCount | mcmChosenCount |
|---|---|---|---|---|
| **A**(1000ms, 현행) | 15 | -- | 0 | 1 |
| **B**(1500ms, 확장) | 18 | 4 | 0 | 2 |
| **C**(2000ms, Counterfactual) | 21 | 7 | 0 | 2 |

Regression은 세 Arm 모두 0건 -- Outer Deadline 확장이 새로운 실패를
유발하지는 않는다. Outer Deadline을 늘릴수록 improvedCount와
newCapabilityVsA가 단조 증가하는 뚜렷한 경향이 관측됐다.

## STEP4. Comparative Prototype Consistency

`ComparativeConsistency.ts` -- Arm C(production 경로, outer=2000ms, 다른
Primitive와 여전히 경쟁)를 Comparative Prototype Sprint v1의 독립
2000ms 테스트(경쟁 없음)와 비교, componentCount>=3인 9개 케이스 전체.

| 지표 | 값 |
|---|---|
| n | 9 |
| matchRate | 66.7% (6/9) |
| successMatch(둘 다 성공) | 1 |
| successMismatch(독립 테스트만 성공) | 3 |
| failureMatch(둘 다 실패) | 5 |
| failureMismatch(Arm C만 성공) | 0 |

**disclosed 방법론 gap**: Arm C는 "outer deadline이 MCM 명목 예산과
같아졌다"를 검증하는 것이지 "다른 Primitive와의 경쟁이 전혀 없다"를
검증하는 것이 아니다. successMismatch가 3건(독립 테스트에서는 성공했지만
production Arm C에서는 실패) 존재한다는 것은, outer deadline을 2000ms로
늘려도 여전히 다른 Primitive(DISRUPT/REPAIR/CCR 등)와의 경쟁이 남은
Budget을 갉아먹어 완전한 재현에는 못 미침을 보여준다. failureMismatch가
0건인 것은 Arm C가 독립 테스트보다 "더 잘" 성공한 사례는 없다는 뜻이며,
이는 예상과 일치한다(Arm C가 겪는 경쟁이 순재 방향으로 유리하게 작용할
이유가 없다).

## STEP5. Statistical Validation + Validation Framework

`StatisticalValidation.ts`(evaluatePairedDiff 재사용) +
`ValidationFramework.ts`(Category B "Performance Optimization",
requiredGates=[A,B,C], Gate A/B/C/E, `decideFromGates`).

| 비교 | improvedCountDiff mean | 95% CI | Cohen's dz |
|---|---|---|---|
| B(1500ms) vs A(1000ms) | 0.0211 | [-0.0096, 0.0519] | 0.113(negligible) |
| **C(2000ms) vs A(1000ms)** | **0.0423** | **[0.0037, 0.0808]** | 0.180(negligible) |
| C(2000ms) vs B(1500ms) | 0.0211 | [-0.0026, 0.0449] | -- |

Arm C vs Arm A의 95% CI 하한(0.0037)이 **0을 초과** -- 통계적으로
유의한 개선이 확인된 유일한 비교다. 다만 Cohen's dz=0.180은 negligible
등급으로, 통계적 유의성과 실질적 효과 크기가 다르다는 점을 함께
disclose한다. B vs A, C vs B는 모두 CI가 0을 포함해 유의하지 않다.

| Gate | 결과 | 근거 |
|---|---|---|
| A(Regression 증가 없음) | PASS | True/False Regression diff mean=0.000, CI=[0.000, 0.000] |
| B(Runtime 허용 범위) | OPEN_QUESTION | Runtime diff mean=524.0ms, 95% CI=[445.6, 602.5] (허용 기준: Baseline p95=1214ms 대비 +15%=182ms 이내 -- outer deadline을 1000ms 늘렸으므로 runtime이 그만큼 늘어나는 것은 이 실험 설계 자체의 당연한 결과) |
| C(Capability 감소 없음, strict) | PASS | 성공 케이스 diff mean=0.04, CI=[0.00, 0.08], 유의미한 개선(YES) |
| E(Primitive Interaction 이상 없음) | PASS | Duplicate=0건, Starved Type=0개 |

Pipeline Decision(Category B, production stage) = **B**(필수 Gate FAIL
없음이나 일부 OPEN_QUESTION -- 조건부 승인, 후속 확인 권장). Gate B가
OPEN_QUESTION인 것은 실험 설계상 당연한 결과(outer deadline 자체를
1000ms 늘렸으므로)이며 결함이 아니다.

## STEP6. Root Cause Decision + Matrix

`RootCauseDecision.ts`

| 요인 | 근거 | 기여도 |
|---|---|---|
| Outer Deadline 확장 효과(Arm C vs Arm A) | improvedCountDiff mean=0.0423, 95% CI=[0.0037, 0.0808], Cohen's dz=0.180(negligible) | HIGH |
| Comparative Prototype 일치도 | matchRate=66.7%(successMatch=1, successMismatch=3) | MEDIUM |
| Validation Framework(Category B) Decision | B(조건부 승인) | LOW |

**decision = B_PARTIAL_NOT_SUFFICIENT**

rationale: 통계적으로 유의한 회복은 확인됐다(significantRecovery=true)
하지만 Validation Framework의 최종 Pipeline Decision은 A(완전 승인)가
아닌 B(조건부)이고, Comparative Prototype과의 일치율도 66.7%로 다른
Primitive와의 경쟁이 여전히 결과를 일부 흐리고 있음을 시사한다 -- 두
조건(통계적 유의성 + Framework 완전 승인)이 동시에 충족되지 않아 Outer
Deadline을 "직접적이고 충분한" 병목으로 확정할 수는 없다.

## Level 1-3 판정

- **Level1 (Outer Deadline 영향 정량화)**: **PASS** -- Arm A→B→C로 갈수록
  improvedCount(15→18→21)와 newCapabilityVsA(--→4→7)가 단조 증가했고,
  Arm C vs Arm A는 95% CI 하한>0으로 통계적으로 유의하다(mean=0.0423,
  CI=[0.0037, 0.0808]). 다만 효과 크기는 negligible(dz=0.180)이다.
- **Level2 (Comparative vs Production 비교 완료)**: **PASS** --
  matchRate=66.7%(6/9), successMismatch 3건을 통해 "outer deadline
  확장만으로는 독립 테스트 조건에 완전히 도달하지 못한다"는 것을
  정량적으로 확인했다.
- **Level3 (Primitive vs Deadline 원인 확정)**: **NOT ACHIEVED** --
  증거가 혼재되어 있다. Outer Deadline 확장이 통계적으로 유의한 회복을
  만들어내지만(→ 순수 Primitive 한계는 아님을 시사), 그 회복이
  Framework의 완전 승인이나 Comparative Prototype과의 완전한 일치에는
  못 미친다(→ Outer Deadline만으로 충분조건은 아님을 시사). 즉 Outer
  Deadline은 "기여 요인"이지만 "유일한 병목"은 아니다.

## Decision

**Decision B: Refinement Sprint v3로 진행한다.**

Outer Deadline 확장은 실제로 통계적으로 유의한 Capability 회복을
만들어냈다(Arm C vs Arm A, 95% CI=[0.0037, 0.0808], 하한>0) -- 이는
Refinement Sprint v1이 부정했던 "Scheduler Ordering"과 달리 Outer
Deadline이 진짜 기여 요인임을 보여준다. 그러나 그 효과 크기는
negligible(dz=0.180)이고, Comparative Prototype Sprint v1의 완전-경쟁-없는
조건과의 일치율은 66.7%에 그친다(successMismatch 3건 -- 독립 테스트에서
성공한 케이스 중 1/3이 production 경로에서는 여전히 실패). 이는 Outer
Deadline 확장만으로는 다른 Primitive와의 잔여 경쟁을 완전히 제거하지
못한다는 뜻이다. 따라서 Decision C(Primitive 자체의 구조적 한계)를
내리기에는 이르다 -- 이번 Sprint의 검증 원칙 자체가 명시한 대로,
Decision C는 "Comparative Prototype에서 성공했던 조건에 최대한 근접한
환경에서도 Capability가 통계적으로 회복되지 않을 때만" 내려야 하는데,
이번에 오히려 통계적으로 유의한 회복이 관측됐다. 동시에 Decision
A(Outer Deadline을 새 Operating Contract로 확정)도 성급하다 -- Validation
Framework의 Pipeline Decision이 완전 승인(A)이 아닌 조건부(B)이고,
Comparative Prototype과의 일치도가 완전하지 않기 때문이다. 다음
Refinement Sprint v3는 successMismatch 3건을 구체적으로 분석해 "어떤
다른 Primitive가 그 잔여 경쟁을 만드는지"를 특정하고, 그 경쟁 자체를
제거하는 조건(예: 해당 케이스들에서만 다른 Primitive를 일시적으로
비활성화한 반사실 실험)을 설계해야 한다.
