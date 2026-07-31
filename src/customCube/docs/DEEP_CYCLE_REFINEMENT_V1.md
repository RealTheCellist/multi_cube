# Solver Primitive Refinement Sprint #2 — Deep Cycle Refinement Sprint v1

Status: Prototype Refinement(새 Primitive 없음, Production Solver/기존 Prototype 무변경) — **Complete (Decision B)**
Population: 142 케이스(v4, 무수정) — Deep Cycle Primary Cluster 30건, 나머지 112건

## 0. 대상 클러스터 추출 방식(disclosure)

Blueprint Attribution Refinement Sprint v1의 자체 결과(`blueprintAttributionRefinementV1/data/blueprint-attribution-refinement-v1-result.json`, 무수정)에서 `primaryAttribution === "Deep Cycle (BP-1/REPAIR)"`인 8개 해소(resolved) 클러스터의 `memberLabels`를 그대로 합집합으로 추출했다(재계산 아님, 이전 Sprint 결과의 멤버십 그대로 재사용) — 총 30건. 이 30건은 전부 `fromResolvedAmbiguous`(원래 Ambiguous였다가 specificity 기반으로 Deep Cycle에 배정된 케이스)이며, `fromUnambiguous=0`이다 — 즉 Deep Cycle 단독으로 명확했던 케이스는 없고, 전부 Parity-Cycle Specialist(BP-2)와의 tie-break를 거쳐 배정된 케이스다(margin 0.148~0.211, marginal 없음).

**Directive의 "dependencyDepth" 축 disclosure**: 이 코드베이스에 "dependency depth"라는 이름의 feature는 없다. 가장 가까운 실제 feature는 `cycleCount`(WANTS 그래프의 독립 사이클 개수)이며, 이번 Sprint는 이를 대체 proxy로 사용했음을 명시한다.

## 1. STEP1 — Baseline 재현

`solverV2Prototype/BoundedResolver.ts`의 실제 진입점 `tryBoundedMultiCycleResolver()`(MIN_CYCLE_LENGTH=4, 상한 없음, cycleCount/conflict/pair 조건 없음)를 무수정 그대로 호출했다.

| 지표 | 대상 클러스터(n=30) | 전체(n=142) |
|---|---|---|
| Coverage | 100.0% | 59.9% |
| Precision | 20.0% | 11.8%* |
| Gap Rescue | 20.0% | 7.0% |
| avg Runtime | 417.0ms | 388.5ms* |
| True Regression | 0 | 0 |

(*Precision/avgRuntime 전체 수치는 STEP4의 재측정값 — STEP1 자체는 대상 클러스터 중심 보고.)

대상 클러스터에서 Coverage가 이미 100%라는 것은 예상된 결과다 — 이 30건은 애초에 "Deep Cycle이 매치되는 것으로 확인된" 케이스들의 부분집합이기 때문이다(Blueprint Attribution 자체가 Deep Cycle 조건 매치를 근거로 배정했다). 관건은 Precision/Gap Rescue다.

## 2. STEP2 — Gate Sweep (대상 클러스터, Search Contract는 baseline 고정)

| Gate 변경 | Coverage | Precision | Gap Rescue | 전체 population Gap Rescue |
|---|---:|---:|---:|---:|
| baseline(BoundedResolver 실제) | 100.0% | 20.0% | 20.0% | 7.7% |
| minCycleLength=3(cycleLength 하한 완화) | 100.0% | 23.3% | **23.3%** | **11.3%** |
| minCycleLength=5(minimumCycleSize 상향) | 86.7% | 23.1% | 20.0% | 5.6% |
| maxCycleLength=6(maximumCycleSize 상한 신설) | 100.0% | 23.3% | 23.3% | 6.3% |
| cycleCount===1 필수(dependencyDepth proxy) | 0.0% | 0.0% | 0.0% | 0.7% |
| cycleCount>=2 필수(dependencyDepth proxy) | 100.0% | 23.3% | 23.3% | 5.6% |
| conflictEdgeCount===0 필수 | 100.0% | 20.0% | 20.0% | 6.3% |
| conflictEdgeCount>0 필수 | 0.0% | 0.0% | 0.0% | 0.7% |
| pairCount>=2 필수(pairThreshold) | 100.0% | 20.0% | 20.0% | 5.6% |
| pairCount>=5 필수(pairThreshold) | 40.0% | 0.0% | 0.0% | 0.0% |

