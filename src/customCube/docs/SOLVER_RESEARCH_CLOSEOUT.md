# Solver Research Closeout Sprint v1

## 0. Sprint 성격

**Documentation / Consolidation Sprint.** Production Solver, Primitive,
Scheduler, Budget, Validation Framework 어느 것도 수정하지 않는다. 목적은
Primitive Discovery부터 Release 이후 Validation Protocol Standardization까지
이어진 전체 Solver 연구를 공식적으로 종료하는 것이다.

작업 디렉토리: `solverResearchCloseoutV1/` (신규).

## STEP1. Research Inventory Audit — Research Inventory Matrix

실제 커밋된 `docs/*.md` 90개 파일 전체를 `fs.readdirSync()`로 스캔하고,
우선순위 정렬된 키워드 규칙(재현 가능, 파일별 수작업 판단 아님)으로 10개
카테고리에 분류했다:

| 카테고리 | 건수 |
|---|---|
| PRIMITIVE_DISCOVERY | 25 |
| BLUEPRINT | 17 |
| PROTOTYPE | 12 |
| EVALUATION | 4 |
| PRODUCTION_INTEGRATION | 17 |
| VALIDATION | 3 |
| FRAMEWORK | 0 |
| QUALIFICATION | 6 |
| RELEASE | 3 |
| POST_RELEASE | 1 |
| UNCLASSIFIED | 2 |

FRAMEWORK가 0인 이유: Validation Framework를 최초로 확립한 문서
(`SOLVER_POST_RELEASE_VALIDATION_FRAMEWORK.md`)의 파일명이 "POST_RELEASE"와
"VALIDATION_FRAMEWORK"를 동시에 포함하며, 우선순위 규칙상 POST_RELEASE로
분류되었다 — Framework 자체의 확립은 POST_RELEASE 카테고리 안에 포함되어
있다. UNCLASSIFIED 2건(`ARCHITECTURE.md`, `RESEARCH_ARTIFACT_INVENTORY.md`)은
단일 Sprint 유형에 깔끔하게 들어맞지 않는 메타/횡단 문서로, 강제로
분류하지 않고 그대로 남겼다.

## STEP2. Final Architecture Freeze — Solver Final Architecture v1

production 코드(`fiveByFiveEdgeRecovery.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdgePlanner.ts`)를 직접 읽어
확정한 최종 Architecture:

**Recovery Pipeline 기본 순서** (schedulingStrategy=`reservedBudget`,
multiComponentMergeOrder=`AFTER_CCR`, useSetupReservedSlice=true):

| 순서 | Candidate | Gate | Budget | Short-Circuit |
|---|---|---|---|---|
| 1-2 | DISRUPT(light/extended) | genDeadline 공유 | 공유 창 | 아니오 |
| 3 | REPAIR | cycleLength 2-4 AND conflictEdgeCount>0 | 75ms | 예 |
| 4 | CCR | includeCCR flag만 | remainingTime(고정 slice 없음) | 예 |
| 5 | MULTI_COMPONENT_MERGE | componentCount>=3 | 2000ms | 예 |
| 6 | PARITY_GATED_CYCLE | componentCount>1 | 2000ms | 예 |
| 7 | MIXED_COMMUTATOR | cycleCount===1 AND componentCount===1 | 300ms | 예 |
| 8 | SETUP | last-resort(candidates.length===0) | 500ms | 아니오 |

`recoveryEligible = allowRecovery && task.type === "ENDGAME"` — Recovery는
ENDGAME 타입 task에서만 트리거된다.

**Outer Deadlines**: `solve()` 전체 1000ms(고정, 파라미터 아님) /
ENDGAME Recovery Reserve 250ms(`recoveryReserveMsOverride`, 파라미터화됨) /
primary tryFixWing 자체 예산 140ms(고정).

**Validation Framework**: `solverPostReleaseValidationFramework/` —
Gate A-E(경로-무관 제네릭 시그니처), Category A-D(tiered minN).

**Dedicated Budget Primitive Protocol**: MCM Validation Protocol
Standardization Sprint v1이 확정하고 PARITY_GATED_CYCLE Validation
Protocol Qualification Sprint v1이 재확인한 2축 Protocol(attemptRecovery_direct
+ solve_e2e 병행 보고) — 적용 대상 2건(MULTI_COMPONENT_MERGE,
PARITY_GATED_CYCLE) 모두 적용 완료.

## STEP3. Operating Contract Catalog Finalization

9개 실제 Production Contract 전부에 Origin/Integration/Validation Sprint
계보를 기록했다 (전체 표는 `OperatingContractCatalog.ts` 및 실행 리포트
참조). 요약:

