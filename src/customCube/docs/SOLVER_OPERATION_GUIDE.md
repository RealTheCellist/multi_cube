# Solver Operation Guide

이 문서는 **운영자를 위한 문서**다. 지금까지 축적된 Research Sprint
문서(`docs/*.md` 90여 개)를 읽지 않아도, 이 문서 하나만으로 현재 Release된
5x5 Rubik's Cube Solver를 유지관리할 수 있도록 필요한 정보만 추출했다.

Baseline: `docs/SOLVER_BASELINE_V1.md` (commit `1df58b6`).

---

## 1. Architecture Summary

Solver는 4개 레이어로 구성된다:

- **Planner** (`fiveByFiveEdgePlanner.ts`) — 여러 후보 whole-cube Strategy를
  생성해 클론된 큐브에 미리보기(preview)로 시뮬레이션하고 Evaluator로
  점수를 매겨 최고 점수의 Strategy를 채택. Executor의 `executeTask()`만
  블랙박스로 호출.
- **Executor** (`fiveByFiveEdgeExecutor.ts`) — Task를 실제 Move로 변환.
  `executeTask()`가 ENDGAME 타입 task에서만 Recovery를 트리거
  (`recoveryEligible = allowRecovery && task.type === "ENDGAME"`).
- **Recovery** (`fiveByFiveEdgeRecovery.ts`) — 8종 후보(DISRUPT×2, REPAIR,
  CCR, MULTI_COMPONENT_MERGE, PARITY_GATED_CYCLE, MIXED_COMMUTATOR, SETUP)
  중 가장 점수가 높은 것을 선택. 아래 "Recovery Pipeline" 참조.
- **Primitive Library** (`fiveByFiveEdges.ts`) — BASE_ALG/FLIP_ALG/
  PARITY_ALG 등 실제 이동/케이스 라이브러리와 `tryFixWing`/
  `tryEndgameThroughDisruption`/`tryEndgameMultiPly` 등 저수준 탐색 함수.

진입점: `FiveByFiveEdgeSolverEngine.solve(cubies, weights?, endgameReserveMs?, recoveryReserveMsOverride?)`
(`fiveByFiveEdgeSolverEngine.ts`). `PLAN_TIME_BUDGET_MS=1000ms`(고정, 파라미터
아님)가 전체 outer deadline.

## 2. Recovery Pipeline (기본 순서, `reservedBudget`/`AFTER_CCR`)

| 순서 | Candidate | Gate | Budget | Short-Circuit 대상 |
|---|---|---|---|---|
| 1-2 | DISRUPT(light/extended) | genDeadline 공유 | 공유 창 | 아니오 |
| 3 | REPAIR | cycleLength 2-4 AND conflictEdgeCount>0 | 75ms | 예 |
| 4 | CCR | includeCCR flag만 | remainingTime | 예 |
| 5 | MULTI_COMPONENT_MERGE | componentCount>=3 | 2000ms | 예 |
| 6 | PARITY_GATED_CYCLE | componentCount>1 | 2000ms | 예 |
| 7 | MIXED_COMMUTATOR | cycleCount===1 AND componentCount===1 | 300ms | 예 |
| 8 | SETUP | last-resort(candidates.length===0) | 500ms | 아니오 |

## 3. Operating Contract Catalog

| Contract | 값 | 위치 |
|---|---|---|
| `PLAN_TIME_BUDGET_MS` | 1000ms | `fiveByFiveEdgeSolverEngine.ts` |
| `PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS` | 250ms | `fiveByFiveEdgeExecutor.ts` |
| `FIXED_BUDGET_MS`(tryFixWing) | 140ms | `fiveByFiveEdgeExecutor.ts` |
| `REPAIR_RESERVED_SLICE_MS` | 75ms | `fiveByFiveEdgeRecovery.ts` |
| `MIXED_COMMUTATOR_RESERVED_SLICE_MS` | 300ms | `fiveByFiveEdgeRecovery.ts` |
| `SETUP_RESERVED_SLICE_MS` | 500ms | `fiveByFiveEdgeRecovery.ts` |
| `PARITY_GATED_CYCLE_RESERVED_SLICE_MS` | 2000ms | `fiveByFiveEdgeRecovery.ts` |
| `MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS` | 2000ms | `fiveByFiveEdgeRecovery.ts` |

전체 계보(Origin/Integration/Validation Sprint)는
`docs/SOLVER_RESEARCH_CLOSEOUT.md`의 Operating Contract Catalog 참조.

## 4. Validation Procedure

