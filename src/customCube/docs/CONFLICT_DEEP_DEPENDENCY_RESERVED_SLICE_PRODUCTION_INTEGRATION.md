# CONFLICT_DEEP_DEPENDENCY Reserved Slice Production Integration Sprint v1

Status: Production Integration Sprint — Complete (**Decision C**)
Population: Recovery-level n=142 × 15 repeats × 2 arms (Baseline/Candidate); End-to-End real `solve()` n=142 × 5 repeats (710 calls)

## 0. 배경

직전 Budget & Scheduling Validation Sprint v1(Shadow Scheduler)은 SETUP에 500ms Reserved Slice를 주면 improvedRate가 0.0%→11.9%(+11.9pp), trueRegressionCount=0/142라고 측정했다. 이번 Sprint는 그 Shadow 결과를 실제 Production Scheduler(`generateRecoveryStrategies()`/`attemptRecovery()`)에 그대로 통합해 재현 여부를 실증하는 것이 목표였다.

**결론부터: 재현되지 않았다.** 실제 Production 통합 후 Recovery-level improvedRate는 오히려 10.7%→5.1%(**-5.6pp**)로 하락했고, True Regression이 11/142건 발생했다. 아래 1~12절에 그 이유와 근거를 정리한다.

## 1. Integration Diff Summary (Deliverable #1)

변경 대상은 `src/customCube/fiveByFiveEdgeRecovery.ts` 단 한 파일, 순수 추가(+49/-3):

1. `SETUP_RESERVED_SLICE_MS = 500` 상수 추가 — `REPAIR_RESERVED_SLICE_MS`/`MIXED_COMMUTATOR_RESERVED_SLICE_MS`와 동일한 관례(OUTER `deadline` 기준, `genDeadline` 아님).
2. `genSetup()`에 `schedulingStrategy === "reservedBudget" && useSetupReservedSlice` 분기 추가 — 이 분기에서는 `Date.now() < genDeadline` 게이트를 건너뛰고 **항상** SETUP을 시도하며, `Math.min(deadline, Date.now() + 500)` 창을 새로 연다.
3. `generateRecoveryStrategies()`/`attemptRecovery()`에 trailing parameter `useSetupReservedSlice = true` 추가 — `includeCCR`/`includeMixedCommutator`와 동일한 관례로, `fiveByFiveEdgeExecutor.ts`의 `executeTask()`가 이 파라미터를 전혀 넘기지 않으므로 실제 Production은 자동으로 `true`(신규 동작)를 받는다.

`git diff --stat` 확인 결과 `fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgePlanner.ts`, DISRUPT/REPAIR/CCR/Mixed Commutator/SETUP 내부 탐색 함수는 **0 diff** — Directive의 금지 사항을 전부 준수했다.

## 2. Scheduler Diagram (Deliverable #2)

```
generateRecoveryStrategies() 후보 생성 순서 (schedulingStrategy="reservedBudget", 변경 없음)
  ① DISRUPT  ─ 공유 genDeadline slice()  (예약 없음, 이번 Sprint 대상 아님)
  ② DISRUPT  ─ 공유 genDeadline slice()
  ③ SETUP    ─ Reserved 500ms, OUTER deadline 기준, genDeadline 게이트 없음  ← 이번 Sprint 변경
  ④ REPAIR   ─ Reserved 75ms,  OUTER deadline 기준  (기존, 변경 없음)
  ⑤ CCR      ─ remainingTime 기반  (기존, 변경 없음)
  ⑥ MIXED_COMMUTATOR ─ Reserved 300ms, OUTER deadline 기준  (기존, 변경 없음)
→ chooseBestRecovery()가 위 후보 중 단일 승자를 고른다 (수정 없음, 0 line changed)
```

## 3. Reserved Slice Runtime (Deliverable #3)

| Metric | Baseline (useSetupReservedSlice=false) | Candidate (=true) |
|---|---|---|
| avg | 654ms | 950ms |
| median | 578ms | 1001ms |
| p95 | 1141ms | 1152ms |
| max | 1377ms | 1343ms |

SETUP이 실제로 선택된 233개 라운드의 `candidateTimeMs`: avg=935ms, p95=1159ms, max=1252ms. End-to-End 실 `solve()` 런타임: avg=1040ms, median=1012ms, p95=1170ms, max=1367ms — 기준(≤1200ms) 대비 p95는 통과.

## 4. Capability Comparison (STEP3, Deliverable #4)

| Level | Baseline | Candidate | Delta |
|---|---|---|---|
| Recovery-level improvedRate | 10.7% | **5.1%** | **-5.6pp** |
| E2E 실 solve() Improved | — | 0.7% (5/710) | 단일 arm |
| E2E 실 solve() Solved | — | 0.0% | 단일 arm(Hole Dataset 자체가 100% 해결을 목표하지 않는 population — 이전 Sprint들에서도 동일하게 0.0% 관측됨, 새로운 문제 아님) |

Shadow Sprint의 예측(+11.9pp)과 정반대 방향(-5.6pp)으로 나타났다 — **재현 실패**.

## 5. Regression Analysis (STEP4, Deliverable #5)

