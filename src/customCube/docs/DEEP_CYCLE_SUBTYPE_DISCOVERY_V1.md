# Deep Cycle Subtype Discovery Sprint v1

(사용자 자신의 지시서 제목: "Solver Primitive Discovery Sprint #4 — Deep Cycle Subtype Discovery Sprint v1")

Status: Discovery(Read-only 구조/행동 분석, 새 Primitive 없음, BoundedResolver.ts 무변경) — **Complete (FAIL, Decision B)**
Population: Deep Cycle Primary Cluster 30건(Blueprint Attribution Refinement Sprint v1의 자체 해소 결과, 무수정 재사용)

## 0. 이름 충돌 disclosure

사용자 지시서는 이번 Sprint를 "Solver Primitive Discovery Sprint **#4**"라 명명했지만, 이 연구 아크에는 이미 동일 번호("#4")로 불린 **State Taxonomy Sprint v1**(`solverPrimitiveDiscovery4/`, 142케이스 전체 Hole Dataset을 대상으로 한 훨씬 더 넓은 범위의, 이미 완료된 별개 Sprint)이 존재한다. 혼동을 피하기 위해 이번 Sprint의 코드/디렉토리는 `deepCycleSubtypeDiscoveryV1/`이라는 별도 이름을 사용했다(사용자 지시서 자신의 제목은 문서 상단에 그대로 보존).

## 1. 질문

Deep Cycle Refinement Sprint v1이 확정한 30건("Deep Cycle Primary Cluster")을 **하나의 동질적 메커니즘**으로 보는 것이 맞는가, 아니면 실제로는 구조적으로도 행동적으로도 서로 다른 **2개 이상의 Subtype**이 섞여 있는가?

## 2. STEP1 — Extended Feature Extraction

기존 `StructuralFeatureExtractionV4`의 cycleCount(dependencyDepth proxy)/cycleLength/pairCount/conflictEdgeCount/parityState를 무수정 재사용하고, 실제 WANTS 그래프(`buildStateGraph`, 무수정) 위에서 표준 Tarjan 알고리즘으로 새로 계산한 6개 축을 추가했다: articulationPointCount/biconnectedComponentCount/cycleOverlap/cycleDensity/conflictAdjacentToCycle/pairGraphDensity.

**disclosure**: bridgeAdjacency/shortestBridgeLength은 계산하지 않았다 — 이 30건은 정의상 전부 `bridge=false`(componentCount=1, 단일 컴포넌트)이므로 이 축들은 이 population 안에서 상수이거나 무의미하다(교차-컴포넌트 구조는 Bridge Injection의 영역이며 별도 Sprint에서 이미 다뤘다). 상수 feature를 억지로 계산해 넣는 것보다 생략하고 disclosure하는 쪽을 택했다.

## 3. STEP2 — Clustering (3가지 독립 방법)

| 방법 | 클러스터 수 | 비고 |
|---|---:|---|
| Structural Taxonomy(카테고리 버킷) | 7개 | 최대 17건짜리 클러스터 하나가 지배적 |
| Feature Similarity(정규화 거리 기반 k=2) | 2개 | 23건 vs 7건 |
| Graph Topology(articulation/biconnected/overlap만) | 4개 | 최대 24건짜리 클러스터 하나가 지배적 |

**3개 방법 모두 유의미한(n≥3) 클러스터를 2개 이상 찾았다** — 구조적으로는 이 30건이 분명히 갈린다(articulationPointCount 0~3, cycleCount 2~5+, cycleLength 짧음/김 등). Pairwise agreement: ST-FS=0.570, ST-GT=0.685, FS-GT=0.724(평균 0.660) — 세 방법이 완전히 일치하진 않지만 상당히 겹친다.

## 4. STEP3 — Behavioral Profiling

Deep Cycle Refinement Sprint v1이 이미 스윕한 10개 Gate config(무수정 재사용)에 대해, 30건 각각이 실제로 rescue되는지(개선 여부) 측정했다.

**rescuedByAny: 6/30(20.0%)** — Deep Cycle Refinement v1의 target cluster Gap Rescue(20.0~23.3%)와 일관된 수치로 교차 검증됐다. 24건은 10개 Gate config 중 **어느 것으로도 전혀 rescue되지 않았다.**

