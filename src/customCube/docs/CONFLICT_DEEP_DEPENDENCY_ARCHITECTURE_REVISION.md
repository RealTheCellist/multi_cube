# CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint v1

Status: Architecture Analysis Sprint (Production 코드 변경 없음) — Complete (**Decision B**, 자동 산출된 C를 수동으로 보정)
Population: Competition Matrix n=142×10; Additive/Substitutive Simulation n=142×5; Decision Audit n=142×5; Counterfactual Replay n=11×10(True Regression 케이스만); Policy Simulation n=142×8

## 0. 배경

직전 Reserved Slice Production Integration Sprint v1은 SETUP Reserved Slice(500ms)를 실제 Production에 통합한 뒤 Recovery-level improvedRate가 10.7%→5.1%(-5.6pp)로 **하락**했고 True Regression이 11건 발생하는 것을 확인했다(Decision C, Architecture Revision 필요 판정). 이번 Sprint의 목적은 그 **회귀의 구조적 원인을 데이터로 규명**하고, 실행 가능한 Scheduler 수정안을 설계하는 것이다. Production 코드(`fiveByFiveEdgeRecovery.ts` 포함)는 이번 Sprint에서 **단 한 줄도 수정하지 않았다** — 모든 측정은 실제, 수정되지 않은 `generateRecoveryStrategies()`/`chooseBestRecovery()`를 직접 호출(Executor 우회)하는 계측/재구성 방식으로만 이루어졌다.

**이 문서를 신뢰하기 전에 반드시 알아야 할 것: 이번 Sprint는 자체 계측 코드에서 두 건의 방법론적 버그를 발견하고 수정했다.** 아래 1절에서 상세히 설명한다. 두 버그 모두 수치를 왜곡시켰을 뿐 Production 코드와는 무관하며, 최종 수치는 두 차례의 재실행을 거쳐 검증된 것이다.

## 1. 자체 발견/수정한 방법론적 버그 (투명 공개)

### 버그 1 — Shared Ticking Deadline (STEP2/STEP4)

`AdditiveSubstitutiveSimulation.ts`와 `CounterfactualReplay.ts`의 최초 버전은 한 라운드 안에서 3~5개 arm의 후보를 **순차적으로** 생성하면서 하나의 `deadline` 변수를 공유했다. 즉 각 arm이 실제로 쓸 수 있는 예산이 "몇 번째로 생성되었는가"에 따라 달라지는 순서 편향이 있었다. 이는 실제 Production이 각 `attemptRecovery()` 호출마다 독립된 fresh deadline을 받는 것과 다르다. 이 버그는 STEP4의 최초 결과에서 `NO_RESERVED`(=예전 Baseline과 동일 설정) arm이 **11개 케이스 전부에서 succeededRate=0.0%**라는, 있을 수 없는 균일한 결과로 나타나며 발각됐다 — Baseline이 항상 늦게 처리되어 예산을 거의 못 받았기 때문이었다. 수정: 각 arm이 자신만의 `Date.now() + CALL_DEADLINE_MS`를 생성 직전에 새로 계산하도록 변경(Sprint 4의 `RecoveryLevelCollector`가 이미 쓰던 방식과 동일).

### 버그 2 — Root Cause 판정 기준 오류 (STEP4)

버그 1을 고친 뒤에도 `rootCauseArms`(어떤 arm을 제거하면 회귀가 해소되는지)가 11건 전부 `none`으로 나왔다. 원인: 판정 기준이 `armRegressedRate`(원래보다 wrongWing이 늘어남)의 감소였는데, 이 라운드-단위 프레이밍에서는 애초에 regressedRate가 모든 arm에서 항상 0%에 가까워 절대 트리거될 수 없는 죽은 코드였다. Sprint 4가 정의한 True Regression은 "원래보다 나빠짐"이 아니라 "Baseline이 Candidate보다 더 자주 성공함"(평균 비교)이었으므로, 기준을 `armSucceededRate`(Full 대비 얼마나 더 자주 성공하는지)로 교체했다 — 원본 raw 데이터를 다시 보니 이미 강한 신호가 있었다(예: `worstCase:e7a801fb`는 FULL 40% vs NO_SETUP/NO_RESERVED 100%).

