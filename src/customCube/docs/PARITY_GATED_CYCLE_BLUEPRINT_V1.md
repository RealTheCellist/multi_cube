# Solver Primitive Discovery Sprint #6 — Parity-Gated Cycle Blueprint Sprint v1

Status: Analysis/Design 전용(구현 없음, 모든 기존 Primitive/Production Solver 무변경) — **Complete (Decision A)**
Population: TRULY_UNKNOWN 53건(Unresolved Mechanism Validation Sprint v1의 자체 결과, 무수정 재사용)

## 0. 방법론 disclosure

이번 Sprint는 처음부터 끝까지 `solve()` 호출이 전혀 없다 — STEP1~STEP6 전부 이미 계산된 구조 feature(무수정 재사용)와 Gate predicate 비교만 수행한다. "새 Dataset을 만들지 않는다"는 지시대로 raw-dataset-v4-holes.json(142케이스, 무수정)과 Unresolved Mechanism Validation Sprint v1의 결과 JSON(무수정)만 재사용했다.

## 1. STEP1 — Unknown Population Profiling

TRULY_UNKNOWN 53건을 그대로 재수집(라벨 매칭)하고, `StructuralFeatureExtractionV4`(무수정)+`deepCycleSubtypeDiscoveryV1/GraphTopologyAnalysis`(무수정, Deep Cycle 전용이 아니라 임의 cubies에 범용 적용 가능함을 확인 후 재사용)로 cycleCount/cycleLength/parity/articulationPoint/biconnectedComponent/conflict topology/pair graph를 전부 추출했다.

## 2. STEP2 — Structural Causality Analysis (Ablation)

| Feature | Unknown 내 coverage | 전체 142케이스 baseline | lift | ablationGap |
|---|---:|---:|---:|---:|
| **cycleCount>=2**(dependencyDepth proxy) | **96.2%** | 56.3% | **1.71** | 3.8% |
| **conflictEdgeCount===0** | **96.2%** | 68.3% | 1.41 | 3.8% |
| cycleLength>=4 | 79.2% | 59.9% | 1.32 | 20.8% |
| parityState | 64.2% | 59.2% | **1.08**(거의 baseline 수준) | 35.8% |
| articulationPointCount===0 | 54.7% | 62.0% | 0.88(오히려 낮음) | 45.3% |
| componentCount===1 | 32.1% | 64.1% | 0.50(강한 저대표) | 67.9% |
| parity AND cycleCount>=2 | 62.3% | 43.0% | 1.45 | 37.7% |

**핵심 발견(예상 밖)**: 이 population의 Taxonomy Class 이름은 "PARITY_GATED_CYCLE"이지만, 실제 ablation 분석에서 parity 단독은 lift 1.08로 baseline과 거의 차이가 없다 — parity가 원인이라고 보기엔 근거가 약하다. 대신 **cycleCount>=2**와 **conflictEdgeCount===0**이 각각 96.2% coverage(ablationGap 3.8%)로 거의 보편적이며, lift도 가장 높다 — 이 population의 진짜 공통 원인은 "parity"가 아니라 **"충돌 없는 다중(2개 이상) 사이클"**이다. componentCount는 강하게 저대표(0.50)인데, 이는 Bridge Injection 출처(componentCount>1, 36건)와 Deep Cycle 출처(componentCount=1, 17건)가 섞인 population이라는 사전 구조 때문이지 새로 발견된 패턴이 아니다.

## 3. STEP3 — Existing Primitive Projection (구조만 비교, solve() 없음)

| Primitive | 구조적으로 Gate 통과 | 주요 실패 조건 |
|---|---:|---|
| Deep Cycle(BP-1) | 17/53(32.1%) | componentCount===1 실패 36건 |
| CCR | 0/53(0.0%) | cycleCount===1 실패 **52/53건**(거의 전부 다중 사이클) |
| Multi-Hop Bridge | 0/53(0.0%) | deferredViolation 실패 43건(대부분 cycleLength>=4) |
| Bridge Injection(라벨만, 실제 코드 없음) | 36/53(67.9%) | disconnectedGraph 실패 17건 |
| Conflict-Breaking Sacrifice | 1/53(1.9%) | conflictEdgeCount>0 실패 51건 |
| Parity-Cycle Specialist(BP-2) | 33/53(62.3%) | parityState 실패 19건 |
| **Mixed Commutator** | **52/53(98.1%)** | 거의 실패 없음(Gate가 cycleCount>0뿐) |

**중요한 발견**: Mixed Commutator의 실제 Gate는 `cycleCount>0` 하나뿐이라 Unknown의 98.1%가 구조적으로 "통과"한다. 그런데 Unresolved Mechanism Validation Sprint v1의 실제 `solve()` 호출 결과는 **이 동일한 68건 Residual에서 Mixed Commutator가 0/68건을 개선**시켰다는 것이었다 — Gate는 거의 모든 것을 통과시키지만 탐색(LowFootprintCoreSearch+SetupConjugation)이 실제로는 전혀 해결하지 못한다. 즉 병목은 Gate가 아니라 탐색 메커니즘 자체다.

**또 다른 발견**: `CCRPrototype.ts`는 실제로 `strategy="multiCycle"` 옵션(모든 분리 사이클을 이어붙여 순회)을 이미 갖고 있지만, Blueprint Attribution의 CCR Gate 정의(cycleCount===1)와 Unresolved Mechanism Validation Sprint v1의 attribution 호출 모두 기본값(singleCycle)만 시험했다 — CCR 자신의 능력이 선언된 Gate보다 넓다는 것을 이번에 처음 확인했다.