n=142, casesWithSinglePassFlip=17, **trueRegressionCount=11**, falseRegressionCount=6.

True Regression 11건(예: `worstCase:e7a801fb`, `worstCase:e5101f85`, `worstCase:e9009e73`, `worstCase:e8be823`, `worstCase:42c89b9`, `scrambleDepth10:8`, `scrambleDepth30:0`, `scrambleDepth30:4`, `scrambleDepth50:2`, `scrambleDepth50:8`, `scrambleDepth100:9`)는 meanGap 0.73~1.20으로 우연한 노이즈로 보기 어려운 일관된 하락이다.

### 근본 원인 분석 (자동 생성 텍스트를 넘어선 수동 검증)

Shadow Sprint(Sprint 3)의 방법론은 **가산적(additive)**이었다: REAL `chooseBestRecovery()`가 "Baseline이 만든 실제 후보 집합 ∪ {Synthetic SETUP 후보 1개}" 중에서 승자를 고르는 구조라, Candidate 쪽 후보 집합이 Baseline의 상위집합(superset)이었다. 상위집합에서 고르는 한 improvedRate는 구조적으로 떨어질 수 없다 — Sprint 3의 trueRegressionCount=0은 이 additive 설계의 필연적 결과였지, "SETUP Reserved Slice가 다른 Primitive를 방해하지 않는다"는 증거가 아니었다.

이번 Production Integration은 **대체적(substitutive)**이다: `useSetupReservedSlice=true`는 SETUP을 추가하는 게 아니라, SETUP이 `genDeadline` 게이트 없이 **항상** 후보를 만들도록 `genSetup()` 자체의 동작을 바꾼다. 그 결과 SETUP이 후보로 등장하는 빈도가 0.7%→10.9%로 급증했고(Interaction Matrix, 6절), `chooseBestRecovery()`는 여전히 단일 승자만 고르므로 — SETUP이 더 자주 이겨서 원래 이겼을 CCR(6.0%→1.3%, -4.7pp)·MIXED_COMMUTATOR(4.6%→2.8%, -1.8pp) 후보를 대체했다. 문제는 SETUP이 새로 이긴 라운드 중 상당수가 **실제로는 개선에 실패**한다는 점(E2E에서 SETUP 채택 5건 중 성공 0건) — `chooseBestRecovery()`의 정적 스코어링 휴리스틱이 "실제 성공 가능성"이 아니라 "예상 이득 점수"만 보고 SETUP을 과대평가하기 때문으로 보인다. 즉 Shadow Sprint는 "SETUP을 추가하면 도움이 되는가"를 측정했고, 이번 Sprint는 "SETUP이 REPAIR/CCR/MIXED_COMMUTATOR와 동등하게 경쟁하면 무슨 일이 일어나는가"를 측정한 것이며, 두 질문의 답은 다르다.

## 6. Primitive Interaction Matrix (STEP7, Deliverable #6)

| Type | Baseline share | Candidate share | Delta |
|---|---|---|---|
| DISRUPT | 0.4% | 0.5% | +0.1pp |
| **SETUP** | 0.7% | **10.9%** | **+10.3pp** |
| REPAIR | 0.0% | 0.0% | 0.0pp |
| **CCR** | 6.0% | **1.3%** | **-4.7pp** |
| MIXED_COMMUTATOR | 4.6% | 2.8% | -1.8pp |
| none | 88.3% | 84.4% | -3.8pp |

Multi-offer rate(동일 라운드에 2개 이상 타입 제안): Baseline 0.2% → Candidate 1.4%. 자동 생성 로직은 "5pp 이상 하락"만 Starvation으로 플래그하므로 CCR의 -4.7pp는 플래그되지 않았지만(`starvationFlags: []`), 5절의 근본 원인 분석에서 보듯 이 미만-임계값 하락들의 누적이 실제 improvedRate 역전의 핵심 메커니즘이다 — **자동 임계값(5pp)이 이번 사례의 실제 문제를 놓쳤다는 점을 여기서 명시적으로 지적한다.**

## 7. Budget Utilization (STEP6, Deliverable #7)

SETUP 채택 count=233, avg Reserved Budget Utilization=**187.1%**, Timeout Rate(≥90% of 500ms 소진)=**97.0%**.

사용자가 사전에 제기한 질문("500ms가 여전히 자주 timeout되는가, 추가 Budget Sweep이 필요한가")에 대한 답: **그렇다, 그리고 오히려 악화됐다.** Shadow Sprint의 timeoutRate=93.1% 대비 Production 통합 후 97.0%로 소폭 상승했고, 평균 예산 활용률(187.1%)은 명목 500ms의 거의 2배에 달한다 — `tryEndgameMultiPly`의 폴링 방식 deadline 체크 특성상 실제 소요 시간이 명목 예약을 크게 초과한다는 Shadow Sprint의 관찰(2절, Budget Utilization 초과)이 실제 Production에서도 동일하게 재현됐다.

## 8. Timeout Distribution (Deliverable #8)

