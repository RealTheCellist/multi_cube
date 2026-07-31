# Solver Primitive Discovery Sprint #4 — Blueprint Attribution Refinement Sprint v1

Status: Attribution Refinement(새 Primitive 설계 없음, Production Solver/Discovery Sprint #4 결과 무변경) — **Complete (Decision A)**
Population: 142 케이스(Discovery Sprint #4의 49개 클러스터 재사용, 재측정 없음)

## 0. 배경

Discovery Sprint #4는 49개 구조적 클러스터 중 28개가 2개 이상의 기존 Blueprint(Deep Cycle/CCR/Bridge Injection/Conflict-Breaking Sacrifice/Parity-Cycle Specialist)와 동시에 100% 일치하는 "AMBIGUOUS"로 남겼다. 이 상태로 Primitive Refinement를 시작하면 어느 Blueprint가 실제 원인인지 모른 채 작업하게 된다. 이번 Sprint는 새 Primitive를 만들지 않고, 이 28개 클러스터를 각각 하나의 Primary Blueprint로 귀속시킨다.

## 1. STEP1 — Ambiguous Cluster 추출

Discovery Sprint #4의 `solver-primitive-discovery-4-v1-result.json`(무수정, 재측정 없음)에서 `verdict==="AMBIGUOUS"`인 클러스터만 추출했다: **28개 클러스터, 74건**.

## 2. STEP2 — Blueprint별 Global Specificity

같은 142-population에 대해 6개 Blueprint 각각의 전체 population 대비 매치율(specificity = 1 - matchRate)을 계산했다:

| Blueprint | Global Match Rate | Specificity | 조건 수 |
|---|---:|---:|---:|
| CCR | 10.6% | **0.894** | 4 |
| Multi-Hop Bridge | 3.5% | 0.965 | 3 |
| Conflict-Breaking Sacrifice | 20.4% | 0.796 | 2 |
| Deep Cycle (BP-1/REPAIR) | 31.7% | 0.683 | 4 |
| Bridge Injection | 35.9% | 0.641 | 1 |
| Parity-Cycle Specialist (BP-2) | 50.7% | **0.493** | 2 |

Gate별 ablation(제거) 실험으로 어떤 조건이 각 Blueprint를 실제로 좁히는지도 확인했다. 예: Bridge Injection은 조건이 `disconnectedGraph` 단 하나뿐이라 그 조건을 제거하면 매치율이 35.9%→100%로 폭증(restrictiveness=0.641) — 이 Blueprint의 전체 설명력이 이 하나의 게이트에 완전히 의존한다는 뜻이다.

## 3. STEP3 — Counterfactual Attribution

각 AMBIGUOUS 클러스터에서 동시에 매치되는 Blueprint들 중, **전체 population에서 더 희귀하게(specificity가 더 높게) 매치되는 쪽**을 Primary Attribution으로 선택했다(Occam's razor: 더 제한적인 조건을 만족하는 것이 우연한 overlap일 가능성이 낮다). 상위 2개의 specificity 차이가 0.05 미만이면 "marginal"로 별도 표시하도록 설계했다.

**결과: 28/28 전부 해소, marginal 0건.** 모든 케이스에서 상위 2개 후보의 specificity 차이가 0.148~0.211로 충분히 커서 확신 있게 판정됐다.

**중요한 주의점(정직 disclosure)**: 이 28개 AMBIGUOUS 클러스터 안에서 Parity-Cycle Specialist(BP-2)는 **단 한 번도 Primary Attribution으로 선택되지 않았다** — 그 Blueprint의 precondition(parity && cycleCount>0)이 6개 중 가장 느슨해서(specificity=0.493, 최저) 항상 다른 후보에게 밀렸기 때문이다. 이는 "Parity가 실제로는 원인이 아니다"를 증명하는 것이 아니라, specificity 기반 tie-break 방법론 자체의 구조적 경향이다 — 더 좁은 Blueprint를 우선하는 이 방식은 합리적인 기본값이지만 절대적 증명은 아니라는 점을 명시한다.

## 4. STEP4 — Overlap Matrix

전체 28행은 `data/blueprint-attribution-refinement-v1-report.txt`에 있다. 형식: `Cluster × [6개 Blueprint 0/1] × Primary Attribution`.

## 5. STEP5 — Blueprint Priority

기존 21개 확정 클러스터(Discovery Sprint #4에서 이미 VARIANT_OF_EXISTING)와 이번에 해소한 28개를 합산한 전체 142케이스 기준 우선순위:

| Blueprint | 총 케이스 | 기존 확정 | 이번에 해소 | 클러스터 수 |
|---|---:|---:|---:|---:|
| **Bridge Injection** | **50** | 22 | 28 | 25 |
| Deep Cycle (BP-1/REPAIR) | 30 | 0 | 30 | 8 |
| Conflict-Breaking Sacrifice | 29 | 28 | 1 | 5 |
| CCR | 15 | 0 | 15 | 3 |
| Parity-Cycle Specialist (BP-2) | 13 | 13 | 0 | 6 |
| Multi-Hop Bridge | 5 | 5 | 0 | 2 |

## 6. STEP6 — Primitive Refinement Opportunity Map

| Blueprint | Target Cluster | Expected Gain | Priority |
|---|---|---:|---:|
| Bridge Injection | 25개 클러스터 | 50 | 1 |
| Deep Cycle (BP-1/REPAIR) | 8개 클러스터 | 30 | 2 |
| Conflict-Breaking Sacrifice | 5개 클러스터 | 29 | 3 |
| CCR | 3개 클러스터 | 15 | 4 |
| Parity-Cycle Specialist (BP-2) | 6개 클러스터 | 13 | 5 |
| Multi-Hop Bridge | 2개 클러스터 | 5 | 6 |

**Bridge Injection이 가장 큰 기회(50케이스, 전체의 35%)로 확정됐다** — Discovery Sprint #4 시점에는 이 중 절반 이상(28케이스)이 Parity-Cycle Specialist와의 모호함 때문에 확정되지 못했던 케이스다.

## 7. 성공 기준

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | 28개 Cluster 전부 Attribution 완료 | **PASS** (28/28) |
| Level2 | Blueprint 우선순위 확정 | **PASS** |
| Level3 | 다음 Primitive Refinement 대상 확정 | **PASS** |

## 8. 최종 Decision: **A** — Primary Blueprint가 명확 → Primitive Refinement Sprint 진행

28/28 클러스터가 marginal 없이(확신도 100%) 단일 Primary Blueprint로 귀속됐다. Directive의 Decision A 기준(Primary Blueprint 명확)을 충족한다.

## 9. 다음 단계 제안

**Primitive Refinement Sprint**를 Bridge Injection부터 시작할 것을 권고한다(Priority 1, 50케이스/142 = 35%). Deep Cycle(30케이스)과 Conflict-Breaking Sacrifice(29케이스)가 근소한 차이로 2·3순위다.

6절의 specificity-편향 주의점 때문에, Parity-Cycle Specialist가 실제로 이 28개 케이스 중 일부의 진짜 원인일 가능성을 완전히 배제할 수는 없다 — Primitive Refinement 착수 시 Bridge Injection을 먼저 확장 시도하되, 예상만큼 개선되지 않는 잔여 케이스가 있다면 Parity-Cycle Specialist 쪽 재검토를 후속 조치로 남긴다.

전체 코드: `blueprintAttributionRefinementV1/{AmbiguousClusterExtraction,BlueprintGateDefinitions,GlobalSpecificityAnalysis,CounterfactualAttribution,OverlapMatrix,BlueprintPriority,PrimitiveRefinementOpportunityMap}.ts`, driver `runBlueprintAttributionRefinementV1.ts`. Discovery Sprint #4의 결과 JSON과 raw dataset은 무수정 재사용했다.