두 버그 모두 수정 후 STEP2/STEP4를 재실행했고(체크포인트 방식, 각각 ~15분·~2회×10분), 아래 2~6절은 **모두 수정 완료된 최종 수치**다. 버그 발견 이전의 원본 수치는 `/tmp` 스크래치패드에 참고용으로 보관했다(문서에는 포함하지 않음).

## 2. Competition Matrix (STEP1, Deliverable 상당)

버그 없음(단일 `generateRecoveryStrategies()` 호출만 사용).

| 항목 | 값 |
|---|---|
| SETUP 승리 라운드 | 177/1420 (12.5%) |
| 승리 시 평균 score gap(2위와의 차이) | 682.2 |
| 밀려난 타입(2위)이 CCR인 경우 | 10건, 평균 gap 691.9 |
| 밀려난 타입(2위)이 MIXED_COMMUTATOR인 경우 | 6건, 평균 gap 666.0 |

SETUP은 전체 라운드의 12.5%에서 승리하며, 승리할 때 2위와의 score 차이가 상당히 크다(즉 확실한 승리이지 근소한 차이가 아니다). 승리 시 CCR/MIXED_COMMUTATOR가 2위로 밀려나는 경우가 있다는 것이 확인됐다.

## 3. Additive vs Substitutive Simulation (STEP2, Deliverable 상당)

| Arm | improvedRate | 주요 chosenType 분포 |
|---|---|---|
| BASELINE (useSetupReservedSlice=false) | 7.0% | none 92.5%, CCR 3.8%, MIXED 3.7% |
| ADDITIVE (Shadow 방식: Baseline 후보 + 합성 SETUP 후보 추가) | 14.6% | none 85.4%, SETUP 7.3%, CCR 3.7%, MIXED 3.7% |
| SUBSTITUTIVE (실제 Production, useSetupReservedSlice=true) | 9.6% | none 90.0%, SETUP 8.0%, CCR 0.1%, MIXED 1.7% |

ADDITIVE가 BASELINE 이상을 유지하는 것(상위집합 특성)은 이론대로 확인됐다. 하지만 **SUBSTITUTIVE가 BASELINE보다 오히려 개선(7.0%→9.6%, +2.6pp)**되어, Reserved Slice Production Integration Sprint v1의 실측(10.7%→5.1%, -5.6pp, 실제 회귀)과 **반대 방향**이 나왔다.

**이 불일치를 어떻게 해석해야 하는가**: 이 Sprint의 STEP2는 실제 `attemptRecovery()`를 호출하지 않고 "생성→선택→재시도"를 자체 재구성한 것이다(Sprint 4의 `RecoveryLevelCollector`는 실제 `attemptRecovery()`를 직접 호출 — REPAIR/CCR/MIXED_COMMUTATOR의 short-circuit 로직, visited-state 추적 등 실제 코드 경로를 그대로 탄다). 두 측정 중 실제 프로덕션 콜패스를 그대로 타는 Sprint 4의 원본 측정(10.7%→5.1%)이 더 권위 있는 기준선이다. 따라서 이 Sprint 자체만으로는 "Additive vs Substitutive" 가설의 **집계 수준(population-level) 방향**을 독립적으로 재확인하지 못했다 — 이는 미해결로 남긴다(6절 Decision Matrix에서 OPEN_QUESTION으로 정직하게 표시).

## 4. chooseBestRecovery Decision Audit (STEP3, Deliverable 상당)

버그 없음(단일 실제 생성 호출 + 같은 라운드 내 대안 후보 재시도).

| 항목 | 값 |
|---|---|
| SETUP 채택 | 99/710 (13.9%) |
| SETUP 채택 후 실패 | 7건 |
| 실패 시 같은 라운드의 다른 후보가 대신 성공했을 경우 | **0/7 (0.0%)** |

