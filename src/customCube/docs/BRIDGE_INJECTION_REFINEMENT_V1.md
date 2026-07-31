# Solver Primitive Refinement Sprint #1 — Bridge Injection Refinement Sprint v1

Status: Prototype Refinement(새 Primitive 없음, Production Solver/기존 Prototype 무변경) — **Complete (Decision B)**
Population: 142 케이스(v4, 무수정) — Bridge Injection 대상 클러스터 51건(disconnectedGraph=true), 나머지 91건

## 0. 배경 및 용어 정정(정직 disclosure)

**시작 전에 반드시 짚어야 할 것**: Discovery Sprint #4가 정의한 "Bridge Injection" Blueprint의 조건은 `disconnectedGraph`(componentCount>1) 하나뿐이었다. 그런데 이 연구 이력 전체에서 실제로 구현된 코드는 `solverPrimitivePrototype/MultiHopBridgePrototype.ts` — analyzeMultiCycle이 찾은 사이클(2~3칸)을 푸는 메커니즘뿐이며, **"분리된 두 컴포넌트를 조각 하나를 희생해 연결한다"는 원래 개념의 코드는 이 연구 이력 어디에도 만들어진 적이 없다.** (`mechanismAnalysis/PrimitiveOpportunityMap.ts`도 "유사한 아이디어"라고만 인용했지 동일하다고 하지 않았다.) 따라서 이번 Sprint가 실제로 검증한 것은: "기존 Multi-Hop Bridge 메커니즘을 disconnectedGraph=true 케이스에도 그대로 적용했을 때 얼마나 통하는가"이다 — 새 교차-컴포넌트 메커니즘을 만들지 않았다(Directive 지침대로).

## 1. STEP1 — Baseline 재현

`MultiHopBridgePrototype.ts`(min=2,max=3)+`BoundedResolver.ts`(MAX_CANDIDATES_PER_HOP=2, MAX_LEAVES_EXPLORED=64, PER_HOP_DEADLINE_MS=60)를 무수정 그대로 호출했다.

| 지표 | 대상 클러스터(n=51) | 전체(n=142) |
|---|---|---|
| Coverage | 29.4% | 19.7% |
| Precision | 13.3% | 21.4% |
| Gap Rescue | 3.9% | 4.2% |
| avg Runtime | 231.2ms | 205.8ms |
| True Regression | 0 | 0 |

## 2. STEP2 — Gate Sweep (대상 클러스터, Search Contract는 baseline 고정)

| Gate 변경 | Coverage | Precision | Gap Rescue |
|---|---:|---:|---:|
| baseline(v2 실제) | 29.4% | 13.3% | 3.9% |
| maxCycleLength=4 | 54.9% | 7.1% | 3.9% |
| **maxCycleLength=5** | **84.3%** | 11.6% | **9.8%** |
| maxCycleLength=6 | 98.0% | 10.0% | 9.8% |
| componentCount===1 필수 | 0.0% | 0.0% | 0.0% |
| conflictEdgeCount===0 필수 | 23.5% | 16.7% | 3.9% |
| conflictEdgeCount>0 필수(V3식) | 5.9% | 0.0% | 0.0% |

**componentCount===1 필수 → 0%는 동어반복적으로 당연한 결과다**(대상 클러스터 자체가 componentCount>1이므로) — 새로운 발견이 아니라 실험 설계가 의도대로 작동함을 보여주는 sanity check일 뿐이다.

**진짜 주목할 발견**: cycleLength 상한을 5로 넓히면 Coverage가 84.3%까지 뛰지만 Gap Rescue는 3.9%→9.8%로만(절대 5.9%p) 개선된다. Precision은 오히려 13.3%→11.6%로 떨어진다 — 시도 횟수는 3배 가까이 늘었는데 실제 성공은 비례해서 늘지 않았다는 뜻이다. 이는 `MultiHopBridgePrototype.ts` 자신의 파일 헤더 주석이 이미 경고한 바로 그 문제와 정확히 같다: "cycleLength>=4는 BP-1(Deep Cycle/REPAIR)의 영역이라, 거기서의 성공은 새 Coverage가 아니라 이미 Production에 있는 BP-1을 다시 굴리는 것뿐"이라는 이 Sprint의 v2 자신의 과거 발견을 이번 실측이 다시 확인시켜준 것이다.

## 3. STEP3 — Search Contract Sweep (대상 클러스터, Gate는 baseline 고정)

| Search Contract 변경 | Gap Rescue | avg Runtime |
|---|---:|---:|
| baseline(BoundedResolver 실제) | 3.9% | 222.9ms |
| maxCandidatesPerHop=1/3/4 | 3.9%(전부 동일) | 154.9/270.7/290.2ms |
| maxLeavesExplored=32/128/256 | 3.9%(전부 동일) | 205.3/203.2/212.5ms |
| perHopDeadlineMs=30/120 | 3.9%(전부 동일) | 212.3/248.5ms |
| candidateOrdering=byPairCountGain | 3.9%(동일) | 223.1ms |

