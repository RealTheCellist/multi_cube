# Solver Primitive Discovery Sprint #6 — Parity-Gated Cycle Production Integration Planning Sprint v1

## 0. 방법론 disclosure

- **범위**: 새 디렉토리 `parityGatedCycleIntegrationPlanningV1/` + 이 문서만 추가.
  Production Solver 파일(`fiveByFiveEdgeSolverEngine.ts`,
  `fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeRecovery.ts`,
  `fiveByFiveEdgeExecutor.ts`, `BoundedResolver.ts`, CCR, MixedCommutator,
  MultiHopBridge, Validation Framework) 및 Prototype 알고리즘 파일
  (`parityGatedCyclePrototypeV1/`) 전부 수정하지 않았다 — `git diff --stat`
  빈 결과로 확인 완료 (STEP0).
- **방법**: 모든 "삽입 위치"/"경쟁"/"통합" 측정은 실제 production
  `generateRecoveryStrategies()`/`chooseBestRecovery()`(수정 없음)와 실제
  Prototype `tryCrossComponentBridgeCycleResolver()`(수정 없음)를 호출한
  뒤, 이 Sprint 자신의 코드에서 병합/재계산하는 **counterfactual
  replay**다. Production 코드 자체에는 병합 로직이 없다.
- **데이터셋**: STEP1/3/5는 전체 142건 Hole Dataset(`loadRawHoleDataset()`,
  수정 없음, 기존 Primitive들이 실제로 경쟁/매칭하는 모집단), STEP2/4는
  실제 53건 Unknown Population(`loadUnknownPopulation()`, 수정 없음, 새
  Dataset 생성 없음)을 사용했다 — Directive의 "Unknown Population 53건
  Replay" 지시와 "기존 Primitive와 비교"가 서로 다른 목적을 가지므로
  각각에 맞는 모집단을 선택했음을 명시한다.
- **판정 원칙**: Level1-5와 Decision은 실측 수치에 대해 기계적으로
  적용했다. 수동 보정 없음.

## STEP0. Protected File 검증

```
git diff --stat -- fiveByFiveEdgeSolverEngine.ts fiveByFiveEdgePlanner.ts \
  fiveByFiveEdgeRecovery.ts fiveByFiveEdgeExecutor.ts BoundedResolver.ts \
  solverPrimitiveCCRPrototype/ mixedCommutatorPrototype/ \
  MultiHopBridgePrototype.ts DeferredValidator.ts \
  solverPostReleaseValidationFramework/ parityGatedCyclePrototypeV1/
```
결과: 빈 diff. Prototype 알고리즘 자체도 이번 Sprint에서 전혀 수정하지
않았다 (Directive의 "Prototype 알고리즘은 수정하지 않는다" 원칙 준수).

## STEP1. Recovery Pipeline 분석 (실측, n=142)

프로덕션 기본 순서(`schedulingStrategy="reservedBudget"`,
`useSetupReservedSlice=true`, `fiveByFiveEdgeRecovery.ts` 407-412행에서
직접 인용): `[DISRUPT×2, REPAIR, CCR, MIXED_COMMUTATOR, SETUP]`.

| Type | Gate/조건 (소스 인용) | Budget (소스 인용) | generated | winRateAmongGenerated | avgOwnMs |
|---|---|---|---|---|---|
| DISRUPT | 없음(항상 시도) | 공유 genDeadline slice(300ms/4) | 0/142(0.0%) | - | 0.0 |
| SETUP | last-resort(candidates.length===0일 때만) | SETUP_RESERVED_SLICE_MS=500ms | 7/142(4.9%) | 100.0% | 284.0 |
| REPAIR | cycleLength 2~4 AND conflictEdgeCount>0 | REPAIR_RESERVED_SLICE_MS=75ms | 0/142(0.0%) | - | 0.0 |
| CCR | primaryCycleLength∈[5,6] AND conflictEdgeCount===0 | remainingTime(outer deadline 전체) | 5/142(3.5%) | 100.0% | 931.0 |
| MIXED_COMMUTATOR | cycleCount===1 AND componentCount===1 | MIXED_COMMUTATOR_RESERVED_SLICE_MS=300ms | 6/142(4.2%) | 100.0% | 297.7 |

실측 결과, 매칭되는 모든 타입은 chooseBestRecovery()의 argmax에서
100% 승리한다 — 서로 겹치지 않는 배타적 Gate 설계 덕분에 실제 경쟁이
거의 발생하지 않는다는 뜻이다. REPAIR가 이번 142건에서 0건 매칭된 것은
특이하지만, 이 Sprint의 목적과 무관하므로 별도 조사하지 않는다.

