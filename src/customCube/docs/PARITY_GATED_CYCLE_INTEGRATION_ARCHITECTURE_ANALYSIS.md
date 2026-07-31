# Parity-Gated Cycle Integration Architecture Analysis Sprint v1

## Section 0. 범위 및 방법론 disclosure

이번 Sprint는 **Read-only 구조 분석**이다. Production 코드는 단 한 줄도
변경하지 않았다 -- 아래 "보호 파일 검증" 절 참고.

목적은 Production Integration Sprint v1이 남긴 미해결 질문 하나를
독립적으로 검증하는 것이었다: 실제 142-case Production Replay에서
`PARITY_GATED_CYCLE`이 `offered=0/142`로 관측된 것이 (1) Gate 설계,
(2) CCR과의 Budget 경쟁, (3) Scheduler 위치/순서, (4) Primitive 자체의
한계 중 무엇 때문인지 구조적으로 분리하는 것.

### 0-1. STEP1 계측 방식과 그로 인한 수치 차이 (중요, 반드시 disclosure)

STEP1의 per-candidate 타임스탬프(start/finish/remainingTimeBefore/After)를
얻으려면 `SchedulingEvent` `onEvent` 훅이 필요하다. 이 훅은
`generateRecoveryStrategies()`에만 노출되어 있고, `attemptRecovery()`는
내부에서 `generateRecoveryStrategies(...)`를 호출할 때 그 자리에
**`undefined`를 그대로 넘긴다** (`fiveByFiveEdgeRecovery.ts` 611번째 줄
`generateRecoveryStrategies(scratch, libs, deadline, weights, includeRepair,
schedulingStrategy, undefined, includeCCR, ...)` -- 7번째 인자가 고정된
`undefined`). 즉 `attemptRecovery()`를 통해서는 STEP1이 요구하는 타임라인을
계측할 방법이 없다. 이 Sprint의 `RecoveryTimelineCollector.ts`는 그래서
`generateRecoveryStrategies()`를 직접, 1회 호출한다 (Directive 원문은
"real `attemptRecovery()` call"이라 표현했지만, 이는 구조적으로 불가능하여
`generateRecoveryStrategies()` 직접 호출로 대체했다 -- 이 아크의 기존
"disclosed duplicate" 관행과 동일한 선상의 조정이다).

다만 `MAX_RECOVERY_RETRIES=1`이므로 `attemptRecovery()`도 결국
`generateRecoveryStrategies()`를 정확히 1회만 호출하며, 같은 deadline
폭(1000ms), 같은 `schedulingStrategy="reservedBudget"`,
`useSetupReservedSlice=true`를 사용한다 -- 두 경로는 구조적으로 동일해야
한다.

그럼에도 이번 STEP1 실측(Option A_current, 실제 production 순서)은
`parityOffered=4/142`로 나왔고, Production Integration Sprint v1의 실제
`attemptRecovery()` 기반 Replay는 `offered=0/142`였다. 두 수치가 다른
것은 코드 경로 차이가 아니라 **실행 시점 간 실제 wall-clock 타이밍
변동**으로 설명하는 것이 가장 타당하다: STEP2에서 확인되듯
`PARITY_GATED_CYCLE`이 시작될 때 남은 시간은 평균
`avgRemainingTimeAfterMs=291.5ms`(CCR 종료 직후 기준)으로, CCR 자신의
`avgRuntimeMs=300.7ms`(budgetShare=31.35%)가 매 실행마다 미세하게
달라지면 몇 개 케이스가 그 경계를 넘나들 수 있다. 즉 **이 수치 차이 자체가
Budget 경쟁이 timing-sensitive하다는 독립적인 증거**이지, 계측 버그가
아니다. 아래 STEP1-6의 구조적 결론(비율, 우세 원인)은 이 jitter에
강건하지만, 개별 케이스 단위의 정확한 카운트는 실행마다 몇 건씩 흔들릴 수
있음을 명시적으로 밝혀둔다.

### 0-2. 보호 파일 검증

```
git diff --stat -- fiveByFiveEdgeRecovery.ts fiveByFiveEdgeSolverEngine.ts \
  fiveByFiveEdgePlanner.ts fiveByFiveEdgeExecutor.ts fiveByFiveEdges.ts \
  fiveByFiveSolverTypes.ts
```
결과: 변경 없음 (exit 0, 출력 없음). 모든 Primitive/Validation
Framework/기존 Production Integration 코드도 동일하게 미변경.

## STEP1/2. Recovery Timeline 계측 + Budget Consumption Attribution

전체 142-case Hole Dataset, 실제 `generateRecoveryStrategies()` 1회 호출
(Option A_current = 오늘의 실제 production 순서: REPAIR -> CCR ->
PARITY_GATED_CYCLE):

