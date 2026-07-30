# Solver Validation Framework Qualification Refinement Sprint v2

Status: Framework Refinement (Decision Logic Only, Production Solver 무변경) — **Complete (Decision A)**
Population: 동일 5개 Historical Sprint (Refinement Sprint v1과 SAME 입력/수치/CI/Cohen's d, 재측정 없음)

## 0. 배경

Qualification Refinement Sprint v1은 두 가지 지정된 Rule(Tiered minN, strict Gate C)을 정확히 고쳤지만, 실제 실행 결과 Match Rate는 60%(3/5)에 그쳤다. 근본 원인을 추적한 결과 남은 원인은 정확히 하나로 수렴됐다: **Gate B(Runtime)는 설계상 PASS 또는 OPEN_QUESTION만 반환하고 절대 FAIL을 반환하지 않는데, `decideFromGates()`의 `allPass`는 "필수 Gate 전부가 문자 그대로 PASS"를 요구해 Gate B의 OPEN_QUESTION 하나만으로도 Decision A를 막았다.**

이번 Sprint는 이 하나의 원인만 고친다. Production Solver는 무변경, 수정 대상은 `solverPostReleaseValidationFramework/ValidationPipeline.ts` 하나로 끝났다(`ReleaseGates.ts`는 Gate B 자신의 PASS/OPEN_QUESTION 계산 로직 자체를 바꿀 필요가 없어 이번 Sprint에서 수정하지 않았다 — Decision 조립 단계에서만 그 상태를 다르게 소비하도록 변경).

## 1. STEP1 — Gate B 동작 분석 (원인 확정)

각 Historical Case에 대해 "Gate B가 실제로는 OPEN_QUESTION이지만, 만약 PASS였다면 Decision이 어떻게 달라졌을까"를 반사실(counterfactual)로 직접 검증했다(다른 모든 Gate/minN은 그대로 둔 채 Gate B 상태만 강제로 PASS로 바꿔 재계산).

| Sprint | Gate B 상태 | 실제 Decision | 현재(strict) Framework Decision | Gate B=PASS였다면 |
|---|---|---|---|---|
| Scheduler Prototype v1 | OPEN_QUESTION | A | B | **A** |
| Scheduler Production Integration v1 | PASS | A | A | A |
| Incremental Recovery Production Integration v1 | PASS | B | B | B |
| Mixed Commutator v1 | PASS | B | B | B |
| Mixed Commutator v2 | OPEN_QUESTION | A | B | **A** |

Refinement v1에서 남은 2건의 False FAIL(Scheduler Prototype v1, Mixed Commutator v2)은 정확히 Gate B가 OPEN_QUESTION인 케이스와 100% 일치했다. 반사실 검증(Gate B만 PASS로 바꾸면 두 경우 다 실제 Decision과 일치)으로 **Gate B가 남은 불일치의 유일한 원인임을 확정**했다.

## 2. STEP2/3 — Rule Candidate 비교

동일 5개 Historical Case에 세 Rule을 각각 적용했다(재측정 없음, 기존 published 수치만 사용).

| Rule | 설명 | Match Rate | False PASS | False FAIL |
|---|---|---|---|---|
| Option C(현행) | 모든 필수 Gate 문자 그대로 PASS 필요 | 60.0%(3/5) | 0 | 2 |
| Option A | 모든 Gate의 OPEN_QUESTION을 PASS와 동일 취급 | 60.0%(3/5) | **2** | 0 |
| **Option B** | Gate B만 예외, 다른 필수 Gate 전부 PASS면 허용 | **100.0%(5/5)** | **0** | **0** |

**Option A는 채택하지 않는다.** 이유는 예상 밖의 부작용 때문이다: Option A는 Gate C의 OPEN_QUESTION도 PASS로 취급해버려서, Refinement Sprint v1이 힘들게 고친 "Gate C 강화(strict 모드)"의 효과를 도로 무효화시킨다. 실제로 Option A 적용 시 Incremental Recovery와 Mixed Commutator v1이 다시 False PASS로 돌아왔다(Refinement v1이 정확히 잡았던 문제가 재발). 이는 손으로 예측한 게 아니라 코드를 실제로 실행해 확인한 결과다.

**Option B가 명확한 승자다**: Gate B에만 좁게 예외를 적용하므로 Gate C의 strict 로직에는 전혀 영향을 주지 않는다. Match Rate 100%(5/5), False PASS 0건, False FAIL 0건.

## 3. STEP4 — Rule Regression Audit

기존에 발표된 3개 Release Sprint의 실제 Runtime diff 수치에 `evaluateGateB()`를 그대로 적용해 Gate B 상태를 확인했다(재측정 없음).

| Sprint | 인용 Runtime diff | Gate B 상태 | 정책 변경 영향 |
|---|---|---|---|
| Scheduler Production Integration v1 | mean=0.0ms, CI=[0.0,0.0] | PASS | 없음 |
| Production Integration Finalization v1 | mean=-17.08ms, CI=[-20.55,-13.61] | PASS | 없음 |
| Release Readiness v1(Production 4-Contract 합산) | mean=1.6ms, CI=[-0.6,3.7] | PASS | 없음 |

**세 Sprint 모두 Gate B가 이미 PASS였다** — Gate B의 새 처리 방식은 "OPEN_QUESTION일 때"만 작동하므로, 애초에 이 세 Sprint에는 적용될 여지가 없다. **Regression 0건**, 확인 완료.

## 4. STEP5 — Decision Matrix

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Gate B Rule 변경이 Decision Match를 개선 | **PASS** (60.0% → 100.0%) |
| Level2 | False PASS 증가 없음 | **PASS** (0 → 0) |
| Level3 | 기존 Release Decision Regression 없음 | **PASS** (3개 Sprint 전부 Gate B가 이미 PASS라 무관) |

Decision Match Rate(Option B 채택 시) = 100.0% (기준 ≥80% 충족).

## 5. 최종 Decision: **A**

Match Rate 100%, Regression 0건, False PASS/FAIL 모두 0건 — Directive가 정의한 Decision A 기준(Match≥80%, Regression 0, False PASS 증가 없음)을 전부 충족한다.

`ValidationPipeline.ts`에 `RECOMMENDED_GATE_B_POLICY = "gateBExemptIfOthersPass"`(Option B)를 이 Framework의 공식 권장값으로 명시적으로 export했다. `decideFromGates()`의 새 파라미터 기본값은 여전히 `"strict"`로 유지해(하위 호환), 기존 Qualification Sprint v1/Refinement Sprint v1의 driver를 재실행해 두 Sprint의 원래 결과(각각 20.0%, 60.0%)가 타임스탬프 외에 단 한 글자도 다르지 않음을 직접 재확인했다.

## 6. 종료 조건에 대한 답

**1) Gate B의 `OPEN_QUESTION` 처리 방식이 Qualification 불일치의 마지막 원인이었는가?**
YES — STEP1의 반사실 검증으로 확정했다. Gate B를 PASS로 바꾸는 것 하나만으로 남은 2건의 False FAIL이 전부 해소됐다(다른 어떤 조건도 바꾸지 않았다).

**2) Framework는 Historical Sprint에 대해 재현 가능한 Release Decision을 일관되게 산출하는가?**
YES(Option B 적용 시) — 5개 Historical Case 전부 실제 Decision과 일치, 기존 발표된 3개 Release Sprint에 Regression 없음.

## 7. 결론

Decision Match가 목표 수준(≥80%)에 도달했고 Regression 없이 Historical Decision을 재현했으므로, Directive에 따라 **Solver Validation Framework는 연구 단계를 종료하고, 운영 단계에서 사용할 표준 검증 체계로 확정한다.** 앞으로 Solver에 대한 모든 변경(Category A/B/C/D)은 이 Framework(Tiered minN + strict Gate C + Gate B Option B)를 공식 검증 절차로 사용할 수 있다.

전체 코드: `solverValidationFrameworkQualificationRefinementV2/{RuntimeGateReplay,DecisionRuleComparison,RuleRegressionAudit,QualificationDriver}.ts`, `README.md`. Historical Dataset은 `solverValidationFrameworkQualification/HistoricalQualificationDataset.ts`를 무수정 재사용했다.
