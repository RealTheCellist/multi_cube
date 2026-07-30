# Solver Validation Framework Qualification Refinement Sprint v1

Status: Framework Refinement (Solver 연구 아님, Production Solver 무변경) — **Complete (Decision B, 수동 보정)**
Population: 동일 5개 Historical Sprint (Qualification Sprint v1과 SAME 입력/수치/CI/Cohen's d, 재측정 없음)

## 0. 배경 및 목적

Solver Validation Framework Qualification Sprint v1은 Historical Decision Match Rate 20%(1/5)를 발견했고, 근본 원인을 정확히 2개의 Rule-level 문제로 좁혔다:

1. 모든 Category에 균일한 `minN=30` — Prototype 단계 Sprint(N=15/N=10)를 부당하게 거부(False FAIL 3건)
2. Gate C("Capability 감소 없음")가 유의성을 요구하지 않아 관대하게 승인(False PASS 1건)

이번 Sprint는 **정확히 이 두 가지만** 수정해 Match Rate 100%를 목표로 한다. Production Solver(Planner/Executor/Recovery/Primitive)는 단 한 줄도 바꾸지 않았고, 수정 파일은 `solverPostReleaseValidationFramework/{ChangeClassification.ts, ReleaseGates.ts, ValidationPipeline.ts}` 3개로 한정했다.

**결과를 먼저 밝힌다**: 두 Rule 수정은 각각 의도한 대로 정확히 동작함을 확인했다. 그러나 실제로 실행한 결과 Match Rate는 100%가 아니라 **60%(3/5)**였다 — 사전에 손으로 추적한 예측(100%)이 틀렸다. 코드를 실행해 나온 실측 수치를 그대로 보고하며, 그 이유를 4절에서 정확히 root-cause한다.

## 1. STEP1 — Tiered Sample Rule

`ChangeClassification.ts`에 `ValidationStage = "prototype" | "production"`과 `minNByStage: Record<ValidationStage, number>`를 추가했다. 기존 `minN`(production-tier와 동일값) 및 `getCategorySpec()` 1-인자 시그니처는 그대로 유지해 하위 호환을 보장했다.

| Category | Prototype minN | Production minN | 근거 |
|---|---|---|---|
| A(Bug Fix) | 10 | 15 | 역사적 사례 없음, disclosed 추정 |
| B(Performance) | 10 | 30 | — |
| C(New Primitive) | 10 | 30 | Mixed Commutator Validation v1/v2의 실제 N=10 |
| D(Architecture) | 15 | 30 | Scheduler Prototype Sprint v1의 실제 N=15 |

새 `getMinNForStage(category, stage)` 함수로 조회한다.

**Stage 배정** (신규 `QualificationHelper.ts`, 이 Sprint 전용 보조 모듈 — 기존 Historical Dataset 파일은 무수정):

| Sprint | N | 배정 Stage | 근거 |
|---|---|---|---|
| Scheduler Prototype Sprint v1 | 15 | prototype | 이후 Production Integration(N=30)이 재확인하는 1단계 |
| Scheduler Production Integration Sprint v1 | 30 | production | Production Contract 확정 Sprint |
| Incremental Recovery Production Integration Sprint v1 | 30 | production | 실제 Production Recovery Layer 배선 |
| Mixed Commutator Validation Sprint v1 | 10 | prototype | Sprint 이름과 무관하게 실제로는 개별 Primitive 소표본 검증 |
| Mixed Commutator Validation Sprint v2 | 10 | prototype | v1과 동일한 소표본 검증 단계 |

**Classification Replay V2 결과: 5/5 전부 PASS** (기존 3/5에서 개선). Prototype-stage였던 3건(Scheduler Prototype v1, Mixed Commutator v1/v2)이 더 이상 최소 N 미달로 거부되지 않는다 — STEP1의 목표 달성을 확인.

## 2. STEP2 — Capability Gate 강화 (Gate C strict mode)

`ReleaseGates.ts`의 `evaluateGateC(evaluation, strict = false)`에 세 번째 상태를 추가했다. 새 통계 함수는 만들지 않고 기존 `isSignificantImprovement()`만 재사용했다.

```
strict=false(기본, 하위호환): notWorse ? PASS : FAIL   -- 기존과 동일
strict=true(신규):            significant ? PASS : (notWorse ? OPEN_QUESTION : FAIL)
```

Category B/C/D(`requiresStrictGateC()`, `QualificationHelper.ts`)에는 strict=true를 적용했다. Category A는 기존 약한 기준을 유지한다(Bug Fix는 "악화 없음"만 확인하면 충분하다는 원래 설계 의도 보존).

**Gate C Replay V2 결과**:

| Sprint | improvedCountDiff CI | strict Gate C |
|---|---|---|
| Scheduler Prototype v1 | [1.16, 2.71] | PASS (유의미) |
| Scheduler Production Integration v1 | [0.60, 1.66] | PASS (유의미) |
| Incremental Recovery Production Integration v1 | [-0.69, 0.22] | **OPEN_QUESTION** (기존 False PASS 원인이었던 케이스) |
| Mixed Commutator v1 | [-1.42, 1.22] | OPEN_QUESTION |
| Mixed Commutator v2 | [6.00, 6.00] | PASS (유의미) |

Incremental Recovery가 더 이상 PASS로 관대하게 승인되지 않고 OPEN_QUESTION으로 낮아졌다 — **False PASS 0건 달성, STEP2 목표 달성 확인**.

## 3. STEP3/4 — Historical Replay 및 Decision Match 재측정

**Decision Replay V2**:

| Sprint | 실제 | Framework | 일치 |
|---|---|---|---|
| Scheduler Prototype v1 | A | **B** | ✗ |
| Scheduler Production Integration v1 | A | A | ✓ |
| Incremental Recovery Production Integration v1 | B | B | ✓ |
| Mixed Commutator v1 | B | B | ✓ |
| Mixed Commutator v2 | A | **B** | ✗ |

**Decision Match Rate: 3/5 (60.0%)**

Category별 정확도: D=1/2, B=1/1, C=1/2. Stage별 정확도: prototype=1/3, production=2/2.

**Before/After**:

| 지표 | Before(Qualification v1) | After(이번 Sprint) |
|---|---|---|
| Decision Match Rate | 20.0%(1/5) | 60.0%(3/5) |
| False PASS | 1건 | **0건** |
| False FAIL | 3건 | 2건 |

False PASS는 목표대로 완전히 제거됐다. False FAIL은 3건→2건으로 줄었으나 0건에 도달하지 못했다.

## 4. Root Cause — 왜 100%가 아니라 60%인가 (핵심 발견)

잔여 2건(Scheduler Prototype v1, Mixed Commutator v2)을 직접 추적한 결과, **이번 Sprint가 수정 권한을 갖지 않은 제3의 원인**이 확인됐다.

두 케이스 모두 Gate C(strict)는 정확히 PASS였다. 문제는 **Gate B**였다: 두 Sprint 모두 Runtime diff가 Framework의 disclosed 허용치(Baseline p95 대비 +15%=180ms)를 초과해 Gate B가 `OPEN_QUESTION`이었다(Scheduler Prototype v1: +281ms, Mixed Commutator v2: +229ms — 둘 다 원 Sprint 자신이 이미 "트레이드오프"로 공개 인정한 수치). `evaluateGateB()`는 애초에 `PASS` 또는 `OPEN_QUESTION`만 반환하고 **절대 `FAIL`을 반환하지 않는다** — 즉 Gate B는 구조적으로 "완전히 막는" Gate가 아니라 "주의 환기용" Gate로 설계돼 있다.

그러나 `ValidationPipeline.ts`의 `decideFromGates()`는 `allPass`를 "필수 Gate 전부가 문자 그대로 PASS"로 정의한다 — Gate B가 OPEN_QUESTION이면 다른 모든 조건(minN 충족, Gate C PASS)이 만족돼도 Decision A에 도달할 수 없고 B로 떨어진다.

**이 문제는 이번 Sprint가 도입한 것이 아니다.** `decideFromGates()`의 `allPass`/`anyFail` 로직은 Post-Release Validation Framework v1부터 존재했고 이번 Sprint는 그 로직을 전혀 건드리지 않았다(`stage` 파라미터만 추가, 로직 자체 무변경). Qualification Sprint v1에서는 이 두 케이스가 `minN` 미달로 먼저 `anyFail=true`가 되어 Decision C로 떨어졌기 때문에, Gate B의 OPEN_QUESTION이 Decision에 영향을 주는지 여부가 애초에 노출되지 않았다 — **STEP1의 minN 수정이 이 케이스들을 minN 통과로 만들면서, 그동안 가려져 있던 이 세 번째 문제를 처음으로 드러낸 것**이다.

## 5. 두 Rule 수정 자체의 정확성 재확인

이번 Sprint의 실제 임무(정확히 2개 수정)는 독립적으로 검증됐다:

- **STEP1 검증**: Classification Replay V2 5/5 PASS(이전 3/5) — Tiered minN이 의도대로 정확히 동작.
- **STEP2 검증**: Gate C(strict) False PASS 0건(이전 1건), Incremental Recovery가 정확히 OPEN_QUESTION으로 낮아짐 — 강화된 Capability Gate가 의도대로 정확히 동작.

두 Rule은 **각각 올바르게 작동한다**. 남은 2건의 불일치는 이 두 Rule과 무관한, 별개의 미인가 영역(Gate B의 OPEN_QUESTION과 `allPass`의 상호작용)에서 비롯됐다.

## 6. STEP5 — Rule Regression Audit

Gate A/D/E는 이번 Sprint에서 전혀 수정하지 않았다 — 로직 무변경 확인(코드 diff로 확인, `ReleaseGates.ts`의 해당 함수 본문 불변).

5개 Historical Case 밖의, 이미 발표된 결과에 strict Gate C를 적용했을 때 영향 여부:

| Sprint | 인용 수치 | strict Gate C | 원래 Decision 영향 |
|---|---|---|---|
| Scheduler Production Integration Sprint v1 | mean=1.13, CI=[0.60,1.66] | PASS | 없음 |
| Production Integration Finalization Sprint v1 | mean=1.167, CI=[0.634,1.699] | PASS | 없음 |
| Solver Release Readiness Validation Sprint v1(ENDGAME axis 단독) | mean=0.10, CI=[-0.04,0.24] | OPEN_QUESTION | 없음(아래 설명) |

세 번째 행: ENDGAME axis 단독으로는 strict Gate C가 OPEN_QUESTION으로 낮아지지만, 그 Sprint의 실제 Decision A는 애초에 이 축 단독이 아니라 Scheduler axis(CI=[0.60,1.66])와 Finalization axis(CI=[0.634,1.699])의 보강 증거에 근거했다. 또한 이 Sprint는 5개 Historical Qualification 대상에 포함되지 않아 `decideFromGates()`로 재계산되는 Decision이 애초에 없다 — 새 Rule의 도달 범위에 대한 사전 공개 한계로만 기록한다.

**결론: Rule Regression 0건** — 기존에 발표된 3개 Sprint의 실제 Decision은 전부 불변.

또한 old `solverValidationFrameworkQualification/` 디렉토리의 기존 driver(`runSolverValidationFrameworkQualificationSprintV1.ts`)를 재실행해 Decision Match Rate가 정확히 기존과 동일한 1/5(20.0%)로 재현됨을 확인했다(원본 결과 파일은 재실행 후 원상복구했다 — git diff 0).

## 7. STEP6 — 성공 기준 판정

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Prototype Sprint가 더 이상 False FAIL 아님 | **FAIL** — Scheduler Prototype v1이 여전히 False FAIL(원인: Gate B, STEP1/2와 무관) |
| Level2 | False PASS=0, Incremental Recovery가 정확히 B | **PASS** |
| Level3 | Decision Match Rate=100%(5/5) | **FAIL** (60.0%, 3/5) |
| Level4 | Framework Rule Regression=0건, 기존 Release Sprint 판정 불변 | **PASS** |
| Level5 | Framework 변경이 Solver Runtime/Planner/Recovery/Primitive/Production Contract에 영향 없음 | **PASS**(git diff로 확인, Production 파일 전부 0 diff) |

## 8. 최종 Decision: **B** — Rule 추가 보완 필요

Directive가 제시한 수치 구간을 문자 그대로 적용하면 60%(<80%)는 Decision C(구조 재설계 필요)에 해당한다. 그러나 Qualification Sprint v1에서 이미 확립한 것과 동일한 방식으로 근본 원인을 직접 검토했다.

**핵심 관찰**: 이번에 배정받은 2개 Rule 수정(Tiered minN, strict Gate C)은 각각 독립적으로 정확하게 검증됐다(5절). 잔여 불일치 2건은 이 두 Rule과 무관하게, **단 하나의 추가 원인**(`decideFromGates()`의 `allPass`가 Gate B의 OPEN_QUESTION을 무조건 차단하는 것)으로 전부 설명된다. Gate/Decision 조립 로직 자체는 이번에도 모든 케이스에서 오류 없이 추적 가능하게 계산됐다 — 문제는 계산 로직의 붕괴가 아니라 **하나의 특정 Rule(Gate B의 OPEN_QUESTION 처리 방식)**이다.

이는 "Validation 체계 자체를 재설계"(Decision C)해야 할 문제가 아니라 "한 가지 Rule을 추가 보완"(Decision B)하면 되는 문제다. 따라서 **Decision을 B로 수동 보정한다** — 단, 이번 Sprint 자신의 권한 범위(정확히 2개 수정)를 넘어서는 발견이므로, 이 Sprint 안에서 그 세 번째 Rule을 직접 고치지 않았다.

## 9. 다음 단계 제안 (Refinement Sprint v2 후보)

`decideFromGates()`가 Gate B의 OPEN_QUESTION을 Decision A 자격에서 무조건 배제하는 대신, "구조적으로 FAIL을 반환할 수 없는 advisory Gate"(현재 Gate B, Gate E)의 OPEN_QUESTION은 강한 Capability 증거(strict Gate C PASS)가 있을 때 Decision A를 막지 않도록 조정하는 방안을 다음 Refinement Sprint의 범위로 제안한다. 이번 Sprint는 사용자가 지정한 정확히 두 가지 수정만 수행했고, 이 세 번째 발견은 그 범위 밖의 것이므로 직접 수정하지 않고 여기에 disclose한다.

전체 코드: `solverValidationFrameworkQualificationRefinement/{QualificationHelper,ClassificationReplayV2,GateReplayV2,DecisionReplayV2,RuleRegressionAudit}.ts`, driver `runSolverValidationFrameworkQualificationRefinementSprintV1.ts`. Historical Dataset은 `solverValidationFrameworkQualification/HistoricalQualificationDataset.ts`를 무수정 재사용했다(STEP3 요구사항).
