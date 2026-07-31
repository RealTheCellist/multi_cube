# Parity-Gated Cycle Primitive Prototype Refinement Sprint v1

## Section 0. 범위 및 방법론 disclosure

이번 Sprint는 Integration Architecture Analysis Sprint v1의 Decision C를
검증하는 것이 목적이다 -- Capability 부재의 94.4%(Gate Miss 65.5% +
Primitive Failure 28.9%)가 Integration Architecture(Position/Gate/Budget)
가 아니라 Primitive 자체의 한계였다는 결론을, 그 **Primitive Failure
41건 자체**를 구조적으로 분해해 검증했다.

**Production Solver는 전혀 수정하지 않았다.** 이번 Sprint는 Primitive
알고리즘(`BridgeCandidateGeneration.ts`/`MultiCycleTraversal.ts`/
`BridgeRemoval.ts`/`ComponentDetection.ts`)도 수정하지 않았다 -- 모두
읽기 전용으로 재사용하거나, 계측이 필요한 지점만 이 아크의 기존
"disclosed duplicate" 관행대로 원본과 동일한 로직을 별도 파일에
재구현했다(각 파일 헤더에 명시).

보호 파일(git diff --stat 결과 0건 변경 확인): `fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdges.ts`,
`solverV2Prototype/DeferredValidator.ts`, `solverV2Prototype/MultiCycleAnalyzer.ts`.

모집단: 이전 Architecture Analysis Sprint의 결과 JSON에서 그대로 추출한
**41개 실제 PRIMITIVE_FAILURE 케이스** (재도출하지 않음).

### 0-1. 통계 검정 버그 수정 (투명하게 공개)

STEP6의 최초 구현은 3-arm Benchmark의 "improved 개선 여부"를 raw count
비교(`injectedImprovedCount <= currentImprovedCount`)로만 판단했다. 실제
1차 실행 결과 `injectedImprovedCount=6 > currentImprovedCount=5`로 나와
"Injection이 개선했다"고 잘못 분류될 뻔했으나, 그 차이의 paired-diff
95% CI가 `[-0.0234, 0.0722]`로 0을 포함하고 Cohen's dz=0.156로
"negligible"임을 확인했다 -- 통계적으로 유의하지 않은 차이였다. Raw
count 비교 대신 CI/effect size 기준으로 판정하도록 수정한 뒤
재계산했고, 아래 STEP6 결과는 수정된(올바른) 판정이다. (수정 커밋은
동일 Sprint 내에서 이루어졌으며, 코드 히스토리에 그대로 남아있다.)

## STEP1. Primitive Failure Taxonomy (n=41)

| 분류 | count | % |
|---|---|---|
| CANDIDATE_GENERATION_FAILURE | 31 | 75.6% |
| TRAVERSAL_FAILURE | 8 | 19.5% |
| SEARCH_EXHAUSTION | 2 | 4.9% |
| VALIDATION_FAILURE | 0 | 0.0% |

Candidate Generation Failure(Bridge 후보 자체를 못 만드는 경우)가
압도적 다수(75.6%)를 차지한다.

## STEP2. Candidate Generation Audit

- avgPairsAttempted=20.2 (source wing x target slot 조합, 양방향 합산)
- avgValidCount=0.37 (targetedComponentsMerged 통과)
- avgRejectedCount=19.3
- avgDuplicateRatio=0.000
- neverGeneratesAnyBridge=31/41 (75.6%)

핵심 발견: BFS(`bfsMoveWingToPosition`)는 시도한 조합의 대부분에서
물리적 이동 경로 자체는 찾아낸다(pathFoundCount가 pairsAttempted와
거의 같음, 개별 케이스 샘플에서 직접 확인) -- 그러나 그 경로가
`targetedComponentsMerged()` 검증을 통과하는 비율은 극히 낮다
(avgValidCount=0.37/attempted 20.2). 즉 병목은 "물리적으로 이동 경로가
없다"가 아니라 "이동해도 의도한 두 컴포넌트가 병합되지 않는다"이다.

## STEP3. Multi-Cycle Traversal analysis

- avgLeavesExplored=10.1
- avgMaxDepthReached=5.6
- hitCapOrDeadlineCount=0/41 (탐색 예산/leaf cap을 실제로 소진한 케이스는 0건)
- improvingLeafFoundCount=4/41

