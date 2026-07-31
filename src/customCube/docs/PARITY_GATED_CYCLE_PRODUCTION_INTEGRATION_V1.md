# Solver Primitive Discovery Sprint #6 — Parity-Gated Cycle Production Integration Sprint v1

## 0. 방법론 disclosure

- **Production 변경 범위**: `fiveByFiveEdgeRecovery.ts` (Directive가 명시적으로 허용한 유일한 파일)에
  `genParityGatedCycle()` 추가. **추가로**, `RecoveryStrategy.type`이
  `RecoveryType`(다른 파일 `fiveByFiveEdgeSolverTypes.ts`에 정의) 유니온
  타입이라, 새 후보에 `"PARITY_GATED_CYCLE"` 태그를 붙이려면 그 유니온에
  한 줄을 추가해야 했다 — Directive의 명시적 허용 목록에는 없는 파일이라
  사용자에게 직접 확인했고, CCR/MIXED_COMMUTATOR가 각각 처음 통합될 때도
  동일하게 이 유니온에 한 줄씩 추가된 전례가 있음을 근거로 **승인받아
  진행**했다(AskUserQuestion, "RecoveryType에 1줄 추가 허용" 선택).
  그 외 파일은 전혀 수정하지 않았다 — `git diff --stat` 빈 결과로 확인.
  (부수적으로, 이 유니온 확장 때문에 타입 에러가 난 기존 연구용 파일
  `primitiveSetCompletenessV2/RecoveryAttemptProbe.ts`의
  `Record<RecoveryType, number>` 리터럴에 새 키 하나를 추가했다 — 보호
  목록에 없는 연구 파일의 사소한 컴파일 호환성 수정.)
- **Gate 재구현 disclosure**: Prototype 자신의
  `tryCrossComponentBridgeCycleResolverConfigured`는 내부에 G0
  (componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0)를
  하드코딩하고 있어 스왑할 수 없다(Prototype 알고리즘 자체는 절대
  수정하지 않음). 확정된 Gate(G3, componentCount>1만)를 실제로 적용하기
  위해, `genParityGatedCycle()`은 그 함수의 오케스트레이션(bridge 후보 →
  최선 선택 → validateDeferred)을 이미 export된 빌딩 블록
  (detectComponents/generateBridgeCandidates/traverseAllCycles/
  bestEffortCleanup, parityGatedCyclePrototypeV1, 수정 없음)으로 직접
  재구성했다 — Gate 체크만 G3로 바뀐, Integration Planning Sprint v1의
  GateAnalysis.ts/Refinement Sprint v1의 BudgetSweep.ts와 동일한
  disclosed-duplicate 패턴.
- **판정 원칙**: Level1-6과 Decision은 실측 수치에 기계적으로 적용했다.
  수동 보정 없음.

## STEP1. Production Integration (완료)

`fiveByFiveEdgeRecovery.ts`에 `genParityGatedCycle()`을 추가하고, 프로덕션
기본 순서(`reservedBudget` + `useSetupReservedSlice=true`)에
`[DISRUPT×2, REPAIR, CCR, **PARITY_GATED_CYCLE**, MIXED_COMMUTATOR, SETUP]`로
CCR 바로 뒤에 삽입했다(3개 스케줄링 전략 배열 전부에 동일 위치로 삽입).
`includeParityGatedCycle=true`가 기본값이라 실제 production 호출부
(`fiveByFiveEdgeExecutor.ts`, 이번 Sprint에서 전혀 수정하지 않음)는
자동으로 새 Primitive를 받는다 — CCR/MIXED_COMMUTATOR 통합 때와 동일한
"trailing defaulted parameter" 메커니즘.

## STEP2. Contract Audit (실제 production 경로 실측 확인)

| 항목 | 결과 | 근거 |
|---|---|---|
| Position(after_CCR) | **PASS** | 실제 onEvent 순서: CCR 시작 → PARITY_GATED_CYCLE 시작 → MIXED_COMMUTATOR 시작 확인 |
| Gate(componentCount>1) | **PASS** | 실제 케이스(`worstCase:4749cd9d`, componentCount=2, cycleCount=0, conflictEdgeCount=7 — G0 불만족)에서 skip되지 않고 실제 시도됨 확인 |
| Budget(2000ms clamping) | **PASS** | outer deadline=50ms일 때 실제 소요=167ms — 2000ms를 무조건 다 쓰지 않고 outer deadline에 clamp됨 확인 |

## STEP3/4. Production Replay + KPI (실측, 실제 attemptRecovery(), n=142)

| Metric | Baseline | Integrated |
|---|---|---|
| improvedCount | 17 | 14 |
| trueRegressionCount | 0 | 0 |
| runtimeMeanMs | 976.1 | 1019.9 |
| runtimeP95Ms | 1249.0 | 1242.0 |
| deadlineMissCount | 87 | 105 |

netNewRescueCount(Integrated에서만 개선된 케이스) = **3/142**.
PARITY_GATED_CYCLE 자체는 offered=0, chosen=0(win rate 0.0%).

## STEP5. Competition Analysis (실제 6-way 경쟁)

| Type | offered | chosen | chosenRate |
|---|---|---|---|
| DISRUPT | 1 | 1 | 100.0% |
| SETUP | 6 | 6 | 100.0% |
| REPAIR | 0 | 0 | - |
| CCR | 6 | 6 | 100.0% |
| MIXED_COMMUTATOR | 6 | 5 | 83.3% |
| **PARITY_GATED_CYCLE** | **0** | **0** | **0.0%** |

Duplicate=0, Starvation=false(offered 자체가 5 미만이라 정의상 Starvation
조건에 해당하지 않음).

## STEP6. 통계 검증