SETUP-chosen 233개 라운드 중 97.0%(약 226건)가 500ms 예약의 90% 이상을 소진 — 500ms는 SETUP의 진짜 필요 예산에 비해 여전히 부족하다. 다만 이번 Sprint의 핵심 문제는 "예산 부족"이 아니라 6절의 **경쟁 대체(displacement) 문제**이므로, 단순히 예산을 늘리는 것(Budget Sweep)만으로는 근본 원인이 해결되지 않을 가능성이 높다 — 12절 참조.

## 9. Runtime Distribution (Deliverable #9)

3절 참조. Candidate arm의 avg(950ms)/p95(1152ms)는 Baseline(654ms/1141ms) 대비 avg가 크게 늘었지만 p95는 기준(1200ms) 이내로 유지됐다 — Runtime 자체는 허용 범위 내(Level 3 PASS).

## 10. Release Readiness Matrix (Deliverable #10)

| Criterion | Status | 근거 |
|---|---|---|
| Level 1 — Production Integration 정상 동작 | **PASS** | SETUP_RESERVED_SLICE_MS=500이 genSetup()에 실제 적용됨, chooseBestRecovery() 0 line 수정 |
| Level 2 — Capability 향상 재현 | **OPEN_QUESTION → 실질적으로 FAIL에 준함** | improvedRate -5.6pp (Shadow +11.9pp의 정반대 방향) |
| Level 2 — Regression 허용 범위 | **FAIL** | True Regression 11건/142 (기준: 0건) |
| Level 3 — Runtime 허용 범위 | PASS | Candidate p95=1152ms ≤ 1200ms 기준 |
| Level 3 — Primitive Interaction | PASS(자동) / **주의 필요(수동)** | 자동 임계값(5pp)은 통과하나 CCR -4.7pp가 5절의 근본 원인 |
| E2E 실 solve() 확인 | PASS(메커니즘 확인용, 절대적 능력 평가 아님) | SETUP Reserved Slice가 실 Production 경로에서 작동함을 확인 |

## 11. Final Decision (Deliverable #11)

## **Decision C — Architecture-level 재검토 필요**

Regression 기준(Level 2)이 명백히 FAIL(True Regression 11건)이고, Capability 기준도 방향이 반전됐다(-5.6pp). 자동 생성 `ReleaseReadiness.ts`의 판정(Decision C, "Shadow Scheduler에서 관찰된 효과가 실제 Production에서 재현되지 않거나 구조적 문제 발생")은 숫자와 일치하며, 5절의 근본 원인 분석이 그 "구조적 문제"의 정체를 구체화한다: **Shadow Scheduler의 additive 측정 방법론과 실제 Production의 substitutive scheduling 사이의 근본적 불일치**가 원인이다. 즉 이번 Sprint의 실패는 500ms라는 예산 크기의 문제가 아니라, `chooseBestRecovery()`가 "실제 성공 가능성"이 아니라 "예상 점수"로 단일 승자를 고르는 한 SETUP의 등장 빈도 증가가 곧바로 다른 Primitive의 대체(및 그로 인한 순손실)로 이어지는 **Scheduler 설계 자체의 한계**다.

**이번 Sprint의 Production 코드 변경(`fiveByFiveEdgeRecovery.ts`)은 되돌리지 않는다** (Directive 범위 밖 — 코드 원복은 별도 결정 필요) 하지만 이 상태로 두면 실제 사용자 경로에서 Recovery 성공률이 하락(-5.6pp)한다는 것이 확인됐으므로, 다음 Sprint 전까지 이 통합을 프로덕션에 릴리스하는 것은 **권고하지 않는다**.

## 12. Next Sprint Proposal (Deliverable #12)

**Architecture Revision Sprint** 제안 — 다음 두 갈래를 모두 조사해야 한다:

1. **Scheduler 판정 로직 검토**: `chooseBestRecovery()`가 후보의 "예상 점수"가 아니라 "실제 개선 여부"를 더 잘 반영하도록 스코어링을 조정할 수 있는지, 또는 SETUP이 특정 조건(예: CCR/MIXED_COMMUTATOR가 이미 후보를 만든 라운드)에서는 낮은 우선순위를 갖도록 스케줄링 순서/가중치를 조정할 수 있는지 검토. 이는 Directive가 이번 Sprint에서 금지한 "탐색 알고리즘 변경"이 아니라 순수 스케줄링/선택 로직의 문제이므로 다음 Sprint의 범위로 적합하다.
2. **단순 Budget Sweep의 한계 확인**: 500ms를 늘려도(750ms, 1000ms 등) 근본 원인(대체 문제)이 해결되지 않을 가능성이 높다는 가설을, 더 큰 Reservation에서도 CCR/MIXED_COMMUTATOR 대체 패턴이 계속되는지 측정해 검증 — 단순 예산 확대가 해법이 아님을 정량적으로 확인하거나, 반대로 예산을 늘리면 SETUP 자체 성공률이 올라가 대체로 인한 순손실을 상쇄하는지 확인.

두 갈래 모두 이번 Sprint가 새로 발견한 "Shadow additive vs Production substitutive" 불일치를 다음 연구 Sprint의 핵심 질문으로 승계해야 한다.