Traversal은 예산을 다 쓰기 전에 항상 자연 종료한다(0/41이 cap/deadline에
도달) -- Traversal 자체의 탐색 예산 부족은 이 41건에서 원인이 아니다.

## STEP4. Counterfactual Candidate Injection (후보 폭 무제한 확장)

- originalZeroCandidateCount=31/41
- recoveredByWideningCount=0
- recoveryRatePercent=**0.0%**

`MAX_SOURCE_WINGS_TRIED`/`MAX_TARGET_SLOTS_TRIED`(각 5)라는 bound를
완전히 제거하고 모든 wrong wing x 모든 target slot 조합을 양방향으로
전부 시도해도(예산도 300ms -> 2000ms로 확대), Candidate Generation
Failure였던 31건 중 단 한 건도 후보를 새로 찾지 못했다 -- **탐색
폭/예산 문제가 아니라는 직접적 반증**이다.

## STEP5. Capability Benchmark (3-arm, 실제 재실행)

| Arm | improvedCount | regressionCount | avgRuntimeMs | avgTraversalCount |
|---|---|---|---|---|
| Baseline | 0 (정의상) | 0 | - | - |
| Current(실제 bounded 검색) | 5 | 0 | 1311.4 | 0.37 |
| Injection(무제한 확장 검색) | 6 | 0 | 1228.3 | 0.39 |

improvedCount paired-diff (Injection - Current): mean=0.0244,
stddev=0.1562, **95% CI=[-0.0234, 0.0722]** (0 포함), Cohen's
dz=**0.156 (negligible)**.

Raw count는 6 vs 5로 하나 더 많아 보이지만, 통계적으로 유의하지
않다(CI가 0을 포함, effect size negligible) -- STEP4의 "회복률 0%"와
일관된 결론이다.

## STEP6. Root Cause Decision

- **rootCause = NEW_PRIMITIVE_NEEDED**
  - 근거: Candidate Generation Failure가 75.6%로 최다지만, 후보 폭을
    무제한으로 넓혀도(STEP4) 회복률 0.0%, 3-arm Benchmark(STEP5)에서도
    통계적으로 유의한 개선 없음(CI가 0 포함, effect size negligible) --
    탐색 폭/budget 문제가 아니라 "단일 wing 재배치"라는 현재 Bridge
    메커니즘 자체가 이 케이스들의 그래프 구조를 해결할 수 없음을 뜻한다.
- **finalDecision = C. 새로운 Primitive Blueprint 작성**
  - 근거: Primitive 자체(Bridge 메커니즘)의 구조적 한계가 확인됨.

### Level 1-3

- **Level1(원인 분리)**: PASS -- Candidate Generation/Traversal/
  Validation/Search Exhaustion 4분류로 41건 전수 분리 완료.
- **Level2(기여도 정량화)**: PASS -- Candidate Generation 75.6% vs
  Traversal 19.5% vs Search Exhaustion 4.9% vs Validation 0%로 실측
  정량화 완료, STEP4/5의 Counterfactual 실험으로 "탐색 폭 문제가
  아님"까지 별도 검증.
- **Level3(다음 Prototype 방향 확정)**: PASS -- 단, 확정된 방향은
  "Candidate Generation의 bound를 넓혀라"가 아니라 **"단일 wing 재배치
  기반 Bridge 메커니즘 자체를 재설계하라"**이다.

## 결론

75.6%의 실패 케이스에서 물리적 이동 경로(BFS path)는 찾아지지만, 그
이동이 의도한 두 컴포넌트를 병합하는 데 거의 항상 실패한다
(`targetedComponentsMerged()` 통과율 극히 낮음). 이는 탐색 파라미터를
아무리 넓혀도(STEP4: 무제한 확장, 회복률 0%) 해소되지 않는, "단일 wing을
하나 옮겨서 두 컴포넌트를 병합한다"는 현재 메커니즘 자체의 구조적
한계다. 다음 단계는 Prototype v2(같은 메커니즘의 파라미터 튜닝)가 아니라
**새로운 Primitive Blueprint 작성** -- 예: 여러 wing을 동시에 재배치하는
멀티-피스 Bridge, 또는 컴포넌트 병합을 다른 그래프 연산으로 달성하는
대안 메커니즘 -- 으로 회귀하는 것이 연구 흐름상 타당하다.