## STEP2. 삽입 위치 Counterfactual 분석 (실측, Unknown Population n=53)

| 위치 | Budget | produced(rescueRate) | wouldWin | avgWallMs | deadlineMiss |
|---|---|---|---|---|---|
| before_REPAIR(공유 slice) | 75ms | 0/53(0.0%) | 0 | 53 | 34/53 |
| after_REPAIR(전용 slice) | 75ms | 0/53(0.0%) | 0 | 53 | 34/53 |
| **after_CCR(remainingTime)** | **1000ms** | **2/53(3.8%)** | **2(100%)** | 717 | 29/53 |
| after_MIXED_COMMUTATOR(전용 slice) | 300ms | 0/53(0.0%) | 0 | 206 | 34/53 |
| before_SETUP(전용 slice, last-resort) | 500ms | 0/53(0.0%) | 0 | 447 | 34/53 |

`after_CCR` 위치(즉 CCR과 동일한 "remainingTime, outer deadline 전체"
Budget Contract)만 유일하게 실제 rescue를 냈다. deadlineMiss(=wallMs가
해당 위치의 nominal budget을 초과)가 모든 위치에서 34/53 또는 29/53으로
높다는 것은, Prototype 자신의 BFS 하위 예산들(`BRIDGE_BFS_PER_CANDIDATE_MS`
등)이 outer deadline까지는 계속 진행하기 때문 — 위치가 곧 "얼마나 오래
기다려 줄 것인가"의 문제임을 보여준다.

## STEP3. Gate 설계 비교 (실측, 전체 142건, 2000ms 관대한 Budget)

| Gate | coverage | improved | precision | avgRuntimeMsAmongMatched |
|---|---|---|---|---|
| G0(현재: componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0) | 45/142(31.7%) | 10 | 22.2% | 1883 |
| G1(conflict 완화) | 45/142(31.7%) | 10 | 22.2% | 1863 |
| G2(cycleCount 완화) | 46/142(32.4%) | 10 | 21.7% | 1920 |
| **G3(componentCount만)** | **49/142(34.5%)** | **11** | **22.4%** | 1867 |

G3(componentCount>1만)가 coverage/improved 둘 다 최고치를 기록했다 — Gate를
좁혀도(G0) 넓혀도(G3) Runtime은 거의 변화가 없다(1863~1920ms, 전부
Prototype 자신의 탐색 시간이 지배적이라는 뜻). G3를 채택해도 precision이
G0 대비 크게 나빠지지 않는다(22.2%→22.4%, 오히려 근소하게 개선).

## STEP4. Budget 스윕 (실측, Unknown Population n=53)

| Budget | improved | trueRegression | deadlineMiss | avgRuntimeMs |
|---|---|---|---|---|
| 40ms | 0/53(0.0%) | 0 | 34/53 | 31.1 |
| 80ms | 0/53(0.0%) | 0 | 34/53 | 55.3 |
| 120ms | 0/53(0.0%) | 0 | 34/53 | 81.4 |
| 160ms | 0/53(0.0%) | 0 | 34/53 | 108.8 |
| 200ms | 0/53(0.0%) | 0 | 34/53 | 134.9 |

Directive가 지정한 40~200ms 범위 전체에서 rescue=0건. Prototype Sprint
v1 자신의 실측 평균 Runtime(1271.2ms)이 이 범위를 압도적으로 초과하기
때문 — deadlineMiss가 34/53(모든 Gate-matching 케이스)으로 고정된 것도
같은 이유다(예산이 다 차도록 탐색이 끝나지 않음). STEP2의 `after_CCR`
위치(1000ms budget)에서만 rescue가 발생했다는 사실과 정합적이다.

## STEP5. 경쟁 분석 (실측, 전체 142건, Prototype 예산 300ms/500ms)

| Type | offered | chosen | chosenRate | starved | duplicate |
|---|---|---|---|---|---|
| DISRUPT | 0 | 0 | 0.0% | false | 0 |
| SETUP | 5 | 5 | 100.0% | false | 0 |
| REPAIR | 0 | 0 | 0.0% | false | 0 |
| CCR | 5~7 | 5~7 | 100.0% | false | 0 |
| MIXED_COMMUTATOR | 5~6 | 5~6 | 100.0% | false | 0 |
| PARITY_GATED_CYCLE | 0 | 0 | 0.0% | false | 0 |

300ms/500ms 두 Budget 모두에서 PARITY_GATED_CYCLE은 단 한 번도 offered
되지 않았다(STEP2/4와 정합 — 이 Budget대에서는 rescue가 나오지 않음).
따라서 Starvation(offered>=5 AND chosenRate<5%)도, Duplicate도 전혀
발생하지 않았다 — 애초에 경쟁에 참여하지 못했기 때문이다. 이는 Level4
자체는 PASS이지만, "경쟁 문제가 없다"기보다 "경쟁에 아직 참여할 수
없다"는 실측 사실로 해석해야 한다.