improvedCount paired-diff: mean=-0.0211, 95% CI=[-0.0625, 0.0203] (0을
포함 — 유의미하지 않음), Cohen's dz=-0.084. trueRegression paired-diff:
0(완전히 동일). Gate: A(Regression)=PASS, B(Runtime)=PASS,
C(Capability)=OPEN_QUESTION, E(Interaction)=PASS. Framework 자체 판정:
pipeline decision=B.

## 근본 원인 진단 (실측 기반, 매우 중요한 발견)

STEP3/4의 "PARITY_GATED_CYCLE offered=0/142"은 처음엔 버그처럼 보였다 —
STEP2의 Gate Audit는 이 Primitive가 실제로 시도된다는 것을 이미 확인했기
때문이다. 실제 15건에 대해 onEvent 타임스탬프를 직접 추적한 결과,
원인이 명확히 드러났다:

```
worstCase:46086463  ccr: 163ms -> 1005ms  pgc 시작 시점 남은 시간: -5ms
worstCase:84976575  ccr: 185ms -> 1013ms  pgc 시작 시점 남은 시간: -13ms
worstCase:b714481   ccr: 139ms -> 1132ms  pgc 시작 시점 남은 시간: -132ms
```

**CCR 자신의 Budget Contract("remainingTime", outer deadline 전체)가
실제로 전체 1000ms(`PLAN_TIME_BUDGET_MS`, 실제 solve()의 whole-plan
예산) 대부분 혹은 전부를 소비하는 경우가 흔하다** — Integration Planning
Sprint v1의 STEP1에서 이미 측정된 사실(CCR avgOwnMs=931ms)과 정확히
일치한다. `after_CCR` 위치에 배치된 PARITY_GATED_CYCLE의 "2000ms
Reserved Slice"는 `Math.min(deadline, Date.now()+2000)`로 outer
deadline에 clamp되므로, CCR이 이미 outer deadline을 다 써버린 뒤에는
**실질 예산이 0 또는 음수**가 된다. 15건 중 CCR이 빨리 끝난(~150-500ms)
나머지 케이스에서는 PARITY_GATED_CYCLE이 실제로 550~840ms의 실질 예산을
받아 정상적으로 탐색했지만("empty" — 탐색은 했으나 못 찾음), 그 자체가
Integration Planning Refinement Sprint v1의 Budget Sweep 곡선
(750ms→1.9%, 1000ms→9.4%)과 일치하는 낮은 확률이라 결국 142건 전체에서
단 하나도 rescue하지 못했다.

**결론**: Integration Planning Refinement Sprint v1의 Budget=2000ms
확정은 **Prototype을 단독으로(다른 후보와 경쟁 없이) 격리해 측정한
결과**였다. 실제 Production Scheduler 안에서는 CCR이 먼저 실행되고 그
자신의 remainingTime 계약이 종종 outer deadline 전체를 소비하기 때문에,
`after_CCR` 위치 + `remainingTime` 스타일 조합 자체가 구조적으로
PARITY_GATED_CYCLE에게 실질적인 실행 기회를 거의 주지 못한다. 이는
Prototype이나 Gate의 문제가 아니라 **Position과 Budget 확정 방식(격리
측정)의 한계**다 — Directive 자신의 disclosure("2000ms는 확정된
최적값이 아니라 이번 Sprint가 테스트한 범위의 상한")가 예견했던 위험이
실제로 발현된 사례.

## Level1-6 + 최종 Decision

| Level | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | Production Contract 정확히 구현 | **PASS** | Position/Gate/Budget 전부 실측 확인 |
| 2 | Regression 증가 없음 | **PASS** | baseline=0, integrated=0 |
| 3 | Capability 통계적으로 유의한 개선 | **FAIL** | CI=[-0.0625, 0.0203], netNewRescue=3/142 |
| 4 | Runtime 허용 범위 | **PASS** | Gate B=PASS |
| 5 | Primitive Interaction 문제 없음 | **PASS** | Duplicate=0, Starvation=false |
| 6 | Validation Framework Decision A | **FAIL** | pipeline decision=B |

**Decision: B** — Contract는 정확히 구현되었으나(Level1/2/4/5 PASS),
Capability 개선이 통계적으로 유의하지 않다(Level3/6 FAIL). **Production
Integration Refinement Sprint** 필요.

## 결론

- Contract(Position/Gate/Budget) 자체는 코드 레벨에서 정확히 구현되었음을
  3개 독립 Audit로 확인했다.
- 하지만 실제 142건 Production Replay에서 PARITY_GATED_CYCLE은 단 한
  건도 rescue하지 못했다(offered=0, chosen=0) — Regression은 없지만
  Capability 개선도 통계적으로 없다(CI가 0을 포함).
- **근본 원인은 명확히 진단했다**: CCR의 "remainingTime" Budget
  Contract가 outer deadline(1000ms) 대부분/전부를 소비하는 경우가 흔해,
  `after_CCR` 위치의 PARITY_GATED_CYCLE에게 실질적인 실행 시간이 거의
  남지 않는다. Integration Planning Refinement Sprint v1의 Budget
  Sweep은 이 경쟁 상황을 반영하지 않은 격리 측정이었다.
- 다음 단계(Production Integration Refinement Sprint)에서 검토해야 할
  후보: (1) PARITY_GATED_CYCLE을 CCR **이전**으로 재배치, (2) CCR 자신의
  Budget Contract를 remainingTime에서 고정 슬라이스로 바꾸는 대안 검토
  (CCR 자체는 이번 Sprint의 수정 대상이 아니므로 별도 Sprint 필요), (3)
  두 후보 모두에게 공정한 실질 예산을 보장하는 스케줄링 재설계.