운영 중 코드 변경 여부와 무관하게, 다음 절차로 Solver 상태를 검증한다.

**단발 검증** (변경 직후, 또는 의심 상황 발생 시):

```bash
npx tsx src/customCube/runContinuousValidationNightlyCaptureV1.ts <runId>
```

142케이스 real `solve()` E2E population replay 1회를 실행하고
`solverContinuousValidationFrameworkV1/data/<runId>.json`에 저장한다.

**자동 판정** (2개 실행 결과를 비교해 PASS/FAIL을 자동 산출):

`solverContinuousValidationFrameworkV1/ReleaseGateAutomation.ts`의
`runReleaseGateAutomation(baseline, latest, baselineP95Ms)`을 호출하면
Gate A(Regression)/B(Runtime)/C(Capability) + Contract Drift를 조합한
`overallDecision`(PASS/FAIL/OPEN_QUESTION)을 얻는다.

**Contract Drift만 빠르게 확인**:

`solverContinuousValidationFrameworkV1/ContractDriftMonitor.ts`의
`runContractDriftMonitor()`를 호출하면 코드 재실행 없이(population replay
불필요) 8개 Operating Contract 값이 Baseline과 일치하는지 즉시 확인한다.

## 5. Release Procedure

향후 코드 변경이 생기면, 변경 성격에 따라 다음 Category(이미 확립된
`solverPostReleaseValidationFramework/ChangeClassification.ts`)를 적용한다.

| Category | 설명 | 필요 Gate | 최소 N(prototype/production) |
|---|---|---|---|
| A | Bug Fix | A, C | 10 / 15 |
| B | Performance Optimization | A, B, C | 10 / 30 |
| C | New Primitive | A, B, C, E | 10 / 30 |
| D | Architecture Change | A, B, C, D, E | 15 / 30 |

절차: (1) 변경의 Category 판단 → (2) 해당 Category가 요구하는 Gate만큼
`runReleaseGateAutomation()` 또는 개별 Gate 함수(`ReleaseGates.ts`)로 검증
→ (3) 전부 PASS 시에만 merge/release. Gate D(Operating Contract 유지)는
`ContractDriftMonitor`로 대체 확인 가능. Gate E(Primitive Interaction)는
현재 자동화 범위 밖(§7 참조) — Architecture Change급 변경에는 수동으로
Primitive Interaction Matrix를 재확인해야 한다.

## 6. Failure Response Procedure

| 증상 | 확인 방법 | 대응 |
|---|---|---|
| Regression 의심 (case가 이전보다 악화) | `RegressionTrend.ts`의 `buildRegressionTrend(baseline, latest)` | flipRate가 10% 이상이면 원인 조사 — 어떤 case가 뒤바뀌었는지 `rows.filter(r=>r.flips)`로 특정 |
| Runtime 급증 | `RuntimeDistribution.ts`의 `summarizeRuntimeDistribution()` | p95가 baseline 대비 +15% 초과 시 원인 조사 — `deadlineMissCount`가 baseline 대비 크게(10%+) 증가했는지 우선 확인 |
| Contract Drift 발견 | `ContractDriftMonitor.ts` | `anyDrift=true`인 항목을 특정해 의도한 변경인지 확인 — 의도하지 않았다면 즉시 코드 리뷰 |
| 새로운 실패 유형 발견 | Hole Dataset(`mechanismAnalysis/RawDatasetLoader.ts`)에 없는 새 실패 패턴 | `docs/SOLVER_MAINTENANCE_POLICY.md`의 Event-driven 조건에 해당 — 신규 Sprint 착수 검토 |

## 7. Maintenance Procedure

- 정기 검증: `docs/SOLVER_MAINTENANCE_POLICY.md` 참조(Event-driven, 고정
  스케줄 없음 — 실제 자동 스케줄을 원하면 별도로 명시적 설정 필요).
- 알려진 한계(Known Limitation)는 `docs/SOLVER_RESEARCH_CLOSEOUT.md`의
  Known Limitation Register 참조 — 이미 disclosed된 7건(3건 해결됨, 4건
  운영상 허용) 외 새로운 항목이 반복 관측되면 Maintenance Policy의
  이벤트 조건에 해당한다.
- Gate E(Primitive Interaction) 자동화 공백: 현재 `ReleaseGateAutomation.ts`는
  `solveE2EProbe`의 결과 형태(`chosenType`만 보유) 한계로 Gate E를
  포함하지 않는다. Architecture Change급(Category D) 변경 시에는 반드시
  수동으로 Primitive Interaction Matrix를 재확인해야 한다.
