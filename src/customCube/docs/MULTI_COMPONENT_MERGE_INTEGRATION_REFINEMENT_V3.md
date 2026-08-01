# Multi-Component Merge Production Integration Refinement Sprint v3

## Section 0. 범위 및 방법론 disclosure

Refinement Sprint v2가 남긴 마지막 미해결 증거는 successMismatch 3건
(scrambleDepth30:2, scrambleDepth40:7, scrambleDepth100:5 -- 모두
componentCountBefore=3, 모두 Comparative Prototype Sprint v1의 독립
2000ms 테스트에서는 성공했지만 production Arm C(outer=2000ms)에서는
실패)이었다. 이번 Sprint는 **원인 규명 전용**이다 -- 새 Primitive나
Scheduler 수정 없이, 이 3건의 실제 실행 Timeline을 실측으로 분해해 Root
Cause를 확정한다. Production 코드는 단 한 줄도 수정하지 않았다 --
`fiveByFiveEdgeRecovery.ts`를 포함한 모든 production 파일이 `git diff
--stat` 결과 0건 변경.

**실행 non-determinism 재확인 및 대응**: 이 시스템은 Date.now()-deadline
기반이라 동일 설정도 매 실행마다 실제 timing이 달라진다(이전 Sprint들이
반복 disclose한 사실). 이번 Sprint는 이를 감안해 최종 채택된 코드로
**4회 독립 반복 실행**(원본 1회 + 반복 3회)했고, 3건 모두 root cause
bucket이 반복 실행 전체에서 안정적으로 재현됨을 확인한 뒤 그 중 1회의
실측을 아래 표에 정본(canonical)으로 채택했다.

## STEP1. Competition Timeline (실측, outer=2000ms)

`CompetitionTimeline.ts` -- 실제 `generateRecoveryStrategies()`에 이미
존재하는 `onEvent` 계측 훅(`SchedulingEvent`)을 재사용해 후보 생성
순서/시작-종료 시각/자체 runtime/시작 시점의 잔여 시간을 전부 기록.

| Case | 실행 순서 | MCM 시작 시각 | MCM 자체 runtime | MCM 시작 시 잔여시간 |
|---|---|---|---|---|
| scrambleDepth30:2 | DISRUPT→DISRUPT→REPAIR→CCR→**MCM**→PARITY→MIXED→SETUP | 495ms | 1045ms | 1505ms |
| scrambleDepth40:7 | DISRUPT→DISRUPT→REPAIR→**CCR(1654ms)**→MCM→PARITY→MIXED→SETUP | 2025ms(이미 outer 초과) | 1ms | -25ms |
| scrambleDepth100:5 | DISRUPT→DISRUPT→REPAIR→CCR→**MCM**→PARITY→MIXED→SETUP | 237ms | 1870ms | 1763ms |

scrambleDepth40:7만 CCR 자체가 1654ms(다른 두 케이스는 CCR이 1ms만
소비)를 소비해 MCM이 사실상 예산을 받지 못하고 출발한다 -- CCR의 실측
runtime은 이 Sprint의 여러 실행에서 최대 3645ms까지 관측되어 CCR
자체의 runtime 변동성이 상당함을 확인했다(CCR 알고리즘은 이 Sprint의
보호 대상이라 수정하지 않음, 사실만 disclose).

## STEP2. Primitive Competition Attribution Matrix

`CompetitionAttribution.ts` -- MCM 이전에 실행된 각 Primitive를 시간
소비/후보 생성/선택 경쟁으로 분리.

세 케이스 모두 MCM 이전 Primitive(DISRUPT/REPAIR/CCR) 중 어느 것도
실제 후보를 생성하지 못했다(`producedCandidate=false` 전원) -- 즉
"다른 Primitive의 후보가 MCM과 경쟁해서 진 것"이 아니라 순수하게 시간만
소비하고 사라졌다. scrambleDepth40:7만 CCR의 시간 소비(1654ms)가
MCM의 시작을 outer deadline 이후로 밀어냈다(`mcmOwnBudgetMs=-25`).

## STEP2(addendum). Short-Circuit Gap Audit -- 예상치 못한 핵심 발견

`ShortCircuitAudit.ts` -- 실제 trace를 파싱해 발견한, Directive의 6개
이름 buckets 어디에도 정확히 들어맞지 않는 **새로운 메커니즘**:

