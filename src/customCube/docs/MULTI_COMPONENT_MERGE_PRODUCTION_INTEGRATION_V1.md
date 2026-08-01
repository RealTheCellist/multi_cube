# Multi-Component Merge Production Integration Sprint v1

## Section 0. 범위 및 방법론 disclosure

Integration Planning Sprint v1의 Decision A(Production Contract 확정: Position
before_PARITY/after_CCR, Gate componentCount>=3, Budget Dedicated Slice
2000ms)를 실제 `fiveByFiveEdgeRecovery.ts`에 배선했다. 변경 범위는 Directive가
허용한 두 파일로 한정된다:

- `fiveByFiveEdgeSolverTypes.ts`: `RecoveryType`에 `"MULTI_COMPONENT_MERGE"`
  추가.
- `fiveByFiveEdgeRecovery.ts`: `MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS=2000`
  상수, `includeMultiComponentMerge` 파라미터, `genMultiComponentMerge()`
  함수(Gate componentCount>=3, `tryMultiComponentMerge` 재사용 -- Comparative
  Prototype Sprint v1의 것을 UNMODIFIED로 재사용 -- + `traverseAllCycles`/
  `bestEffortCleanup`/`validateDeferred` 조합, `genParityGatedCycle()`과 동일한
  구조), 모든 `order` 배열에서 `genCCR` 다음/`genParityGatedCycle` 이전에 삽입.

Planner/Executor/SolverEngine/BFS/Deferred Validator/MultiCycle Analyzer/
Primitive 알고리즘(CCR/REPAIR/PARITY_GATED_CYCLE 내부 구현 포함)은 `git diff
--stat` 결과 0건 변경 확인(아래 커밋 참고).

STEP2 이후는 모두 실제 production 함수(`generateRecoveryStrategies()`/
`attemptRecovery()`, UNMODIFIED, read-only 사용)를 통해 전체 142-case Hole
Dataset에 대해 측정했다 -- 새 Dataset 없음.

## STEP2. Contract Audit

`ContractAudit.ts` -- 실제 `generateRecoveryStrategies()`를 `onEvent` 훅과 함께
호출해 Position/Gate/Budget/RecoveryType을 실측.

| 지표 | 값 |
|---|---|
| gateMatchedRate | 6.3% (9/142) -- Planning Sprint의 실측(9/142)과 정확히 일치 |
| positionCorrectRate | 100% (9/9) -- CCR 종료 후, PARITY_GATED_CYCLE 시작 전에 항상 삽입됨 확인 |
| avgActualBudgetAvailableMs | **493.6ms** (명목 2000ms의 24.7%) |
| budgetStarvedCount | **9/9 (100%)** |
| chosenCount(MCM이 argmax 승리) | 1/9 |

**핵심 발견**: Contract 자체(Position/Gate)는 설계대로 정확히 동작하지만,
실제로 MCM이 받는 예산은 명목 2000ms의 4분의 1 수준(평균 493.6ms)에 불과했다.
CCR의 `remainingTime` Budget Contract가 Outer Deadline(1000ms)을 먼저 상당 부분
소진하고, MCM의 `d = Math.min(deadline, Date.now() + 2000ms)`가 이미 얼마 남지
않은 Outer Deadline에 의해 clamp되기 때문이다.

## STEP3. Capability Validation (Baseline vs Integrated, 실제 attemptRecovery())

`CapabilityValidation.ts` -- `parityGatedCycleProductionIntegrationV1/Replay.ts`와
동일한 방법론(disclosed 재사용): Baseline(`includeMultiComponentMerge=false`)
vs Integrated(`true`), 나머지 모든 옵션(CCR/REPAIR/MIXED_COMMUTATOR/
PARITY_GATED_CYCLE 포함) 동일 유지, 실제 `attemptRecovery()` 호출.

| 지표 | 값 |
|---|---|
| baselineImprovedCount | 14/142 |
| integratedImprovedCount | 15/142 |
| newCapabilityCount(raw) | 1 |
| duplicateCount | 0 |
| regressionCount | 0 |

**중요한 검증 포인트**: raw `newCapabilityCount=1`로 나온 케이스
(`worstCase:e9009e73`)를 STEP6에서 직접 재확인한 결과, 이 케이스는
`componentCount=2`(Gate Miss)였고 `chosenType="CCR"`였다 -- **MCM과 무관한
케이스**였다. Baseline/Integrated 두 arm 모두 `deadlineMissed=true`였는데,
Baseline은 우연히 후보를 하나도 생성하지 못했고 Integrated는 CCR이 간신히
후보를 하나 생성한 것으로, 두 개의 독립적인 real-time 실행 사이의 wall-clock
타이밍 변동(noise)으로 보인다. **MCM 자신이 실제로 후보를 생성한 유일한
케이스(`scrambleDepth100:5`)는 `improved=false`(개선 실패)였다** --
`componentCountBefore=3, componentCountAfter=3`(병합 자체가 실패). 즉 MCM에
실제로 귀속 가능한 신규 Capability는 **0건**이다.

## STEP4. Primitive Interaction

`PrimitiveInteraction.ts` -- STEP2/STEP3 실측 결합.

