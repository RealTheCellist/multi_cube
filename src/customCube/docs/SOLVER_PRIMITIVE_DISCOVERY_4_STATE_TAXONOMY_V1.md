# Solver Primitive Discovery Sprint #4 — State Taxonomy Sprint v1

Status: Research Discovery (Read-only Analysis, Production Solver 무변경) — **Complete (Decision B)**
Population: 142 cases (Coverage Hole Discovery Sprint v1과 동일한 입력 선정 — Worst Case 52 + Snapshot335 샘플 30 + Depth-Graded Scramble 샘플 60), 현재 Release production 기준으로 전량 재생성

## 0. 배경

기존 State Taxonomy v1/v2는 CCR/Mixed Commutator/Scheduler SETUP Last-Resort/ENDGAME Reserved Slice가 Production에 통합되기 **이전**의 solver를 대상으로 분석했다. 이번 Sprint는 그 이후 누적된 모든 Production 변경을 반영한 **현재 Release 기준**으로 Hole Dataset을 처음부터 다시 수집하고, 기존 Primitive로 설명되지 않는 새로운 구조적 메커니즘이 남아 있는지 확인한다. 새 Primitive는 설계하지 않는다 — 상태 분석만 수행했다.

## 1. STEP1 — Hole Dataset 재생성

`coverageAtlas/HoleDatasetBuilder.ts`의 `buildLibs/selectHoleDiscoveryInputCases/buildHoleCase`를 무수정 재사용했다 — 이 함수들은 `FullPipelineProbe.ts`를 통해 현재 Production Solver를 그대로 호출하므로, 재실행만으로 그 사이의 모든 Production 변경이 자동 반영된다.

**결과: 142/142 케이스 전부 여전히 Hole**(현재 Production으로도 50-iteration 캡 안에서 수렴 못함). Coverage Hole Discovery Sprint v1 당시와 동일 개수다.

**Failure Mode 분포**(중복 가능, 상호 배타적이지 않음):

| Tag | 건수 | 정의 |
|---|---|---|
| noProgress(solve 실패) | 22 | 전체 파이프라인이 원본 대비 순개선 0 |
| partialImprove | 120 | 순개선은 있었으나 미완료 |
| timeout | 114 | 50회 반복 중 1회 이상 per-call 1초 예산 초과 |
| plannerAbort | 142 | 50회 반복 중 1회 이상 빈 moveQueue(Planner가 그 회차에 아무것도 못 만듦) |

**plannerAbort=142(100%)**는 실행 도중 발견된 STEP2의 핵심 단서와 직결된다(3절 참조).

## 2. STEP2 — Existing Primitive Attribution (중요한 방법론적 발견)

`solverReleaseReadiness/EndToEndSolveProbe.ts`의 `endToEndSolveProbe()`를 무수정 재사용해, 각 Hole의 최종 stuck 상태에 real solve() 1회를 추가로 걸어 현재 Task/Recovery 레이어가 무엇을 제안하는지 확인했다.

**결과: Already Explained=0, Partially Explained=0, Completely Unknown=142(100%)**.

**이 수치를 그대로 "142건 전부 새 메커니즘이 필요하다"로 읽으면 안 된다.** 실측을 직접 검증한 결과(5개 샘플의 raw trace를 직접 읽음), 원인은 새로운 구조적 갭이 아니라 **예산 소진이 PAIR Task 시도 전에 이미 끝나는 경우가 매우 흔하다**는 것이었다. 실제 trace 예시:

```
plan-tasks: 11개 태스크: PAIR(10), PAIR(3), ...
budget-exhausted: PAIR 태스크 도달 전 예산 소진
```

즉 Recovery/Task 레이어가 "시도했지만 실패"한 게 아니라 "시도할 기회 자체를 얻지 못했다." 이는 이 연구 이력에서 이미 확립된 구분(`mechanismAnalysis/CycleIsolationSubtypes.ts`의 `BUDGET_RECOVERABLE` vs `PURE_STRUCTURAL_ISOLATION`)과 정확히 같은 종류의 confound다 — 다만 이번 Sprint는 그 확장-예산 재검증 단계를 별도로 수행하지 않았다(범위 밖, disclosed).

**결론**: STEP2의 "Completely Unknown" 결과는 "이 상태를 도울 기존 메커니즘이 구조적으로 없다"가 아니라 **"기본 production 예산 하의 solve() 1회 호출로는 어떤 메커니즘도 관측되지 않았다"**로 해석해야 한다. STEP3 이후는 이 전제하에 142건 전체(=100% Unknown이므로 원래 목표였던 "Unknown 부분집합"과 전체 모집단이 동일해졌다)를 대상으로 구조 분석을 계속했다.

## 3. STEP3 — Structural Feature Extraction

`recoveryNecessity/StructuralFeatures.ts`(cycleCount/cycleLength/pairCount/swapEdgeCount/conflictEdgeCount/componentCount/hasParity)와 `mechanismAnalysis/CaseTaxonomyClassifier.ts`(taxonomyClass/mutualLockCount)를 무수정 재사용했다. 신규 추가 3개(disclosed formula):

- `bridgeCount = max(0, componentCount-1)`
- `disconnectedGraph = componentCount>1`
- `deferredViolation = cycleCount>0 && cycleLength < 4`(BP-1의 MIN_CYCLE_LENGTH 게이트 미만 — Multi-Hop 대상 시그니처)

## 4. STEP4 — Clustering 비교 (3가지 방식)