**핵심 발견: Search Contract의 어떤 축도 Gap Rescue를 전혀 바꾸지 못했다.** 성공/실패는 탐색의 폭이나 순서가 아니라 전적으로 Gate(어떤 상태를 시도할지)에 의해 결정된다는 뜻이다. 유일하게 유의미했던 변화는 `maxCandidatesPerHop=1`(분기 축소)이 **동일한 결과를 더 빠르게**(222.9ms→154.9ms) 낸다는 순수 효율성 이득이었다.

## 4. STEP4 — Capability Benchmark (Best Gate + Best Search Contract 조합, 전체 142케이스)

| | Baseline | Candidate(maxCycleLength=5 + maxCandidatesPerHop=1) |
|---|---:|---:|
| Coverage | 19.7% | 56.3% |
| Precision | 21.4% | 8.8% |
| Gap Rescue | 4.2% | 4.9% |
| avg Runtime | 205.8ms | 134.6ms |
| True Regression | 0 | 0 |

## 5. STEP5 — Statistical Validation (paired-diff, n=142)

**방법론 disclosure**: 이 메커니즘(analyzeMultiCycle+resolveBoundedMultiCycle 호출 경로)에는 내부 랜덤성이 전혀 없다 — `enumerateWingCandidates`/`bfsMoveWingToPosition` 코드를 직접 확인해 shuffle()/Math.random() 호출이 이 경로에 없음을 확인했다. 따라서 반복 시행(N repeats)은 가짜 분산만 만들 뿐 실제 정보를 주지 않는다 — 이번 Sprint는 **142개 케이스 자체를 N으로 삼아 케이스별 paired-diff**(Candidate−Baseline)를 계산했다.

| 지표 | 값 |
|---|---|
| improvedCountDiff | mean=+0.0070, 95% CI=[-0.0296, 0.0437], Cohen's d_z=0.032(negligible) |
| runtimeDiffMs | mean=+35.08ms, 95% CI=[16.57, 53.59] |
| trueRegressionDiff | mean=0.0000 |

**Validation Framework(solverPostReleaseValidationFramework/, 무수정, Category C/New Primitive/prototype-stage) 적용**:

| Gate | 상태 | 근거 |
|---|---|---|
| A(Regression) | PASS | True/False Regression diff 모두 0 |
| B(Runtime) | PASS | +35.1ms, Baseline p95=411ms 대비 +15%=62ms 이내 |
| C(Capability, strict) | **OPEN_QUESTION** | CI가 0을 포함(하한 -0.03) — 유의미한 개선 아님 |
| E(Primitive Interaction) | PASS(disclosed placeholder — 아직 Recovery 레이어에 통합된 적 없어 실제 상호작용 데이터 없음) | Duplicate/Starved=0 |

**Pipeline Decision: B** — 필수 Gate에 FAIL은 없으나 Gate C가 OPEN_QUESTION.

## 6. STEP6 — Refinement Decision

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Capability 증가(improvedCountDiff mean>0) | **PASS**(+0.0070) |
| Level2 | Regression 증가 없음 | **PASS** |
| Level3 | 통계적으로 유의한 개선(CI 하한>0) | **FAIL**(CI가 0 포함) |

## 7. 최종 Decision: **B** — 개선은 있으나 불안정 → 추가 Refinement

Directive의 정의 그대로: Capability가 (아주 조금) 늘었고 Regression은 없지만, 통계적으로 유의미하다고 말할 수는 없다.

**추가 Refinement가 겨냥해야 할 것에 대한 진단**: 이번 Sprint는 Gate 축(cycleLength/componentCount/conflict)과 Search Contract 축(분기/리프/데드라인/순서) 전부를 독립적으로 스윕했다. 그 결과:
- Search Contract 쪽은 이미 소진됐다 — 어떤 축도 Gap Rescue에 영향이 없었다.
- Gate 쪽에서 유일하게 Coverage를 늘린 것(cycleLength 확장)은 대부분 BP-1(Deep Cycle)의 영역과 겹치는 재시도였지, 진짜 새로운 영역을 여는 것이 아니었다.
- componentCount===1 제약은 애초에 대상 클러스터를 전부 배제하므로 의미가 없었다(동어반복 확인).

즉 **현재 존재하는 Multi-Hop Bridge 메커니즘 자체의 Gate/Search Contract를 더 조정하는 것으로는 이 51건(disconnectedGraph=true)의 근본적인 개선 여지가 크지 않아 보인다.** 다음 단계로는 (a) 이 결과를 그대로 인정하고 Priority 2인 Deep Cycle 계열로 우선순위를 옮기거나, (b) 원래 "Bridge Injection" 개념(두 컴포넌트를 조각 희생으로 연결)을 실제로 구현하는 것 — 단, (b)는 새 Primitive를 만드는 것이라 이번 Sprint의 범위 밖이며 별도의 Discovery/Blueprint 단계가 필요하다.

전체 코드: `bridgeInjectionRefinementV1/{TargetPopulation,GateSweepSimulator,SearchContractSweepSimulator,CombinedTrial,EvaluationRunner,StatisticalValidation}.ts`, driver `runBridgeInjectionRefinementV1.ts`. `MultiHopBridgePrototype.ts`/`BoundedResolver.ts`/`MultiCycleAnalyzer.ts`는 전혀 수정하지 않았다(git diff 0).
