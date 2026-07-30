# Solver Post-Release Validation Framework v1

Status: Framework 정의 Sprint(Production 코드 변경 없음) — Complete (**Decision A**, Framework 확정)

## 0. 배경

Solver Release Readiness Validation Sprint v1이 Decision A(Release Approved)를 받고 Solver Product Release Complete를 선언했다. 그러나 이 프로젝트에는 이미 한 번의 선례가 있다: `docs/PRODUCTION_RELEASE_CLOSEOUT.md`가 Production Integration Finalization Sprint v1(ENDGAME+Incremental Recovery+CCR, 3개 계약) 직후 "Production Release Complete"를 공식 선언했지만, 그 뒤로도 CONFLICT_DEEP_DEPENDENCY 계열 전체(Mechanism Analysis → Budget Scheduling → Reserved Slice Production Integration → Architecture Revision → Scheduler Prototype → Scheduler Production Integration)가 이어졌다. 즉 "Release 선언"은 매번 그 시점의 Sprint별 수동 검증에 의존했고, 이후 변경이 이전 Release 품질을 유지하는지 자동으로 재확인할 표준 체계는 없었다.

이번 Sprint는 그 공백을 메운다. Production Solver의 동작은 한 줄도 바꾸지 않는다 — 이번 Sprint의 산출물은 오직 문서와, 향후 Sprint가 재사용할 타입/함수뿐이다.

## 1. Release Contract Catalog (Deliverable #1, STEP1)

`src/customCube/solverPostReleaseValidationFramework/ReleaseContractCatalog.ts`에 코드로 확정. 각 Contract는 Origin/Integration/Validation Sprint를 전부 연결한다.

| Contract | Production 값 | Origin | Integration | Validation(연대순) |
|---|---|---|---|---|
| ENDGAME Budget | 250ms | ENDGAME Optimization Prototype Refinement Sprint v2 | Production Integration Finalization Sprint v1 | Finalization(결합 PASS) → Solver Release Readiness Validation Sprint v1(단독 축 CI는 0 포함, 결합 증거로 PASS 유지) |
| Incremental Recovery Fixed Budget | 140ms | Incremental Recovery Refinement Sprint v1 | Incremental Recovery Production Integration Sprint v1 | **개별 검증 Decision B**(CI 0 포함) → Finalization에서 결합 검증 시 Decision A로 격상 |
| CCR Scheduling | remainingTime | CCR Integration Blueprint Sprint v1 | CCR Production Integration Sprint v1 | Finalization(결합 PASS) → Solver Release Readiness Validation Sprint v1(재확인, offered=0은 solve() 전체 예산 소진에 따른 기대된 현상) |
| Scheduler(SETUP Last-Resort) | order 배열 재배치 + skip 조건 | Architecture Revision Sprint v1 | Scheduler Prototype Sprint v1 | Scheduler Prototype(N=15, Decision A) → Scheduler Production Integration(N=30, Decision A) → Solver Release Readiness(재확인, Decision A) |

**정직한 기록**: "네 계약 모두 개별적으로 Decision A를 받았다"는 통념은 정확하지 않다. Incremental Recovery는 개별 검증에서 Decision B(중립)를 받았고, 다른 계약과 **결합** 검증했을 때만 Decision A로 격상됐다. 이는 이 Framework의 존재 이유를 뒷받침한다 — 개별 계약 단위가 아니라 **결합 상태 전체**가 Release Gate의 실제 판정 단위여야 한다.

## 2. KPI Definition / Regression Test Suite (Deliverable #2, STEP2)

`KpiDefinitions.ts`의 `KpiSnapshot` 인터페이스로 9개 KPI를 표준화: successRate, improvedRate, trueRegressionCount/Rate, falseRegressionCount/Rate, avgRuntimeMs, p95RuntimeMs, deadlineMissRate, duplicateCount, starvedTypeCount. 모든 향후 Sprint의 Regression Test Suite는 이 shape로 수집한다.

## 3. Statistical Validation Standard (Deliverable #3, STEP3)

`KpiDefinitions.ts`의 `evaluatePairedDiff()`가 이 연구 전체가 이미 써온 `computeStats`/`analyzeEffectSize`(둘 다 무수정 재사용)를 하나의 표준 함수로 통합한다. 결과에는 stats(mean/stddev/95% CI), Cohen's d_z, **Majority Vote rate**가 모두 포함된다.