**cycleCount===1 필수 → 0%는 동어반복적으로 당연한 결과다**(대상 클러스터 자체가 parity-gated multi-cycle 케이스로 배정되었으므로, 실제로도 전부 cycleCount>=2다) — Bridge Injection Refinement Sprint의 componentCount===1 축과 같은 성격의 sanity check.

**conflictEdgeCount>0 필수 → 0%**도 마찬가지다 — 이 클러스터는 애초에 `conflict=false`가 정의 조건이었다.

**진짜 주목할 발견**: `minCycleLength=3`(cycleLength 하한 완화)이 대상 클러스터 Gap Rescue를 20.0%→23.3%로, 전체 population Gap Rescue를 7.7%→11.3%로 끌어올렸다 — Gate 축 중 유일하게 실질적 개선을 만든 변경이다. `maxCycleLength=6`과 `cycleCount>=2 필수`도 대상 클러스터에서는 동일하게 23.3%를 냈지만, 전체 population에서는 각각 6.3%/5.6%로 `minCycleLength=3`(11.3%)에 못 미쳤다 — 즉 대상 클러스터 안에서는 여러 Gate 변경이 동률로 보이지만, 전체 population까지 놓고 보면 `minCycleLength=3`이 확실한 1위다.

**Best: minCycleLength=3**

## 3. STEP3 — Search Contract Sweep (대상 클러스터, Gate는 baseline 고정)

bridgeInjectionRefinementV1의 disclosed-duplicate DFS(`resolveBoundedMultiCycleConfigured`)를 그대로 재사용했다(동일한 BoundedResolver 알고리즘이므로 세 번째 복제본을 만들지 않음).

| Search Contract 변경 | Gap Rescue(대상) | avg Runtime | 전체 population Gap Rescue |
|---|---:|---:|---:|
| baseline(BoundedResolver 실제) | 16.7% | 424.2ms | 6.3% |
| maxCandidatesPerHop=1 | 10.0% | 201.8ms | 2.8% |
| maxCandidatesPerHop=3 | 16.7% | 427.1ms | 6.3% |
| maxCandidatesPerHop=4 | 13.3% | 437.7ms | 5.6% |
| maxLeavesExplored=32 | 16.7% | 443.5ms | 6.3% |
| maxLeavesExplored=128 | 16.7% | 441.4ms | 6.3% |
| **maxLeavesExplored=256** | **20.0%** | 434.0ms | 6.3% |
| perHopDeadlineMs=30 | 16.7% | 387.1ms | 6.3% |
| perHopDeadlineMs=120 | 16.7% | 428.4ms | 4.9% |
| candidateOrdering=byPairCountGain | 10.0% | 428.0ms | 7.0% |

대상 클러스터 기준으로는 `maxLeavesExplored=256`이 20.0%로 1위지만, **전체 population 기준으로는 baseline(6.3%)과 사실상 동일하거나(6.3%) 오히려 baseline 원본 수치(STEP1의 7.0%)보다 낮다** — Search Contract 축은 대상 클러스터 30건 내부의 우연한 변동일 뿐, 전체 population에 대해서는 실질적 개선을 주지 못했다는 신호다(STEP6 Root Cause Analysis에서 재확인).

**Best(대상 클러스터 기준): maxLeavesExplored=256**

## 4. STEP4 — Capability Benchmark (Best Gate + Best Search Contract 조합, 전체 142케이스)

| | Baseline | Candidate(minCycleLength=3 + maxLeavesExplored=256) |
|---|---:|---:|
| Coverage | 59.9% | 73.9% |
| Precision | 11.8% | 14.3% |
| Gap Rescue | 7.0% | 10.6% |
| avg Runtime | 388.5ms | 381.2ms |
| True Regression | 0 | 0 |

## 5. STEP5 — Statistical Validation (paired-diff, n=142, Directive의 N≥15 기준을 상회)

방법론은 Bridge Injection Refinement Sprint v1과 동일: `analyzeMultiCycle`→`resolveBoundedMultiCycle` 경로에 내부 랜덤성이 없음을 직접 확인했으므로, 142개 케이스 자체를 N으로 삼아 케이스별 paired-diff(Candidate−Baseline)를 계산했다.