## STEP6. Integration Simulation + 통계 검증

Baseline(오늘의 실제 Scheduler) vs Integrated(Prototype을 500ms
Budget으로 병합) 짝지은 비교, 전체 142건.

| Metric | mean | 95% CI |
|---|---|---|
| improvedCount diff | 0.0000 | [-0.0480, 0.0480] |
| trueRegression diff | 0.0000 | [0.0000, 0.0000] |
| runtime diff(ms) | 172.23 | - |

Gate: A(Regression 증가 없음)=PASS, B(Runtime 허용 범위)=PASS,
C(Capability 감소 없음)=OPEN_QUESTION(개선폭이 0이라 유의미한 증가를
주장할 수 없음, 그러나 감소도 아님), E(Primitive Interaction 이상
없음)=PASS(실제 Starvation/Duplicate 수치 반영). Framework 자체 판정:
pipeline decision=B(조건부 승인, 후속 확인 권장) — 500ms Budget으로는
Capability 개선이 통계적으로 확인되지 않는다는 뜻이며, 이는 STEP4의
"200ms까지 rescue=0" 발견과 STEP2의 "500ms budget(before_SETUP
위치)에서도 produced=0" 발견 둘 다와 일치한다.

## Level1-5 + 최종 Decision

| Level | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | Integration Position 확정 | **PASS** | 최고 rescueRate 위치="after_CCR(remainingTime, 1000ms)" (rescueRate=3.8%) |
| 2 | Gate 확정 | **PASS** | 최고 improvedCount Gate="G3(componentCount만)" (improved=11/142) |
| 3 | Budget 확정 | **FAIL** | Directive 지정 범위(40~200ms) 내 어떤 Budget도 rescue=0. "미확정"이 아니라 "이 범위 안에는 없다"는 실측 결론 — 1000ms급 Budget에서만 rescue 확인됨(STEP2) |
| 4 | 기존 Primitive와 경쟁 문제 없음 | **PASS** | starvedTypes=없음, duplicateCount=0 (단, 아직 경쟁에 참여하지 못해서이기도 함) |
| 5 | Production Integration Contract 작성 | **PASS** | 아래 Contract에 실측 결과 그대로 기록 |

**Decision: B** — 위치(after_CCR)와 Gate(G3)는 확정되었으나, Directive가
지정한 40~200ms 범위 안에서는 Budget이 확정되지 않음(더 큰 Budget
필요). **Integration Planning Refinement Sprint** 필요.

## Integration Contract (현재까지 확정된 것)

- **position**: after_CCR (CCR과 동일한 "remainingTime, outer deadline
  전체" Budget Contract 위치)
- **gate**: G3(componentCount>1만) — G0보다 coverage/improved 모두 우수
- **budgetMs**: 미확정 (40~200ms 범위 내 없음; 1000ms급에서 rescue 확인,
  다음 Sprint에서 500~2000ms 구간을 세밀하게 스윕해 확정 필요)
- **priority**: argmax(score) — chooseBestRecovery()와 동일한
  futurePotential−moveCost 공식으로 기존 5개 타입과 동일 기준 경쟁
- **fallback**: Gate 불일치 또는 Budget 내 미해결 시 후속 후보(SETUP 등)로
  폴백 — 기존 스케줄러의 인수 순서를 그대로 따름

## 결론

- Position과 Gate는 실측으로 확정되었다(after_CCR / G3). 하지만
  Directive가 지정한 Budget 범위(40~200ms)는 Prototype 자신의 실제
  Runtime(~1.2초, Prototype Sprint v1 실측)에 비해 한 자릿수 이상
  작아서, 이 범위 안에서는 통합 시 Capability 개선을 전혀 관찰할 수
  없다(rescue=0/53, 모든 5개 Budget에서).
- STEP2의 `after_CCR`(1000ms) 위치에서만 유일하게 rescue(2/53, 3.8%)가
  나왔다는 사실은 메커니즘 자체가 무효라는 뜻이 아니라, **적절한
  Budget만 주어지면 통합 가능**함을 시사한다.
- Decision B에 따라 다음 단계는 Production Integration Sprint가 아니라
  **Integration Planning Refinement Sprint**: 500~2000ms 구간을 세밀히
  스윕해 실제 Budget을 확정하고, `after_CCR` 위치/Gate G3 조합을
  전제로 한 최종 Integration Contract를 완성해야 한다.