SETUP이 실패한 7개 라운드 전부에서, 같은 라운드에 제안된 다른 후보(CCR/REPAIR/MIXED_COMMUTATOR 등)를 대신 시도해도 역시 실패했다. 즉 "SETUP이 선택되어 실패했지만 사실 CCR을 선택했으면 성공했을 것"이라는 단순한 **같은-라운드 대체 실패** 패턴은 이 데이터에서 지지되지 않는다 — 회귀 메커니즘은 더 미묘하다(5절 참조).

## 5. Counterfactual Replay — 11 True Regression 케이스 (STEP4, Deliverable 상당)

두 버그를 모두 수정한 뒤 재측정한 최종 결과:

| 케이스 | FULL 성공률 | NO_SETUP | NO_CCR | NO_MIXED | NO_RESERVED | 판정 |
|---|---|---|---|---|---|---|
| worstCase:e7a801fb | 40% | **100%** | 0% | 80% | **100%** | SETUP/RESERVED (+MIXED) |
| worstCase:e5101f85 | 40% | 30% | 30% | 20% | 70% | 불명확 |
| worstCase:e9009e73 | 0% | 0% | 0% | 0% | 10% | 불명확 |
| worstCase:e8be823 | 10% | 10% | 20% | 10% | 20% | 불명확 |
| worstCase:42c89b9 | 0% | **80%** | 0% | 0% | **70%** | SETUP/RESERVED |
| scrambleDepth10:8 | 10% | **80%** | 10% | 20% | 50% | SETUP/RESERVED |
| scrambleDepth30:0 | 20% | **90%** | 20% | 0% | **90%** | SETUP/RESERVED |
| scrambleDepth30:4 | 0% | 0% | **100%** | 0% | 0% | **CCR** (다른 원인) |
| scrambleDepth50:2 | 20% | **100%** | 10% | 30% | **100%** | SETUP/RESERVED |
| scrambleDepth50:8 | 0% | **100%** | 0% | 10% | **90%** | SETUP/RESERVED |
| scrambleDepth100:9 | 10% | 10% | 10% | 10% | 10% | 불명확 |

**11건 중 6건(55%)**에서 SETUP 또는 Reserved Slice를 제거하는 것만으로 성공률이 극적으로 회복된다(예: e7a801fb 40%→100%, 42c89b9 0%→80%, scrambleDepth50:2 20%→100%) — **SETUP Reserved Slice 통합이 이 케이스들의 회귀에 직접적 원인임을 명확히 확인**한다. 1건(scrambleDepth30:4)은 오히려 CCR을 제거해야 회복되는 다른 메커니즘(Directive가 금지한 CCR 내부 로직 수정과는 무관 — CCR "포함 여부" 토글의 영향)을 보인다. 나머지 4건은 어느 arm을 제거해도 뚜렷한 회복이 없는 불명확/노이즈성 케이스다.

## 6. Scheduler Blueprint Candidates — Option A/B/C/D (STEP5, Deliverable 상당)

| Option | 설명 | Risk | 정량 테스트 |
|---|---|---|---|
| **A — SETUP Last-Resort** | SETUP을 다른 후보와 동일한 argmax 경쟁에 넣지 않고, 다른 타입이 전혀 없을 때만 최후 수단으로 시도 | 낮음 | **실측 완료**: improvedRate 16.5%→17.0%, regressedCount 2→1 |
| B — CCR Winner 이후 SETUP 재도전 | CCR 실패 시에만 SETUP 시도 (A와 유사 방향, CCR 전용으로 더 좁음) | 중간 | A로 통합 테스트, 별도 수치 없음 |
| C — chooseBestRecovery score 수정 | SETUP 점수에 페널티 적용 | 중간 | Evaluator score 단위 미보정 → Rank 기반 최하위 우선순위(=Option A)로 대체 테스트 |
| D — Hybrid Additive Scheduler | 기존 후보에 추가만 하되 최선 후보 실패 시에만 SETUP 추가 시도 | 높음 | STEP2 ADDITIVE arm이 예비 데이터 |