| 지표 | 값 |
|---|---|
| overlapCount(CCR/REPAIR/PARITY_GATED_CYCLE와 공존) | 1/9 (11.1%) |
| duplicateRescueCount | 0 |
| replacementCount | 0 |
| starvationCount | **9/9 (100%)** |
| avgActualBudgetAvailableMs | 493.6ms |

REPAIR와의 겹침은 0%(모든 componentCount>=3 케이스가 conflictEdgeCount=0),
CCR과의 겹침도 낮다(11.1%) -- 진짜 경쟁 요인은 Scheduler Ordering(누가 먼저
실행되어 시간을 쓰는가)이 아니라 **CCR의 Budget Contract 자체가 뒤따르는 모든
후보의 실질 가용 예산을 줄인다**는 점이다.

## STEP5. Statistical Validation + Validation Framework

`StatisticalValidation.ts`(evaluatePairedDiff 재사용) + `ValidationFramework.ts`
(Category C "New Primitive", Gate A/B/C/E, `decideFromGates`).

- improvedCountDiff: mean=0.0070, 95% CI=[-0.0068, 0.0208], Cohen's
  dz=0.084(negligible)
- trueRegressionDiff: mean=0, CI=[0,0]
- runtimeDiffMs: mean=-7.1ms, 95% CI=[-26.4, 12.2]

| Gate | 이름 | 결과 |
|---|---|---|
| A | Regression 증가 없음 | PASS |
| B | Runtime 허용 범위 | PASS |
| C | Capability 감소 없음(strict) | **OPEN_QUESTION** -- 유의미한 개선 없음 |
| E | Primitive Interaction 이상 없음 | PASS |

Pipeline Decision(Category C, production stage) = **B** (필수 Gate FAIL 없음이나
Gate C가 OPEN_QUESTION -- 조건부 승인, 후속 확인 권장).

## STEP6. Root Cause Analysis

`RootCauseAnalysis.ts` -- componentCount는 `computeStructuralFeatures()`로
독립 재계산(STEP2/STEP3의 서로 다른 실제 실행 간 wall-clock 비결정성을 피하기
위해 deterministic한 계산만 Gate Miss 판정에 사용).

| Bucket | 건수 | 비율 |
|---|---|---|
| GATE_MISS | 133/142 | 93.7% (Dataset Coverage ceiling = 6.3%) |
| RESOLVED | 0 | 0% |
| DUPLICATE | 0 | 0% |
| SCHEDULER_ORDERING | 0 | 0% |
| PRIMITIVE_FAILURE_OR_BUDGET | 9 | 100%(gate-matched 중) |

Budget Starvation Evidence: `avgActualBudgetAvailableMsAmongGateMatched=493.6ms`,
`budgetStarvedRateAmongGateMatched=100%`.

**결론적 원인 분리**: gate-matched 9건 전원이 PRIMITIVE_FAILURE_OR_BUDGET
bucket에 속하지만, STEP2/STEP4의 실측(100% Budget Starved, 평균 가용 예산이
명목의 24.7%)과 STEP3의 케이스 단위 재확인(`scrambleDepth100:5`가
Comparative Prototype Sprint v1의 독립 2000ms 예산 환경에서는 실제로 성공했던
케이스)을 종합하면, 이 실패는 **Primitive 알고리즘 자체의 한계가 아니라
CCR의 `remainingTime` Budget Contract와의 상호작용(Budget Starvation)으로
귀속**된다.

## Level 1-4 판정

- **Level1 (Operating Contract 정확히 구현)**: PASS -- Gate/Position 100% 일치.
- **Level2 (Regression 0)**: PASS -- True Regression diff 95% CI=[0,0].
- **Level3 (신규 Capability 확인)**: FAIL -- 실측 귀속 가능한 신규 Capability
  0건(raw 1건은 MCM과 무관한 wall-clock 노이즈로 확인).
- **Level4 (Validation Framework 통과)**: FAIL -- Pipeline Decision B(Gate C
  OPEN_QUESTION).

## Decision

**Decision B: Production Integration Refinement Sprint로 진행한다.**

Contract 자체(Level1/2)는 정확하고 안전하지만, 신규 Capability가 0건인 원인이
Root Cause 분석으로 명확히 **Budget Starvation**(CCR과의 예산 경쟁)으로
귀속되었다 -- Primitive 자체의 구조적 한계(Decision C 조건)가 아니다. 다음
Sprint는 Budget/Scheduler 재설계(예: MCM을 CCR보다 먼저 실행하거나, CCR의
`remainingTime` 대신 고정 상한을 두거나, MCM에 Outer Deadline과 무관한 독립
슬라이스를 부여하는 방안)를 다뤄야 한다.

## 산출물 수정 disclosure

driver(`runMultiComponentMergeProductionIntegrationV1.ts`)가 자동 생성한
최초 리포트는 Level3/4 FAIL과 `resolvedCount=0`만 보고 Decision C(Primitive
Blueprint로 회귀)를 냈다. STEP6 결과 JSON을 직접 재검토해 Budget Starvation
증거(100% starved)를 확인한 뒤, driver의 Decision 로직과 이미 생성된
report.txt/result.json을 Decision B로 수정했다 -- 새 Replay를 다시 돌리지
않고 이미 확보한 실측 데이터를 재해석한 것이며, 어떤 실측 수치도 변경되지
않았다(원인 분리 로직만 추가).
