# Solver Primitive Discovery Sprint #5 — Unresolved Mechanism Validation Sprint v1

Status: Discovery(Read-only 검증, 새 Primitive 없음) — **Complete (Decision A)**
Population: Bridge Injection Refinement v1 + Deep Cycle Refinement v1 미해결 Residual 68건(46+22)

## 0. 이름/재현성 disclosure

사용자 지시서가 예시로 든 "SETUP/DISRUPT" Primitive는 실제 코드에 독립 Gate+Search Contract를 가진 Primitive로 존재하지 않는다(생산 Recovery 스케줄러의 순서 개념일 뿐) — 대신 이 아크가 실제로 구현한 6개 real Primitive(Deep Cycle/BP-1, CCR, Multi-Hop Bridge, Conflict-Breaking Sacrifice, Parity-Cycle Specialist/BP-2, Mixed Commutator)를 attribution 대상으로 삼았다.

**재현성 참고**: STEP1의 사전 smoke test(별도 실행)에서는 Bridge Injection 47건/Deep Cycle 21건(총 68건)이었으나, 본 실행에서는 46건/22건(총 68건 동일)으로 1건이 이동했다 — 이 알고리즘들이 벽시계 400ms deadline을 사용하는 wall-clock 기반 예산이라 시스템 부하에 따라 경계선상의 케이스가 미세하게 흔들릴 수 있음을 이미 이 아크가 여러 번 disclose한 바 있다(예: `PER_HOP_DEADLINE_MS`). 총 residual 크기(68)는 동일하게 재현됐다.

## 1. STEP1 — Unresolved Hole Collection

Bridge Injection Refinement v1이 시도한 모든 config(Gate 7개+Search Contract 10개+combined-best, 총 18개)와 Deep Cycle Refinement v1이 시도한 모든 config(Gate 10개+Search Contract 10개+combined-best, 총 21개) 중 **단 하나로도 rescue되지 않은** 케이스만 재수집했다.

| 소스 | 미해결 건수 |
|---|---:|
| Bridge Injection | 46 |
| Deep Cycle | 22 |
| **합계** | **68** |

## 2. STEP2 — Existing Primitive Attribution (6개 real Primitive, 복수 Attribution 허용)

| Primitive | matched | improvedAlone |
|---|---:|---:|
| Deep Cycle(BP-1) | 0/68 | 0/68 |
| CCR | 0/68 | 0/68 |
| Multi-Hop Bridge | 0/68 | 0/68 |
| Conflict-Breaking Sacrifice | 0/68 | 0/68 |
| **Parity-Cycle Specialist(BP-2)** | **3/68** | **3/68** |
| Mixed Commutator | 0/68 | 0/68 |

이 68건은 원래 각자의 Sprint(BP-1 계열/Multi-Hop Bridge 계열)가 이미 exhaustively 스윕한 것들이므로, 그 두 Primitive가 다시 매치하지 않는 것은 예상된 결과다. 주목할 것은 **한 번도 시도되지 않았던 Parity-Cycle Specialist(BP-2)가 3건을 단독으로 개선**시켰다는 점 — 서로 다른 Blueprint의 Primitive를 교차 적용해보지 않았던 사각지대가 실제로 존재했다.

## 3. STEP3 — Counterfactual Combination (2단계 조합)

첫 Primitive가 실제로 move를 만들어낸 경우에만(즉 "setup" 역할을 할 수 있는 경우만) 두 번째 Primitive를 이어 시도했다. **anySolvedByCombo=0/68, anyImprovedByCombo=0/68** — 애초에 STEP2에서 matched된 Primitive가 3건(Parity-Cycle Specialist)뿐이라 조합을 시도할 "setup" 후보 자체가 거의 없었고(avg combosTried=0.2/case), 시도된 조합도 전혀 추가 개선을 만들지 못했다.

## 4. STEP3.5 — Budget Sensitivity Check (400ms → 3000ms, 7.5배)

STEP2+STEP3까지 미해결로 남은 65건에 대해 확장된 데드라인으로 재시도했다. **budgetHelped=12/65** — 예산을 7.5배 늘리자 DeepCycle(BP-1) 또는 ConflictBreakingSacrifice/CCR가 뒤늦게 개선을 만든 케이스가 12건 나왔다. 즉 이 12건은 메커니즘 자체는 존재하지만 400ms 예산 안에서는 탐색이 끝나지 않았던 것이다.