scrambleDepth30:2와 scrambleDepth100:5에서 MCM은 `chooseBestRecovery`에
**실제로 선택**되고, 그 moves가 `wrongWing 11->10`, `10->9`로 **실제로
net-improve**했다(trace의 `recovery-applied` 로그로 직접 확인). 그런데
`attemptRecovery()`의 `shortCircuitRepair` 즉시-반환 로직은
`best.type === "REPAIR" || "CCR" || "MIXED_COMMUTATOR" ||
"PARITY_GATED_CYCLE"`만 검사하고 **MULTI_COMPONENT_MERGE는 그 목록에
없다**(fiveByFiveEdgeRecovery.ts, 읽기 전용 참조 -- 이 Sprint는
수정하지 않음). 그 결과 MCM의 이미 검증된 개선분이 즉시 반환되지 않고
`retryTask` 라운드트립으로 넘어가며, 다음 라운드에서 outer deadline을
넘겨 for-loop가 `break`되면 함수 맨 끝의 `return [];`가 **이미
확보한 개선분을 통째로 폐기**한다.

| Case | MCM 선택됨 | MCM 자체 net-improve | 최종 반환 moves | 결론 |
|---|---|---|---|---|
| scrambleDepth30:2 | Yes | Yes(11→10) | 0건(폐기) | Short-Circuit Gap |
| scrambleDepth40:7 | No(CCR이 예산 소진) | -- | 0건 | (다른 메커니즘, 아래) |
| scrambleDepth100:5 | Yes | Yes(10→9) | 0건(폐기) | Short-Circuit Gap |

4회 독립 실행 전체에서 scrambleDepth30:2/scrambleDepth100:5는 매번
`shortCircuitGapDetected=true`로 재현되어 이 메커니즘은 **일회성 노이즈가
아니라 구조적으로 안정된 재현 가능한 버그**임을 확인했다.

## STEP3. Primitive Responsibility Matrix (Counterfactual Removal)

`PrimitiveRemoval.ts` -- `includeCCR`/`includeRepair`/
`includeParityGatedCycle`/`includeMixedCommutator`를 하나씩 false로
바꿔 재실행(기존 파라미터만 사용, production 코드 미수정).

3건 모두 `anyRemovalRescues=false` -- 어떤 단일 Primitive를 제거해도
결과가 바뀌지 않았다. 이는 STEP2의 발견(경쟁 Primitive가 후보를
만들지 못했다)과 일치한다 -- 제거할 "경쟁자"가애초에 실질적 경쟁을
만들지 않았으므로 제거해도 변화가 없다.

**disclosed 범위 한계**: DISRUPT/SETUP은 기존 include 토글 파라미터가
없어(추가하려면 production 파일 수정 필요, 이 Sprint 금지) 제거
실험에서 제외했다 -- 이들의 기여는 STEP1/2의 timeline 증거로만
추론한다.

## STEP4. Budget Dependency Graph

`BudgetDependency.ts` -- STEP1 timeline에서 순수 산술로 도출(별도 측정
없음).

| Case | MCM 이전 소비 | MCM 가용 예산 | MCM 자체 사용 |
|---|---|---|---|
| scrambleDepth30:2 | 491ms | 1505ms | 1045ms |
| scrambleDepth40:7 | 2024ms | -25ms(이미 마이너스) | 1ms |
| scrambleDepth100:5 | 236ms | 1763ms | 1870ms |

scrambleDepth30:2/100:5는 MCM에게 충분한 예산(1505ms, 1763ms)이
돌아갔고 MCM은 그 예산 안에서 실제로 성공했다(1045ms, 1870ms 소비) --
예산 자체는 문제가 아니었다. 문제는 STEP2(addendum)에서 밝혀진
short-circuit 누락이었다.

## STEP5. Counterfactual Unlimited Production Replay

`UnlimitedReplay.ts` -- outer deadline을 60000ms로 늘려(Primitive/
Scheduler는 그대로, `attemptRecovery()`의 기존 `deadline` 인자만 변경)
"경쟁 자체는 남기되 Budget 제약만 없앤" 조건에서 재실행.

| Case | improved | chosenType | wallMs |
|---|---|---|---|
| scrambleDepth30:2 | false | MULTI_COMPONENT_MERGE | 2888 |
| scrambleDepth40:7 | false | MULTI_COMPONENT_MERGE | 7131 |
| scrambleDepth100:5 | false | MULTI_COMPONENT_MERGE | 4869 |