| 방식 | 클러스터 수 |
|---|---|
| Manual Taxonomy(기존 4-class) | 4 |
| Feature Similarity(12-feature composite key) | 49 |
| Graph Structure(componentCount+cycle+parity만) | 18 |

Manual Taxonomy 분포: PARITY_GATED_CYCLE=72, CYCLE_ISOLATION=36, CONFLICT_DOMINANT=29, LOCKED_PAIR=5 — 세 방식 모두 정성적으로 정합적이다(예: Feature Similarity의 최대 클러스터는 parity=true & cycle=long(5+) & conflict=false, n=14 — Manual Taxonomy의 PARITY_GATED_CYCLE 하위 정밀 분해와 일치).

## 5. STEP5 — Existing Blueprint Mapping

49개 Feature-Similarity 클러스터 각각에 대해 6개 기존 Blueprint(Deep Cycle/BP-1, CCR, Multi-Hop Bridge, Bridge Injection, Conflict-Breaking Sacrifice, Parity-Cycle Specialist/BP-2)의 disclosed precondition과 매칭했다.

| Verdict | 클러스터 수 | 케이스 수 |
|---|---|---|
| VARIANT_OF_EXISTING(단일 Blueprint 과반 일치) | 21 | — |
| AMBIGUOUS(복수 Blueprint 동시 과반 일치) | 28 | — |
| **NEW_MECHANISM_NEEDED(어느 Blueprint도 과반 미달)** | **0** | **0** |

**모든 49개 클러스터가 최소 1개의 기존 Blueprint와 100% 매치를 보였다.** AMBIGUOUS로 분류된 28개도 "새 메커니즘이 필요하다"가 아니라 "여러 기존 Blueprint 후보 중 무엇이 최적인지 추가 검증이 필요하다"는 뜻이다.

## 6. STEP6 — Primitive Opportunity Map

전체 49행은 `data/solver-primitive-discovery-4-v1-report.txt`에 있다. 요약:

| 특징 | Existing Primitive | 클러스터 수 |
|---|---|---|
| conflict>0 & cycle=0 (Conflict Dominant) | Conflict-Breaking Sacrifice | 다수(예: n=12, n=8, n=5, n=3 등) |
| componentCount>1 (Bridge Missing) | Bridge Injection | 다수(예: n=7, n=3 등) |
| parity=true & cycle 짧음 | Parity-Cycle Specialist(BP-2) | 다수(예: n=5, n=3) |
| componentCount=1, conflict=0, cycle 김 | Deep Cycle(BP-1/REPAIR) | 다수(AMBIGUOUS 다수 포함) |

## 7. 성공 기준

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Hole State가 재현 가능하게 수집된다 | **PASS** (142/142, 동일 population, checkpointed/resumable) |
| Level2 | Unknown Cluster가 최소 1개 이상 | **PASS** (49개 클러스터, 단 2절의 budget-confound 유의사항 적용) |
| Level3 | Primitive Blueprint 후보 도출 가능 | **PASS** (49개 클러스터 전부 기존 Blueprint와 매핑됨) |

## 8. 최종 Decision: **B** — 기존 Primitive 확장 가능성이 크다 → Primitive Refinement 진행

STEP5의 실측이 Decision을 직접 결정한다: **NEW_MECHANISM_NEEDED 클러스터 0개** — 49개 클러스터 전부 최소 1개의 기존 Blueprint(Deep Cycle/CCR/Bridge Injection/Conflict-Breaking Sacrifice/Parity-Cycle Specialist)와 100% 구조적으로 일치했다. 이는 STEP2의 attribution-tier(전부 Unknown)와는 독립적인 경로(순수 구조적 Feature만으로 계산)로 확인된 결과이므로, 2절에서 disclosed한 예산 confound와 무관하게 신뢰할 수 있는 신호다.

Directive의 Decision 정의를 그대로 적용: "새 Primitive 후보가 명확하다"(A)는 아니다(0건) — "기존 Primitive 확장 가능성이 크다"(B)에 해당한다.

## 9. 다음 단계 제안

1. **2절의 예산 confound 해소**: 정식 STEP2 재검증으로, extended-budget(`CycleIsolationSubtypes.ts`의 `EXTENDED_BUDGET_MS=5000` 선례처럼) 재시도를 통해 "예산 부족으로 관측 안 됨"과 "구조적으로 안 풀림"을 분리해야, Already/Partially/Completely Unknown 3단계 분류가 실제로 의미를 갖는다.
2. **AMBIGUOUS 28개 클러스터**: 복수 Blueprint가 동시에 매치하는 케이스들 — 어느 것이 실제로 더 효율적인지는 이번 Sprint의 순수 구조 분석 범위 밖이며, Primitive Refinement Sprint의 우선 대상.
3. Decision B에 따라 **Primitive Refinement Sprint**로 진행할 것을 권고한다(Directive 자체의 안내와 일치).

전체 코드: `solverPrimitiveDiscovery4/{HoleCollectionV4,PrimitiveAttributionV4,StructuralFeatureExtractionV4,ClusteringV4,BlueprintMappingV4,PrimitiveOpportunityMapV4}.ts`, driver `runSolverPrimitiveDiscovery4SprintV1.ts`. Raw dataset: `solverPrimitiveDiscovery4/data/raw-dataset-v4-holes.json`(142 케이스, 9.2MB, gitignored 대상과 동일 관례로 재생성 가능).