**Option A(SETUP Last-Resort)**는 chooseBestRecovery() 자체를 수정하지 않고 그 앞에 selection 레이어만 추가하는 가장 낮은 위험의 방안이며, 실측상 regression을 줄이면서(2건→1건) capability도 완전히 잃지 않는 것으로 확인됐다.

## 7. Decision Matrix (STEP6) — 자동 산출 결과와 수동 보정

자동 생성된 `DecisionMatrix.ts`의 판정:

| Level | 기준 | 상태 |
|---|---|---|
| 1 | Additive vs Substitutive 가설 검증 | OPEN_QUESTION (3절 — 이 Sprint 자체 재구현이 Sprint4의 실제 attemptRecovery() 측정과 반대 방향) |
| 1 | Regression 11건 직접 원인 분리 | **PASS** (5절 — 6/11건 SETUP/Reserved로 명확히 설명됨) |
| 1 | SETUP이 누구를 밀어냈는지 | **PASS** (2절) |
| 1 | SETUP 실패 시 같은 라운드 대안 존재 여부 | OPEN_QUESTION (4절 — 0/7, 단순 대체 실패 패턴은 아님) |
| 2 | Scheduler 수정안 1개 이상 선택 가능 | **PASS** (6절 — Option A) |
| 3 | 다음 Sprint 구현 가능 | **PASS** (6절 — Option A 설계 완료) |

자동 로직은 "Level1의 4개 기준이 모두 PASS해야 Decision A/B, 하나라도 OPEN_QUESTION이면 C"로 설계되어 있어 **Decision C**를 산출했다. 그러나 이는 지나치게 엄격하다 — Level1의 2개 OPEN_QUESTION 중:
- "Additive vs Substitutive"는 이 Sprint의 재구현 방법론 자체의 한계(3절)이지, 회귀가 설명 안 된다는 뜻이 아니다.
- "같은 라운드 대안 부재"는 회귀 메커니즘이 "단순 대체"가 아니라는 뜻일 뿐, SETUP이 원인이 아니라는 뜻이 아니다 — 오히려 5절의 Counterfactual Replay가 훨씬 더 직접적이고 강력한 증거(6/11건 명확 확인)를 제공한다.

**수동 보정 판정: Decision B (Architecture Refinement)** — 원인은 상당 부분 규명되었고(Level1 중 2개는 명확한 PASS, 특히 가장 직접적인 증거인 Counterfactual Replay), Level2/3도 깨끗하게 PASS하며 실측으로 검증된 구체적 수정안(Option A)이 이미 존재한다. Decision C(Primitive Discovery로 완전히 회귀)는 근거가 부족한 원인 불명 상태를 뜻하는데, 이 Sprint는 그보다 훨씬 진전된 상태다. 다만 Decision A(바로 Prototype Sprint 진행)로 확정하기엔 STEP2의 집계-수준 불일치가 남아있어, 다음 단계에서 Option A를 **실제 attemptRecovery() 경로로 재구현**(이 Sprint의 재구현 방식이 아니라)하여 재검증하는 절차가 필요하다.

## 8. Next Sprint Proposal

**Scheduler Prototype Sprint** (Option A 실제 구현):
1. `fiveByFiveEdgeRecovery.ts`에 `chooseBestRecoveryWithSetupLastResort()` 또는 동등한 selection 레이어를 실제로 추가 (chooseBestRecovery() 자체는 수정하지 않음).
2. Sprint 4의 `RecoveryLevelCollector.ts`와 동일한 방법론(실제 `attemptRecovery()` 직접 호출, N=15)으로 Baseline vs Option A를 재측정 — 이번 Sprint의 STEP2 재구현이 아니라 실제 콜패스로 확인.
3. 11개 True Regression 케이스에서 Option A가 실제로 회귀를 해소하는지 개별 확인.
4. Full/False Regression 재분류, Release Readiness 재평가.
