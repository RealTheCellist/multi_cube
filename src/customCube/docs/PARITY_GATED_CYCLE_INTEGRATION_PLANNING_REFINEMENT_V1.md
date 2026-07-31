# Solver Primitive Discovery Sprint #6 — Parity-Gated Cycle Integration Planning Refinement Sprint v1

## 0. 방법론 disclosure

- **범위**: 새 디렉토리 `parityGatedCycleIntegrationPlanningRefinementV1/`
  + 이 문서만 추가. Production Solver, Prototype 알고리즘
  (`parityGatedCyclePrototypeV1/`), 이전 Planning Sprint의 결과물
  (`parityGatedCycleIntegrationPlanningV1/`) 전부 수정하지 않았다 —
  `git diff --stat` 빈 결과로 확인 완료.
- **고정 조건** (Integration Planning Sprint v1의 Decision B에서 이미
  확정된 것, 이번 Sprint에서 변경하지 않음):
  - Integration Position = **after_CCR** (remainingTime Budget Contract)
  - Gate = **componentCount>1** (G3)
  - Prototype 알고리즘 자체 = 수정 없음
- **독립 변수**: Budget 하나만 500/750/1000/1250/1500/1750/2000ms 7개
  지점을 스윕했다. **모든 지점은 실제 Counterfactual Replay이며 보간은
  하지 않았다.**
- **데이터셋**: 실제 53건 Unknown Population(`loadUnknownPopulation()`,
  수정 없음, 새 Dataset 생성 없음) — 이 중 Gate G3(componentCount>1)
  매칭 36건이 실제 탐색 대상이다.
- **Gate 재구현 disclosure**: Prototype 자신의
  `tryCrossComponentBridgeCycleResolver`는 내부에 G0
  (componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0)을
  하드코딩하고 있어, 이미 확정된 Gate G3(componentCount>1만)를 그대로
  테스트하려면 동일한 파이프라인 구성 요소(detectComponents/
  generateBridgeCandidates/traverseAllCycles/bestEffortCleanup, 전부
  parityGatedCyclePrototypeV1에서 이미 export됨, 수정 없음)를 G0 체크만
  뺀 채로 재구성해야 한다 — Integration Planning Sprint v1의 GateAnalysis.ts가
  이미 사용한 것과 동일한 disclosed-duplicate 패턴이다.

## STEP0. Protected File 검증

빈 diff 확인 (Production Solver + Prototype 알고리즘 + 이전 Planning
Sprint 산출물 전부 미변경).

## STEP1/2. Budget Sweep — Capability Curve (실측, Unknown Population n=53, G3 매칭=36)

| Budget | gateMatched | improved | rescueRate | trueRegression | deadlineMiss | avgRuntimeMsAmongMatched |
|---|---|---|---|---|---|---|
| 500ms | 36 | 0 | 0.0% | 0 | 36/36 | 620 |
| 750ms | 36 | 1 | 1.9% | 0 | 31/36 | 820 |
| 1000ms | 36 | 5 | 9.4% | 0 | 31/36 | 1066 |
| 1250ms | 36 | 7 | 13.2% | 0 | 29/36 | 1231 |
| 1500ms | 36 | 10 | 18.9% | 0 | 25/36 | 1418 |
| 1750ms | 36 | 12 | 22.6% | 0 | 24/36 | 1585 |
| **2000ms** | 36 | **13** | **24.5%** | 0 | 23/36 | 1738 |