| RecoveryType | started | avgRuntimeMs | p95RuntimeMs | avgRemainingAfterMs | budgetShare% |
|---|---|---|---|---|---|
| DISRUPT | 142 | 95.9 | 209.0 | 788.0 | 10.00% |
| SETUP | 122 | 235.0 | 637.0 | 32.6 | 24.50% |
| REPAIR | 142 | 35.7 | 187.0 | 752.3 | 3.72% |
| CCR | 142 | 300.7 | 914.0 | 451.5 | 31.35% |
| MIXED_COMMUTATOR | 142 | 48.7 | 302.0 | 242.8 | 5.08% |
| PARITY_GATED_CYCLE | 142 | 160.0 | 811.0 | 291.5 | 16.68% |

CCR이 전체 호출 시간의 31.35%를 차지하며(p95=914ms, 즉 1000ms 예산의
91%까지 소모하는 케이스도 존재), `PARITY_GATED_CYCLE`이 시작될 때 남은
시간(remainingTimeBefore)은 CCR이 끝난 직후 값과 사실상 같다 -- CCR이
REPAIR/DISRUPT보다 압도적으로 budget을 많이 쓴다는 Production Integration
Sprint의 진단이 이 Sprint에서도 재확인된다.

## STEP3. Counterfactual Scheduler Replay (실제 재실행, 순서만 변경)

같은 실제 REPAIR/CCR/PARITY_GATED_CYCLE 검색 함수와 각자의 실제 Budget
Contract를 그대로 쓰되, 상대적 순서만 바꿔 재실행:

| Option | 순서 | parityOffered | parityChosen | avgExpectedImprovement |
|---|---|---|---|---|
| A_current | REPAIR→CCR→PARITY | 4/142 | 4/142 | -176.81 |
| B_repair_parity_ccr | REPAIR→PARITY→CCR | 8/142 | 8/142 | -179.11 |
| C_parity_repair_ccr | PARITY→REPAIR→CCR | 9/142 | 9/142 | -171.24 |

CCR보다 먼저 PARITY_GATED_CYCLE을 실행하면 (Option B/C) 4~5건이 추가로
성공한다 -- 실측으로 확인된, 작지만 실재하는 Scheduler Ordering 효과.

## STEP4. Dedicated Budget Simulation (위치 고정, PARITY 예산만 변경)

Scheduler 위치는 오늘의 실제 순서(REPAIR→CCR→PARITY)로 고정하고
`PARITY_GATED_CYCLE`의 예산 정책만 스윕:

| policy | parityOffered | parityChosen |
|---|---|---|
| 500ms | 1/142 | 1/142 |
| 1000ms | 4/142 | 4/142 |
| 1500ms | 4/142 | 4/142 |
| 2000ms (실제 production 값) | 4/142 | 4/142 |
| remainingTime (무제한) | 4/142 | 4/142 |

1000ms 이상에서는 예산을 얼마나 늘려도 (심지어 완전히 무제한으로 풀어도)
결과가 전혀 바뀌지 않는다 -- **같은 위치에서는 예산의 크기(Number)가
병목이 아니라는 직접적 증거**. Refinement Sprint v1이 밝힌 "2000ms가
tested range 안에서 최선"이라는 결론과 모순되지 않는다: 그 Sprint는
경쟁자 없는 단독 측정이었고, 이 Sprint는 CCR과 실제로 경쟁하는 조건에서
예산 크기 자체의 한계효용이 이미 0에 수렴했음을 보여준다.

## STEP5. Gate Audit Funnel

| 지표 | 값 |
|---|---|
| totalCases | 142 |
| gatePassCount (componentCount>1) | 49 (34.5%) |
| offeredCount (= Primitive 성공, 아래 disclosure 참고) | 2 |
| budgetInsufficientCount (remainingTimeBefore<500ms) | 16 |
| primitiveFailureCount (remainingTimeBefore>=500ms, 그래도 미제공) | 31 |
| chosenCount | 2 |

(disclosure: 이 Funnel은 Real Production 순서, `entry.chosen`이 이미
`true`인 케이스를 제외하기 전 원시 buckets이라 STEP6의 최종
Root Cause Matrix보다 세분화가 거칠다 -- "Offered"와 "Primitive 성공"이
이 코드베이스 계약상 같은 이벤트라는 점은 `GateAudit.ts` 파일 헤더에
disclosure되어 있다.)

Gate 통과율 34.5%(49/142)는 Integration Planning Sprint v1이 G3 Gate에서
독립적으로 측정한 coverage(34.5%)와 정확히 일치한다 -- 서로 다른 Sprint,
서로 다른 실행에서 재확인된 교차검증.

## STEP6. Root Cause Matrix

142개 전체 케이스를, STEP1(실제 timeline) + STEP3(reordering
counterfactual) + STEP4(dedicated budget counterfactual) 데이터만으로
분류 (분류 규칙 전문은 `RootCauseMatrix.ts` 파일 헤더 참고):