두 개의 표준 판정 함수를 확정한다:
- `isSignificantImprovement(evaluation)`: `ciLower > 0` — 이 연구 전체가 실제로 "유의미하다"고 주장할 때 써온 유일한 기준. Solver Release Readiness Validation Sprint v1이 자체 발견해 즉시 고친 "mean>=0만으로 PASS 처리"라는 느슨한 오류를 이 함수로 봉인해, 향후 Sprint가 같은 실수를 반복하지 않게 한다.
- `isNonRegressive(evaluation)`: `ciLower <= 0` — "악화 방향으로 유의미하게 증가하지 않았다"는 더 약한 기준(Regression count, Deadline Miss 등에 사용).

`MIN_N_FOR_RELEASE_CONFIDENCE = 30`을 Release 수준 재현성의 표준 최소 N으로 확정.

## 4. Release Gate Definition (Deliverable #4, STEP4)

`ReleaseGates.ts`에 Gate A~E를 함수로 확정:

| Gate | 이름 | 판정 로직 |
|---|---|---|
| A | Regression 증가 없음 | True/False Regression diff 둘 다 `isNonRegressive` |
| B | Runtime 허용 범위 | Runtime diff가 Baseline p95 대비 +15%(기본값, 조정 가능) 이내 |
| C | Capability 감소 없음 | 성공 케이스 diff의 CI 상한 또는 평균이 0 이상(유의미한 개선은 별도 요구 없음) |
| D | Operating Contract 유지 | 호출자가 제공한 Contract Audit row들이 전부 PASS |
| E | Primitive Interaction 이상 없음 | Duplicate=0 그리고 Starved Type=0 |

## 5. Validation Pipeline (Deliverable #5, STEP5)

`ValidationPipeline.ts`가 Directive의 6단계를 타입으로 확정한다:

```
Code Change → Replay → Metric Collection → Statistical Validation → Release Gate → Decision
```

"Replay"와 "Metric Collection"은 변경 종류마다 다르므로 호출자가 직접 구현하는 Hook으로 남긴다(`PipelineHooks<TCase, TRunRecord>`). 유일하게 완전히 재사용 가능한 부분은 마지막 두 단계 — `decideFromGates(categorySpec, nUsed, gateResults)`가 Category별 필수 Gate + 최소 N 충족 여부로 Decision A/B/C를 조립한다. 이 로직은 이 연구 전체의 거의 모든 Sprint가 손으로 반복 작성해온 것과 동일하며, 이제 한 곳에만 존재한다.

## 6. Future Change Classification (Deliverable #6, STEP6)

`ChangeClassification.ts`가 4개 Category를 확정한다:

| Category | 이름 | 필수 Gate | 최소 N | Population 범위 |
|---|---|---|---|---|
| A | Bug Fix | A, C | 15 | 영향받는 케이스 부분집합 |
| B | Performance Optimization | A, B, C | 30 | 전체 Hole Dataset |
| C | New Primitive | A, B, C, E | 30 | 전체 Hole Dataset + Target Cluster |
| D | Architecture Change | A, B, C, D, E | 30 | 전체 Hole Dataset + 실 solve() E2E |

이 임계값들은 이 연구 전체가 실제로 각 규모의 변경에 사용해온 N을 그대로 반영한다(Bug-Fix급 국소 변경은 N=15로도 검증한 전례가 있고, Architecture급 변경은 항상 N≥30 + 전체 population + 실 solve()를 요구해왔다).

## 7. Decision Matrix (Deliverable #7)

| Level | 기준 | 판정 |
|---|---|---|
| 1 | Release Validation Framework 정의 | PASS — Catalog/KPI/Gate/Pipeline/Classification 5개 모듈 모두 타입체크 통과, smoke-tested |
| 2 | Release Gate 표준화 | PASS — Gate A~E 함수화, 임계값 disclosed |
| 3 | KPI 표준화 | PASS — 9개 KPI + evaluatePairedDiff 단일 진입점 |
| 4 | Validation Pipeline 정의 | PASS — 6단계 타입 + decideFromGates 재사용 가능 함수 |
| 5 | 향후 Sprint에서 재사용 가능 | PASS — 모든 모듈이 순수 함수/타입, Production 코드 의존 없이 import 가능 |

## 8. Release Recommendation / Final Decision: **A**

**Framework 확정.** 향후 모든 Solver 변경(Bug Fix, Performance Optimization, New Primitive, Architecture Change)은 본 Framework(`solverPostReleaseValidationFramework/`)의 Contract Catalog/KPI/Gate/Pipeline/Classification을 사용한다.

Production 코드는 이번 Sprint에서 전혀 수정되지 않았다(git diff 0, Solver Engine/Planner/Executor/Recovery/Primitive Logic/BFS/Deferred Validator/MultiCycle Analyzer 전부 확인). 이 문서와 다섯 개 모듈이 이번 Sprint의 유일한 산출물이다.