500ms에서 rescue=0(Integration Planning Sprint v1이 발견한 "500ms에서도
produced=0"과 정합)이던 것이, 750ms부터 rescue가 나타나기 시작해 2000ms까지
단조 증가한다. Regression은 전 구간에서 0건.

## STEP3. Dose-Response 분석

| 구간 | incrementalGain | marginalImprovementPerMs | plateaued |
|---|---|---|---|
| 500→750ms | +1 | 0.0040 | false |
| 750→1000ms | +4 | 0.0160 | false |
| 1000→1250ms | +2 | 0.0080 | false |
| 1250→1500ms | +3 | 0.0120 | false |
| 1500→1750ms | +2 | 0.0080 | false |
| 1750→2000ms | +1 | 0.0040 | false |

`anyImprovementAcrossWholeRange=true`, `monotonicNonDecreasing=true`,
`plateauStartsAtBudgetMs=없음`. **테스트한 500~2000ms 전 구간에서 단 한
번도 Plateau(정체)가 관측되지 않았다** — 즉 2000ms가 "이 메커니즘의 진짜
포화점"이 아니라 "이번 Sprint가 테스트한 범위의 상한"이라는 뜻이다. 이는
있는 그대로 공개한다: 더 큰 Budget(예: 2500ms 이상)에서 추가 개선이
있을 가능성을 배제할 수 없다.

## STEP4. Pareto Frontier

7개 지점 전부가 Pareto-efficient였다(각 지점이 improvedCount와 avgRuntimeMs
둘 다에서 서로를 지배하지 않는 단조 관계이기 때문 — Budget이 늘수록
improvedCount도 Runtime도 함께 늘어나는 형태라 어느 지점도 "열등"하지
않다). 상위 3개 후보(improvedCount 기준): **2000ms, 1750ms, 1500ms**.

## STEP5. 통계 검증 (vs no-op Baseline, n=53)

| Budget | improvedCount diff mean | 95% CI | Cohen's dz | Gate A | Gate B | Gate C | Gate E |
|---|---|---|---|---|---|---|---|
| **2000ms** | 0.2453 | [0.1283, 0.3622] | 0.565 | PASS | OPEN_QUESTION | PASS | PASS |
| 1750ms | 0.2264 | [0.1127, 0.3402] | 0.536 | PASS | OPEN_QUESTION | PASS | PASS |
| 1500ms | 0.1887 | [0.0823, 0.2950] | 0.478 | PASS | OPEN_QUESTION | PASS | PASS |

3개 후보 전부 95% CI가 0을 포함하지 않는다(유의미한 개선 확인). Gate
B(Runtime)는 세 후보 전부 OPEN_QUESTION인데, 이는 baseline이 no-op(런타임
≈0ms)라 상대적 허용 기준 자체가 무의미해지기 때문(이전 Sprint들에서
반복적으로 나타난 동일한 disclosed 현상, Gate B는 advisory이지 hard
blocker가 아님).

## Level1-5 + 최종 Decision

| Level | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | Budget Sweep 완료 | **PASS** | 7/7 지점 실측 완료, 보간 없음 |
| 2 | Pareto Budget 존재 | **PASS** | 7/7 지점 전부 Pareto-efficient |
| 3 | Capability 개선 통계적으로 유의 | **PASS** | 2000/1750/1500ms 전부 CI가 0 미포함 |
| 4 | Regression 없음 | **PASS** | 3개 후보 전부 Gate A PASS (실측 trueRegression=0) |
| 5 | Operating Contract 확정 | **PASS** | Budget=2000ms |

**Decision: A** — Level1-5 전부 PASS. Budget=2000ms로 Operating Contract
확정. 다음 Sprint는 **Parity-Gated Cycle Production Integration Sprint
v1**.

## Operating Contract (최종)

- **position**: after_CCR (remainingTime Budget Contract, Integration
  Planning Sprint v1에서 확정)
- **gate**: componentCount>1 (G3, Integration Planning Sprint v1에서
  확정)
- **budgetMs**: **2000**
- **fallback**: Gate 불일치 또는 Budget 내 미해결 시 SETUP 등 후속
  후보로 폴백 — 기존 스케줄러의 인수 순서를 그대로 따름(continue
  Recovery)

## 결론

- Integration Planning Sprint v1이 남긴 유일한 미지수(Budget)를 이번
  Sprint에서 실측으로 확정했다: **2000ms**, rescueRate 24.5%(13/36
  Gate-matching, 13/53 전체), Regression 0건, 95% CI=[0.128, 0.362]로
  통계적으로 유의미.
- 다만 Capability 곡선이 테스트 범위(500~2000ms) 전체에서 단 한 번도
  Plateau하지 않았다는 사실은 정직하게 공개해야 한다 — 2000ms는 "확정된
  최적값"이 아니라 "이번 Sprint가 테스트한 범위 안에서 가장 나은 값"이다.
  Production Integration Sprint에서 실제 배포 시 Runtime 예산(2000ms이
  after_CCR 위치의 remainingTime 한도 안에 들어가는지)을 함께 검토해야
  하며, 필요하다면 더 넓은 Budget 구간을 다시 테스트할 여지가 있다.
- 다음 단계: **Parity-Gated Cycle Production Integration Sprint v1** —
  이번에 확정된 Operating Contract(Position=after_CCR, Gate=G3,
  Budget=2000ms)를 실제 `fiveByFiveEdgeRecovery.ts`에 배선하고, 기존
  운영 계약들과 동일한 방식으로 N≥30 규모의 실제 solve() 기반 Validation을
  거쳐 Release 여부를 판단해야 한다.