## 5. STEP4 — Residual Classification

| 분류 | 건수 | 비율 |
|---|---:|---:|
| EXISTING_SINGLE_PRIMITIVE | 3 | 4.4% |
| EXISTING_COMBINATION | 0 | 0.0% |
| EXISTING_ORDERING | 0 | 0.0% |
| EXISTING_BUDGET | 12 | 17.6% |
| **TRULY_UNKNOWN** | **53** | **77.9%** |

## 6. STEP5 — Common Mechanism Analysis (TRULY_UNKNOWN 53건)

| 항목 | 값 |
|---|---|
| Taxonomy Class 분포 | PARITY_GATED_CYCLE=33, CYCLE_ISOLATION=18, CONFLICT_DOMINANT=1, LOCKED_PAIR=1 |
| **Dominant Class** | **PARITY_GATED_CYCLE (62.3%)** |
| 소스 Blueprint 분포 | Bridge Injection=36, Deep Cycle=17 |
| meanCycleCount | 2.30 |
| meanCycleLength | 4.53 |
| meanConflictEdgeCount | 0.26 |
| parityShare | 64.2% |

53건 중 62.3%가 동일한 PARITY_GATED_CYCLE Taxonomy Class를 공유하고, 평균적으로 parity가 걸려 있으며(64.2%), conflict edge는 거의 없다(0.26). 이는 상당히 일관된 구조적 프로필이다 — "잡다한 실패"가 아니라 **하나의 공통된 패턴**으로 보인다.

## 7. STEP6 — Decision

| 기준 | 판정 |
|---|---|
| Level1(Residual ≥80% 분류) | **FAIL**(22.1%) |
| Level2(Unknown 집합 추출) | PASS |
| Level3(Unknown 공통 메커니즘, dominant class ≥60%) | **PASS**(62.3%) |

**Decision: A** — Residual의 22.1%만 기존 6개 Primitive(단독/조합/순서/예산)로 설명되고, 나머지 77.9%(53건)는 기존 메커니즘 무엇으로도 해결되지 않았다. 그리고 그 53건은 공통 구조(PARITY_GATED_CYCLE, parity 64.2%)를 갖는다 — "분류 불가능한 잡음"이 아니라 **일관된 미해결 메커니즘**이 존재한다는 강한 신호다.

## 8. 결론

68건의 Residual 중 4.4%는 단순히 시도되지 않았던 기존 Primitive(Parity-Cycle Specialist)로 즉시 해결 가능했고, 17.6%는 예산만 늘리면(400ms→3000ms) 기존 메커니즘으로 풀렸다. 이 둘을 합쳐도 22.1%뿐이며, 나머지 77.9%는 6개 Primitive 중 무엇을 어떤 조합·순서·예산으로 시도해도 전혀 개선되지 않았다. 이 미해결 집합은 PARITY_GATED_CYCLE 타입에 62.3% 집중되어 있어 새로운 Primitive Discovery를 정당화할 만큼 충분히 일관된 구조를 가진다.

**다음 단계**: Decision A에 따라 **Solver Primitive Discovery Sprint #6(새 Primitive Blueprint)**로 이어지는 것이 자연스럽다 — 이번 Sprint가 새 Primitive를 설계하지는 않았지만, 그 대상(53건, PARITY_GATED_CYCLE 중심, parity 64.2%/meanCycleCount 2.30/meanCycleLength 4.53)을 구체적으로 특정했다. 동시에 STEP2/3.5가 발견한 두 개의 즉시 실행 가능한 부가 개선(Parity-Cycle Specialist 교차 적용 3건, 예산 확장 12건, 합계 15건/68건=22%)은 새 Primitive 설계와 무관하게 별도로 반영할 가치가 있다.

전체 코드: `unresolvedMechanismValidationV1/{PrimitiveRegistry,UnresolvedHoleCollection,ExistingPrimitiveAttribution,CounterfactualCombination,BudgetSensitivityCheck,ResidualClassification,CommonMechanismAnalysis,UnresolvedMechanismDecision}.ts`, driver `runUnresolvedMechanismValidationV1.ts`. 6개 Primitive Prototype 파일(BoundedResolver/CCRPrototype/MultiHopBridgePrototype/ConflictDominantSacrificePrototype/ParityAwareResolver/AdaptiveCycleCommutatorPrototype) 전부 무수정(git diff 0).
