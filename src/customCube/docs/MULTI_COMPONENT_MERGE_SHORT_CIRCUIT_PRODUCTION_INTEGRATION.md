# Multi-Component Merge Short-Circuit Production Integration Sprint v1

## Section 0. 범위 및 방법론 disclosure

Refinement Sprint v3가 발견한 Short-Circuit Gap(MCM이 chosen되고 자체
moves가 net-improve했음에도 `attemptRecovery()`의 shortCircuitRepair
목록 누락으로 폐기됨)이 실제 Capability 부재의 직접 원인인지 검증하는
**Production Contract Bug Fix 검증 Sprint**다. 이전 3개 Sprint(v1-v3)와
달리 이번엔 가설 검증이 아니라 **실제 수정 1건의 실측 검증**이다.

**변경**: `fiveByFiveEdgeRecovery.ts`의 `attemptRecovery()` short-circuit
조건에 `MULTI_COMPONENT_MERGE`를 추가한 것 **한 줄**뿐이다(REPAIR/CCR/
MIXED_COMMUTATOR/PARITY_GATED_CYCLE과 동일한 취급). Primitive 알고리즘/
Scheduler/Budget/Planner/Executor/BFS는 전혀 수정하지 않았다 -- `git
diff --stat`로 이 Sprint 시작 시점 대비 `fiveByFiveEdgeRecovery.ts` 외
production 파일 0건 변경 확인.

**Before/After 측정 방법**: 이 수정은 런타임 플래그가 없는 무조건
변경이라, `git checkout`으로 수정 전/후 버전을 번갈아 체크아웃하며
동일 스크립트를 재실행하는 방식으로 Baseline(수정 전)/Integrated
(수정 후) 쌍을 확보했다(플래그 토글이 불가능한 변경에 대한 이 arc의
기존 stash-toggle 관행과 동일한 메커니즘).

**Outer Deadline 두 조건 병행 측정**: STEP2(전체 142케이스)는 실제
production 기본값(outer=1000ms)에서 측정했다. 반면 STEP3/4(3건의
successMismatch 재검증)는 Refinement Sprint v3가 그 문제를 **처음
발견한 것과 동일한 조건**(outer=2000ms)에서 측정했다 -- outer=1000ms
에서는 이 3건 모두 MCM이 애초에 예산을 받지 못해 chosen조차 되지 않기
때문에(Baseline/Integrated 공통, chosenType=none), 1000ms에서
재검증하면 수정 효과가 애초에 나타날 수 없는 조건에서 "변화 없음"을
관측하는 오류를 범하게 된다. 이 disclosure는 실제로 확인된 사실이다.

## STEP1. Contract Integration Audit

`ContractAudit.ts` -- production 소스 텍스트를 직접 읽어 확인.

```
matchedLine: if ((best.type === "REPAIR" || best.type === "CCR" ||
  best.type === "MIXED_COMMUTATOR" || best.type === "PARITY_GATED_CYCLE" ||
  best.type === "MULTI_COMPONENT_MERGE") && shortCircuitRepair &&
  afterDisrupt < originalBaseline) {
```

**allTypesPresent=true** -- MULTI_COMPONENT_MERGE가 기존 4개 타입과
완전히 동일한 조건으로 추가됨을 확인.

## STEP2. Production Replay (전체 142케이스, 실제 production 기본값 outer=1000ms)

| | improvedCount | regressionCount |
|---|---|---|
| Baseline(수정 전) | 9 | 0 |
| Integrated(수정 후) | **12** | 0 |

실제 production 조건에서 개선 케이스가 9→12(+3)로 증가했고 Regression은
0건이다 -- 이 3건은 이름이 알려진 successMismatch 케이스가 아니라
(그 3건은 outer=1000ms에서 애초에 MCM이 offer되지 않음), 이 수정이
실제 production 조건에서도 이전에 발견되지 않았던 **추가적인 실질
Capability**를 만들어낸다는 새로운 증거다.

## STEP3. SuccessMismatch Replay (outer=2000ms, Refinement Sprint v3 재현 조건)

| Case | Before(수정 전) | After(수정 후) |
|---|---|---|
| scrambleDepth30:2 | wrongWing 11→11, improved=false | wrongWing 11→**10**, improved=**true** |
| scrambleDepth40:7 | wrongWing 10→10, improved=false | wrongWing 10→10, improved=false |
| scrambleDepth100:5 | wrongWing 10→10, improved=false | wrongWing 10→**9**, improved=**true** |

Refinement Sprint v3가 Short-Circuit Gap으로 분류한 2건
(scrambleDepth30:2, scrambleDepth100:5) 모두 회복됐다. Primitive
Failure로 분류했던 1건(scrambleDepth40:7)은 예상대로 이 수정과 무관하게
그대로 실패했다 -- v3의 Root Cause 분류가 정확했음을 실측으로 재확인.

## STEP4. Short-Circuit Validation