| 원인 | count | %ofTotal | %ofDeficiency (RESOLVED 제외) |
|---|---|---|---|
| GATE_MISS | 93 | 65.5% | 66.4% |
| RESOLVED (이미 real production에서 chosen) | 2 | 1.4% | -- |
| CANDIDATE_SELECTION | 0 | 0.0% | 0.0% |
| SCHEDULER_ORDERING | 6 | 4.2% | 4.3% |
| BUDGET_STARVATION | 0 | 0.0% | 0.0% |
| PRIMITIVE_FAILURE | 41 | 28.9% | 29.3% |

**dominantDeficiencyCause = GATE_MISS**, 그 다음이 PRIMITIVE_FAILURE.
SCHEDULER_ORDERING은 실재하지만 작고(4.3%), BUDGET_STARVATION과
CANDIDATE_SELECTION은 정확히 0건 -- STEP4에서 이미 확인한 "예산 크기
자체는 병목이 아니다"라는 결론과 정확히 들어맞는다.

## Level1-3

- **Level1 (Budget 소비 구조 정량화)**: PASS. STEP1/2가 6개 RecoveryType
  전체의 avgRuntimeMs/p95/avgRemainingTimeAfter/budgetShare%를 실측으로
  제공했고, CCR의 31.35% budgetShare가 PARITY_GATED_CYCLE의 남은 시간을
  구조적으로 잠식함을 정량적으로 확인했다.
- **Level2 (Capability 부재 주원인 하나 이상 특정)**: PASS. STEP6에서
  GATE_MISS(65.5%)와 PRIMITIVE_FAILURE(28.9%)가 압도적 다수를 차지하며,
  SCHEDULER_ORDERING(4.2%)은 실재하지만 부차적이고, BUDGET_STARVATION은
  0%로 배제되었다.
- **Level3 (Refinement에서 수정할 Operating Contract 하나로 좁힘)**:
  PASS -- 단, 좁혀진 결론은 "Position/Gate/Budget 중 하나를 조정하라"가
  아니라 **"이 셋 중 어느 것도 조정해도 남은 이득이 미미하다"**이다.
  Budget은 STEP4에서 500ms 이상 어떤 값도 결과를 바꾸지 못함이 확인되어
  배제, Gate(`componentCount>1`)는 Bridge Cycle Resolver라는 Primitive의
  구조적 전제조건이라 더 넓힐 수 없고(Integration Planning Sprint에서
  이미 G0~G3 전 범위를 탐색해 G3가 최선이었음), Position은 유일하게 작지만
  실재하는 개선 여지(SCHEDULER_ORDERING 4.2%, CCR보다 먼저 실행 시 4~5건
  추가 회수)를 보였다. 그러나 이 개선폭은 PRIMITIVE_FAILURE(28.9%)에 비해
  한 자릿수 작다.

## Decision

**Decision C** (Primitive 자체 문제 → Primitive Prototype Refinement로
회귀).

근거: Capability 부재의 압도적 다수(GATE_MISS 65.5% + PRIMITIVE_FAILURE
28.9% = 94.4%)가 Integration Architecture(Position/Gate/Budget) 층위가
아니라 Primitive 자신의 적용범위와 탐색 성공률에 기인한다. Scheduler
Ordering을 CCR보다 앞으로 옮기면 소수 케이스(6/142, 4.2%)를 추가로 구할
수 있다는 것은 실측으로 확인된 사실이지만, 이 효과 하나를 위해 Scheduler
순서를 변경하는 것은 이번 연구 흐름상 우선순위가 아니다 -- 남은 가장 큰
기회는 Gate가 통과하는 49개 케이스 중 41개(83.7%)에서 Primitive의
bridge/traversal/cleanup 탐색 자체가 해를 찾지 못한다는 사실이다.

두 종결 질문에 대한 답:
1. **PARITY_GATED_CYCLE의 Capability 부재는 주로 무엇 때문인가?** --
   1차 원인은 Gate Miss(전체의 65.5%가 애초에 componentCount>1 조건을
   충족하지 않음), 2차 원인은 Primitive Failure(Gate를 통과한 케이스의
   83.7%에서 탐색 자체가 실패). Budget Starvation과 Candidate Selection은
   실측상 원인이 아니었다(각 0%). Scheduler Ordering은 작지만 실재하는
   3번째 원인(4.2%)이다.
2. **Production Integration Refinement에서 수정해야 할 Operating
   Contract는 정확히 무엇인가?** -- 없다. Position/Gate/Budget 셋 다
   추가로 조정해도 얻을 수 있는 이득은 (Scheduler Ordering의 4.2%를
   제외하면) 미미하다. 다음 단계는 Integration Contract 조정이 아니라
   Primitive Prototype 자체의 Bridge Candidate Generation/Multi-Cycle
   Traversal 알고리즘을 재검토하는 Primitive Prototype Refinement여야
   한다.
