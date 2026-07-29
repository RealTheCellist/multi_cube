# CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1

Status: Production Integration Validation — Complete (**Decision A**, Production Contract 확정)
Population: Production Replay n=142×30; E2E(실 solve()) n=142×10

## 0. 배경

Scheduler Prototype Sprint v1은 Architecture Revision Sprint v1이 설계한 "SETUP Last-Resort" Scheduler Ordering(Option A)을 실제 `fiveByFiveEdgeRecovery.ts`에 적용했고, N=15 재현성 검증에서 True Regression 11건→0건, 통계적으로 유의미한 Capability 개선(Cohen's d=1.26, large)을 확인해 **Decision A**(Scheduler Contract 채택)로 마무리했다.

이번 Sprint의 Directive는 그 Scheduler Contract를 "Prototype에서 실제 Production Recovery Contract로 통합"하고, N≥30 규모에서 효과가 유지되는지 검증하도록 지시했다.

## 1. Integration 방법 (STEP1, Deliverable) — 코드 변경 없음

**중요한 확인 사항**: 이번 Sprint는 프로덕션 코드를 단 한 줄도 수정하지 않았다. 그 이유는 확인 결과 이미 통합이 완료되어 있었기 때문이다.

`fiveByFiveEdgeExecutor.ts`의 실제 solve() 경로(`executeTask()`)를 직접 읽어 확인한 결과:

```ts
schedulingStrategy: SchedulingStrategy = "reservedBudget",   // 기본값
...
return attemptRecovery(
  cubies, libs, deadline, weights, retryTask, trace,
  includeRepair, shortCircuitRepair,
  schedulingStrategy   // 여기까지 9개 인자만 전달
);
```

`attemptRecovery()`의 뒤쪽 세 매개변수(`includeCCR`, `includeMixedCommutator`, `useSetupReservedSlice`)는 Executor가 한 번도 override하지 않으며, 각각 기본값 `true`다. 즉 Scheduler Prototype Sprint v1이 수정한 분기(`schedulingStrategy==="reservedBudget" && useSetupReservedSlice===true`, SETUP Last-Resort)는 **이미 실제 Production의 유일한 실행 경로**다 — 별도로 존재하는 "Prototype 전용 스케줄러"를 병합할 대상 자체가 없었다.

따라서 이번 Sprint의 실질적 범위는 STEP2~6: 동일한 효과가 N≥30 규모, 실제 `generateRecoveryStrategies()`/`attemptRecovery()`/`solve()` 경로에서 유지되는지 재검증하는 것으로 재정의됐다. Primitive Logic/Planner Logic/Solver Engine/Executor/BFS/Deferred Validator/MultiCycle Analyzer/Primitive Gate/Primitive Algorithm — 모두 git diff 0줄 확인됨(2절 참조 대신 여기서 직접 명시).

## 2. Runtime 분석 (STEP3, Deliverable)

| 항목 | 이번 Sprint(N=10, n=1420) | Scheduler Prototype Sprint v1(N=5, n=710) |
|---|---|---|
| 평균 | 1069.3ms | 1063.7ms |
| p95 | 1313ms | 1286ms |
| max | 2842ms | 1599ms |
| Deadline Miss | 682/1420 (48.0%) | 325/710 (45.8%) |

p95(+2.1%)와 Deadline Miss율(+2.2%p)은 표본 크기가 2배로 늘어난 것을 감안하면 실질적으로 동일 수준(우연 변동 범위)이다. max값(1599ms→2842ms)은 표본이 커지면서 극단값을 더 많이 관측하게 된 통계적으로 자연스러운 현상(극값은 표본 크기에 비례해 커지는 경향이 있음)이며, p95라는 더 안정적인 지표가 그대로 유지되므로 새로운 Runtime 이상 신호로 보지 않는다.

## 3. Regression 분석 (STEP2, Deliverable)

| 항목 | 값 |
|---|---|
| n | 142 |
| singlePassFlip 있는 케이스 | 11 (Scheduler Prototype Sprint v1의 N=15에서는 6건 — N이 2배로 늘면서 관측 기회가 늘어난 것으로 설명됨) |
| True Regression | **0** (기준: Scheduler Prototype Sprint v1의 N=15 측정치도 0건) |
| False Regression | 11 |

True Regression이 N=30 규모에서도 0건으로 유지된 것이 이 Sprint의 핵심 결과다.

## 4. Primitive Interaction (STEP5, Deliverable)

Baseline(useSetupReservedSlice=false, 구 스케줄러) vs Candidate(useSetupReservedSlice=true, 새 Last-Resort 스케줄러) — STEP2 Replay 데이터에서 직접 산출.

| 타입 | Invocation | Selected | Success(선택 시) |
|---|---|---|---|
| DISRUPT | 0.0%→0.0% | 0.0%→0.0% | 0.0%→0.0% |
| SETUP | 0.2%→3.8% | 0.2%→3.8% | 0.0%→**12.8%** |
| REPAIR | 0.0%→0.0% | 0.0%→0.0% | 0.0%→0.0% |
| CCR | 3.4%→3.8% | 3.4%→3.8% | 100.0%→100.0% |
| MIXED_COMMUTATOR | 3.8%→3.8% | 3.7%→3.7% | 100.0%→100.0% |
| none(후보 없음) | 92.5%→88.6% | 92.5%→88.6% | — |

CCR/MIXED_COMMUTATOR의 Invocation·Selected·Success Rate가 거의 변화 없이 유지됐다 — Last-Resort 순서 변경이 이들의 경쟁 기회를 빼앗지 않았다는 직접적 증거다. SETUP은 Last-Resort로 밀리면서 오히려 선택 시 성공률이 0%→12.8%로 올랐는데, 이는 "다른 후보가 모두 실패한 진짜 어려운 케이스에서만 SETUP이 호출되고, 그 필터링된 부분집합에서는 SETUP이 실제로 유효했다"는 해석과 일치한다.

## 5. Statistical Validation (STEP4, Deliverable)

Repeat(N=30) 단위 paired-diff(Candidate - Baseline).

| 지표 | mean | 95% CI | Cohen's d_z |
|---|---|---|---|
| 성공 케이스 수 diff | +1.13 | [0.60, 1.66] | 0.77 (medium) |
| Regression 케이스 수 diff | 0.00 | [0.00, 0.00] | — |
| Runtime(ms) diff | +279.4 | [274.5, 284.3] | — |

CI 하한 0.60으로 0을 명확히 상회 — N=30 규모에서도 개선이 우연이 아님을 재확인했다. (참고: Scheduler Prototype Sprint v1의 N=15 측정은 mean=+1.93, d=1.26(large)였다 — 이번 N=30 측정의 mean=+1.13, d=0.77(medium)은 방향은 동일하나 크기가 다소 작다. 두 측정 모두 CI가 0을 배제하므로 결론에는 영향 없으나, 표본이 커지며 초기 작은-N 추정치의 정밀도가 향상된 것으로 해석한다 — 과장하지 않고 그대로 보고한다.)

## 6. Decision Matrix (STEP6, Deliverable)

| Level | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | Production Integration 성공 | PASS | 코드 변경 0줄 — 이미 실제 유일 실행 경로였음을 확인 |
| 2 | Regression 증가 없음 | PASS | True Regression 0건→0건 |
| 2 | Primitive Interaction 악화 없음 | PASS | DISRUPT/REPAIR/CCR/MIXED_COMMUTATOR 중 Success Rate 20%p 이상 하락 없음 |
| 3 | Success Rate 유지/증가 | PASS | mean=+1.13, 95% CI=[0.60, 1.66] |
| 4 | Runtime 증가가 허용 범위 | PASS | p95 1313ms(Prototype 1286ms 대비 +15% 기준=1479ms 이내), Deadline Miss 48.0%(Prototype 45.8%와 유사) |
| 5 | N≥30 재현성 PASS | PASS | N=30 충족, CI 하한 0.60 > 0 |

## 7. 최종 Production Contract 및 Decision: **A**

**Option A(SETUP Last-Resort)를 Production Contract로 확정한다.** Scheduler Ordering Release가 가능하다.

- Production 코드는 이미 이 Contract로 동작 중이며(1절), 추가 배포 작업이 필요 없다.
- Level 1~5 전 기준 PASS.
- Runtime 트레이드오프(+279ms/repeat, Deadline Miss 48.0%)는 Scheduler Prototype Sprint v1이 이미 공개한 것과 동일 수준이며, N=30에서도 새로운 악화가 없음을 확인했다.
- Primitive Interaction 검증으로 CCR/MIXED_COMMUTATOR가 전혀 밀려나지 않았음을 확인했다.

## 8. 다음 단계 제안

지금까지의 CONFLICT_DEEP_DEPENDENCY 계열 Sprint(Mechanism Analysis → Budget & Scheduling → Reserved Slice Production Integration → Architecture Revision → Scheduler Prototype → Scheduler Production Integration)는 이 지점에서 **Production Integration 트랙을 종료**할 수 있는 상태다. 남은 항목은:

1. **최종 Release Validation** — 이번까지의 모든 CONFLICT_DEEP_DEPENDENCY 변경을 포함한 전체 Solver의 Release Readiness 종합 판정(과거 `PROD_VALIDATION`/`RELEASE_READINESS` 계열 Sprint 형식 재사용).
2. **Deadline Miss 48%대 자체의 근본 원인** — 이는 이번 Sprint가 야기한 문제가 아니라 이 Hole Dataset population 자체의 특성(가장 어려운 잔여 실패 케이스들)에서 반복적으로 관측된 것이므로, Scheduler와 무관한 별도 Budget/Runtime Sprint 후보로 남긴다.