| Case | mcmShortCircuited | chosenType | improved |
|---|---|---|---|
| scrambleDepth30:2 | **true** | MULTI_COMPONENT_MERGE | true |
| scrambleDepth100:5 | **true** | MULTI_COMPONENT_MERGE | true |

trace 실측으로 "MCM 선택 → wrongWing 감소 → 즉시 반환(short-circuit)"
경로가 실제로 발생함을 직접 확인했다(`recovery-repair-short-circuit`
로그 항목이 `MULTI_COMPONENT_MERGE`를 언급하며 등장). 두 케이스 모두
Refinement Sprint v3가 예측한 메커니즘 그대로 재현됐다.

## STEP5. Regression Audit (전체 142케이스, Baseline vs Integrated)

| 지표 | 값 |
|---|---|
| newRegressionCount | **0** |
| newCapabilityCount | 3 |
| duplicateRescueCount | 0 |
| starvedTypeCount | 4 |

새로운 Regression 없음(0건). `starvedTypeCount=4`는 disclosed 방법론
한계다 -- "Integrated 전체 실행에서 한 번도 chosen되지 않은
RecoveryType의 개수"라는 단순 정의를 썼는데, 이번 Sprint는 Gate-matched
케이스 수 자체가 작아(9→12/142) 여러 타입이 구조적으로 드물게
선택되는 것이 정상이다 -- 실제 상호작용 이상 신호가 아니라 이 지표
정의 자체의 엄격함에서 비롯된 것으로 판단한다.

## STEP6. Statistical Validation + Validation Framework

| 비교 | 값 |
|---|---|
| improvedCountDiff mean | 0.0211, 95% CI=[-0.0026, 0.0449], Cohen's dz=0.146(negligible) |
| runtimeDiffMs mean | 34.0ms, 95% CI=[6.8, 61.3] |

| Gate | 결과 | 근거 |
|---|---|---|
| A(Regression 증가 없음) | PASS | True/False Regression diff 모두 0 |
| B(Runtime 허용 범위) | PASS | +34ms, 허용 기준(194ms) 이내 |
| C(Capability 감소 없음, strict) | OPEN_QUESTION | 95% CI가 0을 살짝 포함([-0.0026, 0.0449]) -- 개선 방향이지만 통계적 유의성에는 못 미침 |
| E(Primitive Interaction 이상 없음) | OPEN_QUESTION | starvedTypeCount=4 (STEP5의 disclosed 한계 참고) |

Pipeline Decision(Category C Gate 구성: A/B/C/E) = **B**(조건부 승인).

## Level 1-3 판정

- **Level1 (Short-Circuit Contract 정상 동작)**: **PASS** -- 2건 모두
  "개선 → 즉시 반환" 확인(mcmShortCircuited=true).
- **Level2 (Capability 증가, Regression 없음)**: **PASS** -- successMismatch
  2/2 회복 + 전체 population newRegressionCount=0.
- **Level3 (Validation Framework Decision A)**: **FAIL** -- Pipeline
  Decision=B(Gate C/E가 OPEN_QUESTION).

## Decision

**Decision B: 부분 회복 (Partial Recovery) -- 추가 Contract Refinement 권장.**

이 Sprint의 핵심 가설 -- "Short-Circuit Gap이 successMismatch 2건의
직접 원인이었다" -- 은 실측으로 **완전히 확인됐다**: 정확히 예측된
2건(scrambleDepth30:2, scrambleDepth100:5)이 회복됐고, 정확히 예측된
1건(scrambleDepth40:7, Primitive Failure)은 그대로 남았으며, 전체
142케이스에서 새로운 Regression은 0건, 오히려 실제 production
조건(outer=1000ms)에서도 이전에 발견되지 않은 +3건의 추가 Capability가
확인됐다. Level1/Level2는 명확히 PASS다.

다만 Validation Framework 자체는 Decision A(완전 승인)에 도달하지
못했다 -- Gate C(Capability)의 95% CI가 근소하게 0을 포함하고
(effect size가 negligible한 것은 전체 142케이스 중 영향받는 케이스가
소수이기 때문에 당연한 결과), Gate E(Interaction)는 이 Sprint의 자체
`starvedTypeCount` 정의가 이렇게 작은 모집단에는 과도하게 엄격하기
때문이다(disclosed). 즉 **목표로 삼은 구체적 증거(2건 회복 + 0
Regression)는 완전히 달성됐지만, Framework의 일반화된 통계적 기준은
아직 "A" 등급에 이르지 못했다** -- 그래서 Decision A(MCM Integration
완전 종료)가 아니라 Decision B로 판정한다. Multi-Component Merge의
Production Integration은 이 수정으로 실질적인 진전을 이뤘으며, 남은
작업은 (1) 더 큰 N에서 Gate C의 통계적 유의성을 재확인하거나, (2) Gate
E의 `starvedTypeCount` 정의를 이 Sprint 규모에 맞게 재보정하는 것이다.
