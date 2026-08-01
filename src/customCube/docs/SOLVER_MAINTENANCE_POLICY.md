# Solver Maintenance Policy

## 상태 전환 선언

```
Solver 프로젝트는
Research Mode
에서
Operational Maintenance Mode
로 공식 전환한다.
```

새로운 Sprint를 미리 계획하지 않는다. 아래 조건 중 하나가 **실제로
발생했을 때만** 새 Sprint를 시작한다.

## Event-Driven Maintenance Flow

```
No Active Research
        ↓
Continuous Validation (solverContinuousValidationFrameworkV1)
        ↓
Event Detection
        ↓
Need Investigation?
        ↓
   YES → New Sprint
   NO  → Continue Maintenance
```

## Sprint 재개 조건 (5가지, 이 중 하나라도 실측으로 확인되면 재개)

1. **새로운 Failure Dataset 발견** — 기존 142케이스 Hole Dataset에 없는
   새로운 실패 패턴이 실사용에서 반복 관측됨.
2. **Regression 발생** — `RegressionDashboard.ts`의 트렌드에서 flipRate가
   disclosed 허용 범위(10%)를 초과하거나, `ReleaseGateAutomation.ts`의
   Gate A가 FAIL로 판정됨.
3. **Production Code 변경** — 버그 수정이든 기능 추가든, `fiveByFiveEdgeRecovery.ts`
   /`fiveByFiveEdgePlanner.ts`/`fiveByFiveEdgeExecutor.ts`/
   `fiveByFiveEdgeSolverEngine.ts`/`fiveByFiveEdges.ts` 중 하나라도 실제
   수정이 필요해짐 — 이 경우 `docs/SOLVER_OPERATION_GUIDE.md` §5 Release
   Procedure를 따른다.
4. **새로운 Solver Requirement 추가** — 새로운 퍼즐 규칙, 새로운 목표
   상태, 새로운 성능 요구사항 등 이 Baseline의 범위를 벗어나는 요구가
   생김.
5. **새로운 Primitive 필요성이 실제 데이터로 확인됨** — 추측이 아니라
   `ContractDriftMonitor`/`RegressionDashboard`가 반복적으로 잡아내는
   real 실패 패턴이, 현재 8종 Recovery Primitive로 설명되지 않음이 실측
   데이터로 확인됨.

## 이 조건 중 어느 것도 발생하지 않는 동안

- 오직 **Continuous Validation**만 수행한다(`docs/SOLVER_OPERATION_GUIDE.md`
  §4 Validation Procedure).
- 추측성(speculative) 연구를 새로 시작하지 않는다 — 이 프로젝트가 과거
  한 차례(`PRODUCTION_RELEASE_CLOSEOUT.md`) 조기에 "연구 종료"를 선언한
  뒤 실제로는 15개 이상의 Sprint가 계속된 전례가 있다
  (`docs/SOLVER_RESEARCH_CLOSEOUT.md`의 Known Limitation Register에
  거버넌스 교훈으로 기록됨). 이번에는 그 반대 방향의 실수 — "이벤트
  없이 임의로 새 연구를 시작하는 것" — 를 이 Policy로 명시적으로
  차단한다.

## Decision

```
Decision A
Solver Operations Transition Complete

The Solver project has fully transitioned from
Research Mode
to
Operational Maintenance Mode.

Future work shall be initiated only by
validated operational events
(regression, new failures, or new requirements),
not by speculative research.
```

## 전체 프로젝트 생명주기 (완결)

```
Research
    ↓
Primitive Discovery → Blueprint → Prototype → Evaluation
    ↓
Production Integration → Validation → Qualification → Release
    ↓
Research Closeout
    ↓
Long-term Reliability Validation
    ↓
Continuous Validation Framework
    ↓
Operations Transition   ← 완료 (이 문서)
    ↓
Maintenance Mode (Event-driven)
```
