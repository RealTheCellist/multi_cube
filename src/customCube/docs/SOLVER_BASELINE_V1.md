# Solver Version 1.0 — Production Baseline

## Baseline 선언

```
Solver Version 1.0
Status: Production Baseline
Architecture: Frozen
Validation: Frozen
Operating Contract: Frozen
Commit: 1df58b6a13705b5a0237ada5d3f96f8d2feffbff
Branch: claude/cube-game-dev-afnm5z
Frozen since (production code): commit e386da8 (Short-Circuit fix) —
  이후 protected 파일 diff 0건이 8개 연속 Sprint에서 확인됨
  (MCM Production Validation, MCM Validation Methodology Qualification,
  Protocol Standardization, PARITY Validation Protocol Qualification,
  Solver Research Closeout, Long-term Reliability Validation,
  Continuous Validation Framework, Operations Transition[이 문서 자신]).
```

이 시점 이후 모든 변경은 **이 Baseline 대비 diff**로 설명되어야 한다.

## Frozen: Architecture

`docs/SOLVER_RESEARCH_CLOSEOUT.md`의 Final Architecture v1과 동일:

- Recovery Pipeline 8단계 기본 순서 (`solverResearchCloseoutV1/FinalArchitecture.ts`)
- `recoveryEligible = allowRecovery && task.type === "ENDGAME"`
- Outer Deadline: `PLAN_TIME_BUDGET_MS=1000ms`(고정) /
  `recoveryReserveMsOverride=250ms`(기본값, 파라미터화됨) /
  `FIXED_BUDGET_MS=140ms`(고정)

## Frozen: Operating Contract

`docs/SOLVER_RESEARCH_CLOSEOUT.md`의 Operating Contract Catalog 9건 —
Continuous Validation Framework Sprint v1이 실제로 3회 재확인(drift 없음),
이번 문서 작성 시점까지 유지:

| Contract | 값 |
|---|---|
| PLAN_TIME_BUDGET_MS | 1000ms |
| PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS | 250ms |
| FIXED_BUDGET_MS | 140ms |
| REPAIR_RESERVED_SLICE_MS | 75ms |
| MIXED_COMMUTATOR_RESERVED_SLICE_MS | 300ms |
| SETUP_RESERVED_SLICE_MS | 500ms |
| PARITY_GATED_CYCLE_RESERVED_SLICE_MS | 2000ms |
| MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS | 2000ms |
| Scheduler SETUP Last-Resort Ordering | candidates.length===0일 때만 |

## Frozen: Validation

`solverPostReleaseValidationFramework/`:

- **Gate A-E**: Regression 증가 없음 / Runtime 허용 범위(+15%) /
  Capability 감소 없음 / Operating Contract 유지 / Primitive Interaction
  이상 없음.
- **Category A-D**: Bug Fix(A,C) / Performance Optimization(A,B,C) /
  New Primitive(A,B,C,E) / Architecture Change(A,B,C,D,E), tiered minN
  (prototype/production).
- **Decision Rule**: 모든 required Gate PASS → Decision A; 하나라도
  FAIL → Decision C; 그 외 → Decision B.
- **Dedicated Budget Primitive Protocol**: `MULTI_COMPONENT_MERGE`,
  `PARITY_GATED_CYCLE` 둘 다 Capability Validation(attemptRecovery_direct)
  + Product Validation(solve_e2e) 병행 보고 — 어느 한쪽만으로 판정하지
  않음(양쪽 다 Decision A로 이미 확정).

## Frozen: Continuous Validation Framework

`solverContinuousValidationFrameworkV1/`:

- Validation Policy 5개 항목(Regression/Runtime/Contract Drift/
  Determinism/Release Gate Validation)
- `NightlyValidationRunner.ts` — 단발 real population replay 실행 단위
- `RegressionDashboard.ts` — 누적 트렌드 계산(3개 real run으로 검증 완료)
- `ContractDriftMonitor.ts` — 8개 Contract 재확인(PASS 확인)
- `ReleaseGateAutomation.ts` — Gate A/B/C + Contract Drift 자동 조합
  판정(PASS 확인)

## 이 Baseline이 의미하는 것

향후 Production Solver, Primitive, Scheduler, Budget, Validation
Framework에 대한 어떤 변경 제안도 **"이 Baseline의 무엇을 얼마나
바꾸는가"**로 설명되어야 한다. Baseline 자체를 갱신하려면(Version 1.1
등) 별도의 명시적 Sprint가 필요하며, 이번 Sprint(Operations Transition)
자신은 Baseline을 갱신하지 않고 **현재 상태를 있는 그대로 Freeze**한다.