## 4. STEP4 — Blueprint Candidate 3개 (미구현)

| | Candidate A | Candidate B | Candidate C |
|---|---|---|---|
| 이름 | Cross-Component Bridge Cycle Resolver | Multi-Cycle CCR Extension | Unified Parity-Gated Multi-Cycle Resolver |
| Gate | componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0 | componentCount===1 AND cycleCount>=2 AND conflictEdgeCount===0 | cycleCount>=2 AND conflictEdgeCount===0 |
| 예상 동작 | bridge setup(컴포넌트 연결) → 다중 사이클 순회 2단계 | 기존 CCR의 strategy="multiCycle" 그대로 호출 | A+B를 componentCount 분기로 통합 |
| 기존과 차이 | 진짜 새 메커니즘(이 아크에서 한 번도 구현된 적 없음) | 사실상 차이 없음 — 기존 CCR의 미시험 옵션일 뿐 | A의 상위집합, 분기 복잡도 추가 |

## 5. STEP5 — Blueprint Evaluation (정량 비교표)

| Candidate | 설명 가능한 Unknown 비율 | 중복도(전체) | 중복도(Mixed Commutator 제외) | 구현 복잡도 | Production Risk |
|---|---:|---:|---:|---|---|
| **A** | **34/53(64.2%)** | 100.0%* | **47.1%** | HIGH | MEDIUM |
| B | 17/53(32.1%) | 100.0%* | 100.0% | LOW | LOW |
| C | 51/53(96.2%) | 100.0%* | 64.7% | HIGH | HIGH |

*중복도(전체) disclosure: Mixed Commutator의 Gate가 cycleCount>0 하나뿐이라 사실상 모든 후보가 100% "구조적으로 겹친다"고 나온다 — 하지만 위에서 확인했듯 Mixed Commutator는 이 population에서 실제로 0/68건을 해결했다(STEP3에서 이미 실제 `solve()`로 검증됨). 구조적 Gate 매치를 "기능적 중복"으로 오인하면 안 되므로, Mixed Commutator를 제외한 중복도를 별도로 계산해 Level2 판정에 사용했다(disclosed, 방법론 교체가 아니라 추가 disclosure).

Candidate A는 Mixed Commutator를 제외하면 실제 경쟁 Primitive와의 중복이 47.1%로 낮다(주로 Parity-Cycle Specialist와 일부 겹침). Candidate B는 100% 중복 — CCR과 사실상 동일하다는 뜻으로, "낮은 신규성" 평가와 일치한다.

## 6. STEP6 — Final Blueprint Selection

| Candidate | Level1(≥60%) | Level2(중복<50%) | Level3(Risk≠HIGH) | Level4(구현범위 정의) | 전체 |
|---|---|---|---|---|---|
| **A** | **PASS** | **PASS**(47.1%) | **PASS**(MEDIUM) | PASS | **ALL PASS** |
| B | FAIL(32.1%) | FAIL(100%) | PASS(LOW) | PASS | not all pass |
| C | PASS(96.2%) | FAIL(64.7%) | FAIL(HIGH) | PASS | not all pass |

**Decision: A** — Candidate A(Cross-Component Bridge Cycle Resolver)가 4개 Level을 모두 통과했다.

## 7. 결론

Candidate A(componentCount>1 AND cycleCount>=2 AND conflictEdgeCount===0을 겨냥한 Cross-Component Bridge Cycle Resolver)가 Unknown 53건의 64.2%(34건)를 설명하고, 실제 경쟁 Primitive와의 중복도 47.1%로 신규성이 충분하며, 이 아크 전체에서 한 번도 구현된 적 없는 "실제 컴포넌트 연결" 메커니즘을 정면으로 겨냥한다 — Bridge Injection Refinement Sprint v1이 처음 disclosed했던 그 공백을 채우는 진짜 새 Primitive Blueprint다.

Candidate B(17건, 32.1%)는 Blueprint로 채택되진 않았지만, CCR의 기존 `strategy="multiCycle"` 옵션을 그대로 시험해보는 것은 새 Primitive Discovery와 무관하게 즉시 실행 가능한 부수 작업으로 남아있다. Candidate C(통합안)는 복잡도·위험이 A보다 커서 기각됐다.

**다음 단계**: Decision A에 따라 **Parity-Gated Cycle Prototype Sprint v1**로 진행 — Candidate A의 2단계(bridge setup + 다중 사이클 순회) 파이프라인을 실제로 구현하고 평가하는 단계로 넘어간다.

전체 코드: `parityGatedCycleBlueprintV1/{UnknownPopulationProfiling,StructuralCausalityAnalysis,ExistingPrimitiveProjection,BlueprintCandidates,BlueprintEvaluation,FinalBlueprintSelection}.ts`, driver `runParityGatedCycleBlueprintV1.ts`. 모든 기존 Primitive(BoundedResolver/CCRPrototype/MultiHopBridgePrototype/ConflictDominantSacrificePrototype/ParityAwareResolver/AdaptiveCycleCommutatorPrototype)와 Production Solver 전부 무수정(git diff 0), `solve()` 호출 0건.
