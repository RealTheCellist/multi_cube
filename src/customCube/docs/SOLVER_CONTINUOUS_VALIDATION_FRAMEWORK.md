# Solver Continuous Validation Framework Sprint v1

## 0. Sprint 성격

Roadmap 우선순위②. Production Solver, Primitive, Scheduler, Budget,
Validation Framework 어느 것도 수정하지 않는다. 목적은 Solver를 더 좋게
만드는 것이 아니라, **앞으로도 지금 수준을 유지하도록 감시 체계를
코드로 만드는 것**이다.

작업 디렉토리: `solverContinuousValidationFrameworkV1/` (신규).

## STEP1. Validation Policy 정의

기존에 매번 사람이 손으로 짜던 검증을 5개 표준 항목으로 고정했다:

| 항목 | 빈도 | 재사용 모듈 |
|---|---|---|
| Regression Validation | per-run-pair | RegressionTrend.ts + ReleaseGates.ts(Gate A) |
| Runtime Validation | per-run-pair | RuntimeDistribution.ts + ReleaseGates.ts(Gate B) |
| Contract Drift Validation | per-run | ContractDriftMonitor.ts |
| Determinism Spot Check | 분기별 표본 점검(매 Nightly 강제 아님, 비용 disclosed) | DeterminismAnalysis.ts |
| Release Gate Validation | per-run-pair | ReleaseGateAutomation.ts (Gate A/B/C + Contract Drift 조합) |

각 항목은 이전 Sprint들이 이미 검증한 real 모듈을 그대로 재사용한다 —
새 통계/측정 로직은 만들지 않았다.

## STEP2. Nightly Validation 실행 (실제 3회)

`NightlyValidationRunner.ts`가 real 142케이스 population replay 1회를
"Nightly Validation" 단위 작업으로 정의한다. 이번 Sprint는 이를 **실제로
3회** 실행했다 — Long-term Reliability Validation Sprint v1이 이미
커밋한 run1/run2를 처음 두 실행으로 재사용하고, 이번 Sprint에서 real
run3을 새로 실행했다.

**주의**: 이 Sprint는 실제 무기한 반복되는 cron/Routine을 설치하지
않았다 — 반복 실행이 발생시키는 실제 리소스 소비와, 손쉽게 되돌릴 수
없는 백그라운드 자동화라는 두 가지 이유로, 실제 활성화 여부는 사용자
확인 후 별도로 결정하는 것이 맞다고 판단했다(자세한 내용은 결론 참조).

## STEP3. Regression Dashboard

`RegressionDashboard.ts`가 3개 실행을 누적해 트렌드를 계산했다:

| Run | Improved | Solved | Runtime p95 | Deadline Miss | RegressionVsPrevious |
|---|---|---|---|---|---|
| run1 | 1 | 0 | 1195ms | 59 | N/A(첫 실행) |
| run2 | 1 | 0 | 1254ms | 58 | 0 |
| run3 | 1 | 0 | 1165ms | 50 | 0 |

3개 실행 모두 Regression 0건, Runtime/Deadline Miss는 자연스러운
run-to-run 변동 범위 내에서 안정적이다.

## STEP4. Contract Drift Monitor

Solver Research Closeout Sprint v1이 Freeze한 8개 Operating Contract 값을
production 코드에서 다시 읽어 비교했다 — **8개 전부 drift 없음
(status=PASS)**.

## STEP5. Release Gate Automation

`ReleaseGateAutomation.ts`가 `ReleaseGates.ts`의 실제 Gate A(Regression)/
B(Runtime)/C(Capability) 함수와 Contract Drift Monitor를 조합해 run3(최신)
vs run2(기준)를 자동 판정했다:

- Gate A(Regression) = **PASS** (diff mean=0.000)
- Gate B(Runtime) = **PASS** (diff mean=-15.5ms, CI 내)
- Gate C(Capability) = **PASS** (diff mean=0.00, 감소 없음)
- Contract Drift = **PASS**
- **overallDecision = PASS**

**Disclosed scope 축소**: Gate D는 Contract Drift Monitor가 대신
커버한다(동등한 커버리지, 다른 호출 형태). Gate E(Primitive Interaction,
duplicate/starved count)는 이번 자동화에 포함하지 않았다 — `solveE2EProbe`가
반환하는 결과 형태(`chosenType`만 있음)에는 Gate E가 필요로 하는 후보별
offer 목록이 없기 때문이다. 향후 필요하면 `onEvent` 계측이 있는 probe로
교체해야 한다.

## STEP6. Framework Decision

- **Level1 (Nightly Validation Framework 구축) = PASS** — Policy 5개 항목
  정의 + 실제 3회 실행 확인
- **Level2 (Regression Dashboard 생성) = PASS** — 3개 실행 누적 + 트렌드
  계산 정상 작동
- **Level3 (Contract Drift Monitor 구축) = PASS** — 실행 및 real 상태
  반환 확인
- **Level4 (Release Gate Automation 적용) = PASS** — 실제 Gate 조합
  판정 산출 확인

### Decision: **A — Continuous Validation Framework Complete**

## 결론

Roadmap이 제안한 4단계(Validation Policy, Nightly Validation, Regression
Dashboard, Contract Drift Monitor, Release Gate Automation)를 전부 real
코드와 real 실행으로 구축했다. 이제 향후 어떤 변경이 생기더라도, 이번
Sprint가 만든 `runReleaseGateAutomation()` 한 번 호출로 자동 PASS/FAIL
판정을 받을 수 있다.

**실제 반복 자동화(Nightly cron/Routine) 활성화에 대해**: 이 Sprint는
"Nightly Validation을 실행할 수 있는 코드"를 real로 만들고 검증했지만,
**실제로 매일 자동 실행되는 스케줄을 걸지는 않았다**. 이는 되돌리기
어려운 백그라운드 자동화이자 반복적인 리소스 소비를 수반하는 결정이라,
명시적 확인 없이 임의로 활성화하지 않는 것이 안전하다고 판단했다.
원하면 이 세션이 가진 스케줄링 도구로 실제 Nightly Routine을 설정할 수
있다 — 원하는 주기(예: 매일 1회)를 알려주면 그때 설정하겠다.

## 산출물

- Validation Policy — `ValidationPolicy.ts`
- Nightly Validation Runner — `NightlyValidationRunner.ts` (+ `run3.json`)
- Regression Dashboard — `RegressionDashboard.ts`
- Contract Drift Monitor — `ContractDriftMonitor.ts`
- Release Gate Automation — `ReleaseGateAutomation.ts`
- Framework Decision — `FrameworkDecision.ts`
- 실행 리포트/결과: `solverContinuousValidationFrameworkV1/data/solver-continuous-validation-framework-v1-{report.txt,result.json}`
- 드라이버: `runContinuousValidationNightlyCaptureV1.ts`(단일 Nightly 실행),
  `runSolverContinuousValidationFrameworkV1.ts`(전체 집계)

## Protected Files 검증

`git diff --stat` 확인 결과 다음 파일/디렉토리에 대한 diff **없음**:

- `fiveByFiveEdgeRecovery.ts`
- `fiveByFiveEdgePlanner.ts`
- `fiveByFiveEdgeExecutor.ts`
- `fiveByFiveEdgeSolverEngine.ts`
- `fiveByFiveEdges.ts`
- `solverPostReleaseValidationFramework/*`
- 모든 Primitive 구현 파일

이번 Sprint는 read-only 코드 감사와 real 반복 실행만 수행했으며, 위
파일/디렉토리를 한 번도 수정하지 않았다.