## 5. STEP4 — Subtype Stability Analysis (구조 vs 행동)

Feature Similarity k=2 클러스터(23건 vs 7건) 기준으로 각 클러스터의 rescue rate를 비교했다.

| 클러스터 | 크기 | rescuedByAnyRate |
|---|---:|---:|
| seedA | 23 | 17.4% |
| seedB | 7 | 28.6% |

Gate config별 divergence(클러스터 간 rescue rate 차이): 대부분 축에서 11.2%p, `cycleCount>=2 required`에서 가장 크게 벌어졌으나 그래도 **15.5%p**에 그쳤다 — 이번 Sprint가 정한 "의미 있는 divergence" 기준(30%p) 미달.

**핵심 발견**: 구조적으로 뚜렷이 다른 하위 그룹(articulation point 0개부터 3개까지, cycle count 2부터 5+까지)이 존재하는데도, **어느 Gate config를 적용해도 이 하위 그룹들의 rescue rate 차이는 30%p를 넘지 못한다.** 즉 구조는 갈리지만 행동(어떤 Gate가 도움이 되는지)은 사실상 갈리지 않는다 — 6건이 rescue될 때 rescue시키는 config 조합도 거의 항상 동일한 세트(baseline/minCycleLength=3/minCycleLength=5/maxCycleLength=6/cycleCount>=2/conflictEdgeCount===0/pairCount>=2)였다.

## 6. STEP5 — Subtype Decision

| 기준 | 판정 |
|---|---|
| 3개 클러스터링 방법 중 2개 이상이 유의미한(n≥3) 클러스터 2개+ 발견 | **3/3 충족** |
| Gate config 중 하나라도 클러스터 간 rescue rate 차이가 30%p 이상 | **미충족**(최대 15.5%p) |
| **PASS** | **FALSE** |

## 7. 최종 판정: **FAIL → Decision B**

30건은 구조적으로는 다양하지만(articulationPointCount/cycleCount/cycleLength가 실제로 갈린다), 그 구조적 차이가 **어떤 Gate가 이 케이스를 rescue하는지에 실질적 차이를 만들지 않는다.** 즉 이것은 서로 다른 메커니즘이 섞인 것이 아니라, 하나의 메커니즘(BoundedResolver의 DFS+Deferred Validation)이 구조가 다양한 입력들에 대해 **똑같이 잘 안 통하는** 단일한 실패 양상을 보이는 것이다.

**결론**: `BoundedResolver`(BP-1/Deep Cycle)는 이 30건에 대해 현재 수준에서 최적화 한계에 도달했다고 판단하는 것이 타당하다. Deep Cycle Refinement Sprint v1이 이미 확인한 Gate/Search Contract 축의 소진과, 이번 Sprint가 확인한 "구조 다양성이 있어도 행동은 균질하다"는 결과가 서로를 보강한다 — Gate를 더 정교하게 나누는 접근(Subtype별 Gate)은 근거가 부족하다.

**다음 단계 제안**: Deep Cycle/Bridge Injection 둘 다 Gate/Search 조정으로는 한계에 도달했다는 동일한 패턴이 확인되었으므로, 이제 두 Blueprint 모두에 대해 "기존 Primitive의 파라미터 조정"보다 상위 단계(예: Blueprint Priority 3위 이하로의 이동, 또는 30건 전부를 아예 못 푸는 24건에 대한 진짜 새로운 메커니즘의 필요성 재검토)를 사용자가 판단할 시점으로 보인다.

전체 코드: `deepCycleSubtypeDiscoveryV1/{GraphTopologyAnalysis,ExtendedFeatureExtraction,ClusteringMethods,BehavioralProfiling,SubtypeStabilityAnalysis,SubtypeDecision}.ts`, driver `runDeepCycleSubtypeDiscoveryV1.ts`. `BoundedResolver.ts`/`MultiCycleAnalyzer.ts`/`stateGraphBuilder.ts`/`constraintAnalyzer.ts`는 전혀 수정하지 않았다(git diff 0).
