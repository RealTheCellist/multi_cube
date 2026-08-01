# PARITY_GATED_CYCLE Validation Protocol Qualification Sprint v1

## 0. Sprint 성격

**Validation Qualification Sprint.** Production Solver, Primitive 알고리즘,
Budget Contract, Scheduler, Validation Framework 어느 것도 수정하지 않는다.
목적은 Multi-Component Merge Validation Protocol Standardization Sprint
v1이 새로 발견한 사실 — PARITY_GATED_CYCLE이 MCM과 동일한 2000ms dedicated
budget을 가지지만 실측 검증되지 않았다는 것 — 을 실제 측정으로 검증하는
것이다.

작업 디렉토리: `solverPrimitiveParityGatedCycleValidationProtocolQualification/`
(신규).

## 사전 조사: 실제 known-effect Case 발굴

이전 MCM Sprint들과 달리 PARITY_GATED_CYCLE에 대한 known-effect case는
이 계열 어떤 Sprint에도 기록되어 있지 않았다. 실제 production Gate
(`analyzeConstraints(buildStateGraph(cubies)).componentCount > 1`, real
production 함수 read-only 재사용)로 142개 전체 Hole Dataset을 스캔한 결과
**49개 케이스가 Gate를 통과**했다. 이 49개를 outer=2000ms(PARITY 자신의
명목 budget)로 전수 조사한 결과:

- `offeredCount=4`, `chosenCount=3`, `chosenAndImprovedCount=3`
- 실제 known-effect case 3건: **`worstCase:5e5b20b`, `snapshot335:60b5c3b1`, `snapshot335:ad12c377`**

이 3건을 이번 Sprint의 실측 대상으로 확정했다.

## STEP1. Measurement Path Audit — PARITY Measurement Path Matrix

`fiveByFiveEdgeRecovery.ts`의 실제 코드(줄 540-587, 626-629, 705, 788)를
읽어 확인한 사실:

- **Gate**: `componentCount>1` — MCM보다 관대한 조건. 142케이스 중 49케이스가 통과.
- **Dedicated Slice**: `PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms`, MCM과 동일한 메커니즘(`Math.min(deadline, Date.now()+2000)`).
- **중요한 차이점**: PARITY_GATED_CYCLE은 **이미 `attemptRecovery()`의 short-circuit allowlist에 포함**되어 있다(`best.type === "PARITY_GATED_CYCLE"`, 줄 788). MCM이 겪었던 Short-Circuit Gap 결함이 PARITY에는 애초에 존재하지 않았다.
- **solve_e2e 실측 (이미 커밋된 데이터)**: PARITY_GATED_CYCLE Production Integration Sprint v1(#415-421)의 실제 142케이스 replay가 이미 `parityGatedCycleOfferedCount=0, parityGatedCycleChosenCount=0`을 기록하고 있었다 — MCM의 Production Validation Sprint v1과 정확히 동일한 패턴.

## STEP2. Budget Envelope Analysis

3개 known-effect case에 대해 real 실행으로 측정:

| Case | attemptRecovery_direct@1000ms | attemptRecovery_direct@2000ms | solve_e2e@250ms(real default) |
|---|---|---|---|
| worstCase:5e5b20b | remainingTime=604ms | remainingTime=1589ms | remainingTime=247ms |
| snapshot335:60b5c3b1 | remainingTime=682ms | remainingTime=1605ms | remainingTime=null |
| snapshot335:ad12c377 | remainingTime=614ms | remainingTime=1669ms | remainingTime=null |

## STEP3. Sensitivity Analysis — Capability Sensitivity Curve

attemptRecovery 축(outer=1000/1500/2000/60000ms)은 3개 case 전부 각자의
임계값(1000ms, 1000ms, 1500ms)부터 `improved=true`로 일관되게 나타난다.
solve 축(reserve=250/450/900ms)은 3개 case 전부 250~900ms 전 구간에서
`improved=false`로 전혀 나타나지 않는다.

## STEP4. Measurement Method Comparison

| Case | Method A (attemptRecovery_direct@2000ms) | Method B (solve_e2e@250ms) | Flip |
|---|---|---|---|
| worstCase:5e5b20b | PASS | FAIL | **예** |
| snapshot335:60b5c3b1 | PASS | FAIL | **예** |
| snapshot335:ad12c377 | PASS | FAIL | **예** |

3개 case 전부 Method만 바뀌면 PASS→FAIL이 된다 — MCM과 동일한 패턴이
실측으로 재현되었다.

## STEP5. Applicability Analysis

| 조건 | 판정 | 근거 |
|---|---|---|
| Dedicated Budget Primitive인가 | **PASS** | `PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms` 실제 코드 상수 |
| solve() 기본 Budget Envelope에서 구조적으로 Capability가 숨겨지는가 | **PASS** | 3개 case 전부 solve_e2e에서 `improved=false`(Method B FAIL). effectiveBudget은 null(2건) 또는 247ms(1건, 그러나 필요한 예산에 크게 못 미침) — "예산이 0"이 아니라 "예산이 구조적으로 부족"이 공통 원인 |
| attemptRecovery_direct에서 Capability가 독립적으로 관측되는가 | **PASS** | 3개 case 전부 outer=2000ms에서 `chosenType=PARITY_GATED_CYCLE, improved=true` |

**분류: MCM_PROTOCOL_APPLICABLE**

## STEP6. Validation Protocol Decision

- **Level1 (Measurement Mismatch 존재 + 원인 단일 귀속) = PASS** — Budget Envelope 증거 + Sensitivity 증거(독립적인 두 실측) 모두 동일한 결론을 가리키며, MCM이 겪은 Short-Circuit Gap은 PARITY에는 애초에 없었음이 확인되어 대안 원인이 배제된다.
- **Level2 (attemptRecovery_direct에서 Capability 존재) = PASS** — 3/3 case.
- **Level3 (Protocol 필요성 실측 입증) = PASS** — Applicability Analysis 3개 조건 전부 충족.
- **frameworkCompatible = true** — Multi-Component Merge Validation Protocol Standardization Sprint v1이 이미 확인한 Gate A/B/C/E의 경로-무관 제네릭 시그니처가 PARITY_GATED_CYCLE에도 그대로 적용된다.

### Decision: **A — PARITY_GATED_CYCLE Validation Protocol 공식 채택**

### Root Cause

solve_e2e의 real production 기본값(recoveryReserveMsOverride=250ms)에서는
PARITY_GATED_CYCLE이 Recovery 트리거 자체에 도달하지 못하거나(2/3 case)
도달해도 필요한 예산에 크게 못 미쳐(1/3 case, 247ms) Capability가 전혀
관측되지 않는다. 반면 attemptRecovery_direct에서는 real production 기본
outer deadline(1000ms) 부근에서부터 3개 case 전부 각자의 임계값에서
Capability가 확인된다. 이는 MCM과 정확히 동일한 Budget Envelope 불일치이며,
독립적인 두 실측(Budget Envelope, Sensitivity)이 이를 재확인한다.

## 전체 성공 기준 (Level1-6)

| Level | 기준 | 판정 |
|---|---|---|
| Level1 | Measurement Path Audit | PASS |
| Level2 | Budget Envelope 분석 | PASS |
| Level3 | Sensitivity Analysis | PASS |
| Level4 | Method Comparison | PASS |
| Level5 | Applicability Analysis | PASS |
| Level6 | Validation Protocol Decision (Decision A) | PASS |

## 결론

**PARITY_GATED_CYCLE은 MCM과 동일한 수준의 운영 표준(Operational
Standard)으로 승격할 수 있다.** 이번 Sprint의 실측 근거로 확정한다:

1. PARITY_GATED_CYCLE의 Capability는 실제로 존재한다(attemptRecovery_direct에서 3/3 case 확인).
2. solve() 기본 Budget Envelope에서는 구조적으로 관측되지 않는다(3/3 case Method B FAIL, 이미 커밋된 Production Integration Sprint v1의 population 전체 데이터와 일치).
3. MCM Validation Protocol(Capability Validation + Product Validation 병행 보고)이 PARITY_GATED_CYCLE에도 동일하게 적용되어야 한다.
4. 기존 Validation Framework는 수정할 필요가 없다.

이로써 Solver 연구의 Dedicated Budget Primitive 축(MCM, PARITY_GATED_CYCLE)이
모두 동일한 Validation Protocol 아래 공식적으로 관리된다.

## 산출물

- PARITY Measurement Path Matrix — `MeasurementPathAudit.ts`
- Budget Envelope Table — `BudgetEnvelopeAnalysis.ts`
- Capability Sensitivity Curve — `SensitivityAnalysis.ts`
- Method Comparison Matrix — `MethodComparison.ts`
- Applicability Analysis — `ApplicabilityAnalysis.ts`
- Validation Protocol Decision — `ValidationProtocolDecision.ts`
- 실행 리포트/결과: `solverPrimitiveParityGatedCycleValidationProtocolQualification/data/parity-gated-cycle-validation-protocol-qualification-v1-{report.txt,result.json}`
- 드라이버: `runParityGatedCycleValidationProtocolQualificationV1.ts`

## Protected Files 검증

`git diff --stat` 확인 결과 다음 파일/디렉토리에 대한 diff **없음**:

- `fiveByFiveEdgeRecovery.ts`
- `fiveByFiveEdgePlanner.ts`
- `fiveByFiveEdgeExecutor.ts`
- `fiveByFiveEdgeSolverEngine.ts`
- `fiveByFiveEdges.ts`
- `solverPostReleaseValidationFramework/*`
- 모든 Primitive 구현 파일

이번 Sprint는 read-only 코드 감사와 real 계측 probe 실행만 수행했으며,
위 파일/디렉토리를 한 번도 수정하지 않았다.