| Contract | 값 | 상태 |
|---|---|---|
| ENDGAME Recovery Reserve | 250ms | PRODUCTION_ACTIVE |
| tryFixWing Fixed Budget | 140ms | PRODUCTION_ACTIVE |
| REPAIR Reserved Slice | 75ms | PRODUCTION_ACTIVE |
| CCR Budget Contract | remainingTime | PRODUCTION_ACTIVE |
| Scheduler SETUP Last-Resort | candidates.length===0 | PRODUCTION_ACTIVE |
| SETUP Reserved Slice | 500ms | PRODUCTION_ACTIVE |
| MIXED_COMMUTATOR Reserved Slice | 300ms | PRODUCTION_ACTIVE |
| MULTI_COMPONENT_MERGE Reserved Slice | 2000ms | PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED |
| PARITY_GATED_CYCLE Reserved Slice | 2000ms | PRODUCTION_ACTIVE_PROTOCOL_QUALIFIED |

## STEP4. Validation Standard Consolidation

`solverPostReleaseValidationFramework/ReleaseGates.ts`/
`ChangeClassification.ts`를 직접 코드 감사(정규식 파싱)로 재확인:

- **Gate A-E**: Regression 증가 없음 / Runtime 허용 범위 / Capability
  감소 없음 / Operating Contract 유지 / Primitive Interaction 이상 없음.
- **Category A-D**: Bug Fix(A,C) / Performance Optimization(A,B,C) /
  New Primitive(A,B,C,E) / Architecture Change(A,B,C,D,E), 각각
  prototype/production 2단계 tiered minN.
- **Decision Rule**: 모든 required Gate PASS → Decision A; 하나라도
  FAIL → Decision C; 그 외 → Decision B.
- **Dedicated Budget Primitive Protocols**: MULTI_COMPONENT_MERGE,
  PARITY_GATED_CYCLE 둘 다 Decision A로 공식 채택 완료.

## STEP5. Known Limitation Review

실제 확인된 7개 항목만 기록했다(추측 없음):

| 상태 | 건수 |
|---|---|
| 이미 해결됨(RESOLVED) | 3 |
| 운영상 허용(OPERATIONALLY_ACCEPTED) | 4 |
| 향후 연구 대상(FUTURE_RESEARCH_CANDIDATE) | 0 |

주목할 항목: 이 프로젝트는 과거 한 차례 `PRODUCTION_RELEASE_CLOSEOUT.md`에서
"Production Release Complete, 추가 Primitive 연구는 종료한다"고 선언했으나
이후 CCR/MixedCommutator/MultiComponentMerge/ParityGatedCycle 등 다수의
신규 Primitive 연구가 계속되었다. 이는 거버넌스 교훈으로 기록한다 — 종료
선언은 그 시점까지 확인된 범위에서만 유효하며, 이번 Research Closeout
Sprint v1은 그 교훈을 반영해 실제로 재확인한 뒤 선언한다.

향후 연구가 **필수**로 남은 항목은 없다(FUTURE_RESEARCH_CANDIDATE=0건).

## STEP6. Research Closeout Decision

- **Level1 (모든 Primitive Lifecycle 완료) = PASS**
- **Level2 (Production Release 체계 완료) = PASS**
- **Level3 (운영 단계 전환 가능) = PASS**

### Decision: **A — Solver Research Complete**

Research Inventory(90개 문서) + Final Architecture(8단계 Recovery
Pipeline) + Operating Contract Catalog(9개 Contract 전부 계보 확인) +
Validation Standard(Gate 5개/Category 4개/Dedicated Budget Protocol 2건
모두 Decision A) + Known Limitation Register(7건 전부 RESOLVED 또는
OPERATIONALLY_ACCEPTED) 모두 확인되었다.

## 결론

**본 프로젝트는 Solver Primitive Research Program을 공식 종료하고
Maintenance Mode로 전환한다.** 제안된 Roadmap(①Research Closeout →
②Long-term Reliability Validation → ③Validation Automation →
④Maintenance Transition → ⑤Primitive Discovery Phase 2)의 우선순위①이
Decision A로 완료되었으므로, 다음 자연스러운 단계는 우선순위②
**Solver Long-term Reliability Validation Sprint v1**이다.

## 산출물

- Research Inventory Matrix — `ResearchInventoryMatrix.ts`
- Solver Final Architecture v1 — `FinalArchitecture.ts`
- Operating Contract Catalog — `OperatingContractCatalog.ts`
- Solver Validation Standard — `ValidationStandard.ts`
- Known Limitation Register — `KnownLimitationRegister.ts`
- Research Closeout Decision — `ResearchCloseoutDecision.ts`
- 실행 리포트/결과: `solverResearchCloseoutV1/data/solver-research-closeout-v1-{report.txt,result.json}`
- 드라이버: `runSolverResearchCloseoutV1.ts`

## Protected Files 검증

`git diff --stat` 확인 결과 다음 파일/디렉토리에 대한 diff **없음**:

- `fiveByFiveEdgeRecovery.ts`
- `fiveByFiveEdgePlanner.ts`
- `fiveByFiveEdgeExecutor.ts`
- `fiveByFiveEdgeSolverEngine.ts`
- `fiveByFiveEdges.ts`
- `solverPostReleaseValidationFramework/*`
- 모든 Primitive 구현 파일

이번 Sprint는 Documentation과 read-only 코드 감사만 수행했으며, 위
파일/디렉토리를 한 번도 수정하지 않았다.