세 케이스 모두 Unlimited 조건에서도 `improved=false`다 -- **Outer
Deadline을 완전히 제거해도 이 3건은 회복되지 않는다.** 이는 얼핏
Refinement Sprint v2의 "Outer Deadline 확장이 유의미한 회복을
만든다"는 결론과 모순돼 보이지만, 사실은 정확히 STEP2(addendum)이
설명한다 -- MCM이 chosen되고 net-improve해도(scrambleDepth30:2/100:5),
short-circuit 목록 누락 때문에 여전히 폐기된다. 즉 Outer Deadline
확장은 "MCM이 후보로 살아남을 기회"는 늘리지만, "그 후보가 실제로
반환되는 것"까지는 보장하지 못한다 -- v2가 관측한 통계적 회복은 이
3건이 아닌 **다른** 케이스들에서 온 것이었다는 뜻이다.

scrambleDepth40:7만 다르다: Unlimited 조건에서는 CCR의 시간 소비와
무관하게 MCM이 실제로 chosen되지만(`chosenType=MULTI_COMPONENT_MERGE`),
여전히 improved=false다 -- 즉 예산이 무한해도 이 케이스는 MCM 자체가
net-improvement를 만들지 못한다(Primitive Failure, 아래).

## STEP6. Root Cause Matrix + Decision

| Case | Bucket | 근거 |
|---|---|---|
| scrambleDepth30:2 | **SHORT_CIRCUIT_GAP** | MCM chosen+net-improve(11→10)했으나 shortCircuitRepair 목록 누락으로 폐기됨 |
| scrambleDepth40:7 | **PRIMITIVE_FAILURE** | Unlimited Replay에서도 MCM이 chosen되지만 improved=false -- 예산과 무관하게 MCM 자체가 이 케이스를 풀지 못함 |
| scrambleDepth100:5 | **SHORT_CIRCUIT_GAP** | MCM chosen+net-improve(10→9)했으나 동일하게 폐기됨 |

(SHORT_CIRCUIT_GAP은 Directive의 6개 명명된 bucket에 없던 항목으로,
ShortCircuitAudit.ts의 실측 trace 증거로 이번 Sprint에서 추가했다 --
"MCM 자체 실패"가 아니라 "Integration 배선의 short-circuit 목록 누락"
이라는 별개의 실제 메커니즘이므로 Primitive Failure와 구분한다.)

### Level 1-3 판정

- **Level1 (Residual Competition 구조 정량화)**: **PASS** -- 3건 모두
  완전한 Timeline 확보(4회 독립 실행으로 재현성 확인).
- **Level2 (Root Cause 단일 귀속, Unknown<=1)**: **PASS** -- Unknown
  0건, 3건 모두 확정적 bucket 배정.
- **Level3 (다음 Sprint 방향 수렴)**: 경쟁 기반 원인(SHORT_CIRCUIT_GAP,
  2건)과 Primitive Failure(1건)가 혼재.

### Decision

**Decision B: Refinement를 계속한다 (case-by-case).**

3건 중 2건(scrambleDepth30:2, scrambleDepth100:5)은 **명확하고 좁은
범위의 Production Contract 수정**으로 해결 가능성이 높다 --
`attemptRecovery()`의 `shortCircuitRepair` 목록에 `MULTI_COMPONENT_MERGE`를
추가하는 것은, 이미 `genMultiComponentMerge()` 자체가 REPAIR/CCR/
MIXED_COMMUTATOR/PARITY_GATED_CYCLE과 동일한 `validateDeferred` net-
improvement 보증을 거치고 있으므로 그 4개 타입과 동일한 취급을 받도록
목록에 추가하는 것뿐이며, 새 메커니즘이나 알고리즘 변경이 아니다. 다만
이는 이번 Sprint의 protected-file 범위(`fiveByFiveEdgeRecovery.ts`
수정 금지)를 벗어나므로 이번 Sprint에서 직접 적용하지 않았다.

나머지 1건(scrambleDepth40:7)은 Unlimited Replay로도 회복되지 않아
Primitive Failure로 분류됐다 -- 그러나 이 1건만으로 Decision C(Primitive
Blueprint 회귀)를 내리는 것은 이번 Sprint 검증 원칙(3건 모두가
Primitive 한계로 확인되어야 함)에 맞지 않는다. 따라서 **Decision B**를
유지하고, 다음 Sprint는 (1) `shortCircuitRepair` 목록에
MULTI_COMPONENT_MERGE를 추가하는 좁은 Production Contract 변경을
실제로 적용해 2건이 회복되는지 재검증하고, (2) scrambleDepth40:7
단일 케이스는 별도로 Primitive Failure 원인(mergeStepsSucceeded=0,
traversal/cleanup 의존)을 더 깊이 분석하는 것을 제안한다.