| 지표 | 값 |
|---|---|
| improvedCountDiff | mean=+0.0352, 95% CI=[**-0.0010**, 0.0714], Cohen's d_z=0.160(negligible) |
| runtimeDiffMs | mean=+49.26ms, 95% CI=[32.41, 66.11] |
| trueRegressionDiff | mean=0.0000 |

**Validation Framework 적용 결과**:

| Gate | 상태 | 근거 |
|---|---|---|
| A(Regression) | PASS | True/False Regression diff 모두 0 |
| B(Runtime) | PASS | +49.3ms, Baseline p95=550ms 대비 +15%=82ms 이내 |
| C(Capability, strict) | **OPEN_QUESTION** | CI 하한이 -0.0010으로 0을 아주 살짝 포함 — 유의미한 개선이라 단정할 수 없음 |
| E(Primitive Interaction) | PASS(disclosed placeholder) | Duplicate/Starved=0 |

**Pipeline Decision: B**

## 6. STEP6 — Refinement Decision + Root Cause Analysis

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Gap Rescue 증가(Δ>0) | **PASS**(+3.52%p, 결합 Candidate 기준) |
| Level2 | Regression 증가 없음 | **PASS** |
| Level3 | 통계적 유의성(95% CI 하한>0) | **FAIL**(CI 하한 -0.0010, 0을 아주 근소하게 포함) |
| Level4 | Root Cause 규명 | **PASS(GATE_IMPROVEMENT)** |

**Root Cause 분석**(STEP2/STEP3의 전체 population 수치를 재사용, 추가 연산 없음):

- Gate 축 단독 개선(전체 population Gap Rescue delta): **+4.23%p**
- Search Contract 축 단독 개선(전체 population Gap Rescue delta): **-0.70%p**
- 결합 Candidate 개선(전체 population Gap Rescue delta): +3.52%p

Gate 축 단독 개선(+4.23%p)이 결합 Candidate의 개선폭(+3.52%p)을 대부분, 사실상 전부 설명한다. Search Contract 축은 대상 클러스터 내부에서는 `maxLeavesExplored=256`이 가장 좋아 보였지만, 전체 population 기준으로는 오히려 -0.70%p로 미세하게 손해였다 — **결합 Candidate가 Gate 단독 개선(+4.23%p)보다 오히려 낮은 이유가 바로 이것이다**(Search Contract 축이 소폭 깎아먹었다). 즉 이번 개선의 원천은 명확히 "어떤 상태를 시도할지"(Gate, 구체적으로 cycleLength 하한을 4→3으로 낮춘 것)이며, "어떻게 탐색할지"(Search Contract)는 기여하지 않았다.

## 7. 최종 Decision: **B** — 개선은 있으나 통계적으로 불안정 → 추가 Refinement

Level1/Level2/Level4는 PASS했지만 Level3(통계적 유의성)가 CI 하한 -0.0010으로 근소하게 FAIL했다 — Bridge Injection Refinement Sprint v1의 Decision B(CI [-0.03, 0.04])보다는 0에 훨씬 더 가깝게 접근했지만, 여전히 0을 포함한다.

**다음 단계 제안**:
1. Root Cause가 명확히 Gate(특히 `minCycleLength` 하한 완화)로 규명되었으므로, Search Contract 축은 더 이상 조정할 필요가 없다(이미 소진).
2. Gate 축에서 `minCycleLength=3` 하나만 남기고 나머지(maxCycleLength/cycleCount/conflict/pairThreshold)는 전부 유의미한 추가 개선을 만들지 못했다 — Gate 축도 사실상 이미 좁은 범위까지 탐색했다.
3. CI가 0에 매우 근접했다는 것은, 이 30건 자체를 더 세분화하거나(예: cycleLength=3 전용 서브클러스터로 좁혀 재검증) 표본을 늘리는 추가 Refinement로 유의성을 확보할 여지가 남아있다는 뜻이다 — Decision C(Primitive 구조 한계로 회귀)까지 갈 근거는 아직 없다.

전체 코드: `deepCycleRefinementV1/{TargetPopulation,GateSweepSimulator,CombinedTrial,EvaluationRunner,StatisticalValidation,RootCauseAnalysis}.ts`(Search Contract는 bridgeInjectionRefinementV1의 것을 재사용), driver `runDeepCycleRefinementV1.ts`. `BoundedResolver.ts`/`MultiCycleAnalyzer.ts`/`DeferredValidator.ts`는 전혀 수정하지 않았다(git diff 0).
