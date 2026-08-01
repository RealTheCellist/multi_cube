# Multi-Component Merge Validation Protocol Standardization Sprint v1
## (Protocol Formalization)

## 0. Sprint 성격

**Documentation / Framework Extension Sprint.** Production Solver, Validation
Framework, Primitive 어느 것도 수정하지 않는다. 목적은 Validation Methodology
Qualification Sprint v1에서 확인된 결론(MCM의 Capability는 실제 존재하지만
`solve_e2e` 경로에서는 구조적으로 관측되지 않는다)을 향후 재사용 가능한
공식 운영 표준(Operational Standard)으로 문서화하는 것이다.

작업 디렉토리: `solverPrimitiveMultiComponentMergeValidationProtocol/` (신규).

## STEP1. Validation Scope Definition — Validation Scope Matrix

`ValidationScopeMatrix.ts`가 정의한 두 축:

| Axis | Path | Purpose | Budget Requirement |
|---|---|---|---|
| **Capability Validation** | `attemptRecovery_direct` | Primitive 자체의 Capability(net-improving 여부)를 격리된 조건에서 검증 | outer deadline >= 검증 대상 Primitive의 `RESERVED_SLICE_MS` |
| **Product Validation** | `solve_e2e` | 실제 최종 사용자가 겪는 완전한 Production Contract 하에서의 실사용 영향 검증 | `PLAN_TIME_BUDGET_MS=1000ms` 고정 + `recoveryReserveMsOverride`(기본 250ms) |

두 축 모두 이전 Sprint들이 실제로 실행/검증한 결과를 근거로 삼는다 (Short-Circuit
Production Integration Sprint v1, Multi-Component Merge Production Validation
Sprint v1, Validation Methodology Qualification Sprint v1).

## STEP2. Protocol Definition — Validation Flow

`ProtocolDefinition.ts`가 정의한 4단계 공식 절차. 각 단계는 이미 커밋된 실제
모듈을 그대로 재사용하며, 이번 Sprint에서 새로 만든 측정 메커니즘은 없다:

1. **Capability Validation** → `SharedProbes.ts`의 `attemptRecoveryTimelineProbe()`
   (Validation Methodology Qualification Sprint v1이 이미 실행/검증)
2. **Regression Validation** → `RegressionAudit.ts`의 `auditRegression()`
   (Short-Circuit Production Integration Sprint v1이 이미 실행/검증,
   newRegressionCount=0 확인됨)
3. **Product Validation** → `EndToEndSolveProbe.ts` + `PopulationReplay.ts`
   (Multi-Component Merge Production Validation Sprint v1이 이미 실행/검증)
4. **Release Decision** → `solverPostReleaseValidationFramework`의
   `ReleaseGates.ts`/`ChangeClassification.ts`/`ValidationPipeline.ts`
   (전부 기존 그대로, 수정 없음)

**핵심 규칙**: MCM 계열은 Product Validation 단독 결과(예: `improvedCountDiff
mean=0`)만으로 Decision C(효과 없음)를 내리지 않는다. Capability Validation이
PASS인데 Product Validation만 OPEN_QUESTION/FAIL이면, 원인을 Budget Envelope
불일치로 우선 의심하고 Sensitivity Analysis로 재확인한다.

## STEP3. KPI Mapping

`KpiMapping.ts`가 정의한 6개 KPI:

| Tier | KPI | Role | Real Field Source |
|---|---|---|---|
| Capability | improvedCount | Primary | `AttemptRecoveryProbeResult.improved` |
| Capability | chosenType | Secondary | `AttemptRecoveryProbeResult.chosenType` |
| Capability | wrongWingReduction | Secondary | `wrongWingBefore - wrongWingAfter` |
| Product | solvedCount | Primary | `EndToEndSolveResult.solved` |
| Product | runtime | Secondary | `PairwiseComparison.runtimeDiffMs` |
| Product | regression | Secondary | `ReplayOutcome.trueRegression` |

제안되었으나 이번 Sprint에서 채택하지 않은 KPI: **Recovered Improvement
Before Deadline (RIBD)** (Validation Methodology Qualification Sprint v1
STEP4 origin, Framework 자체는 미수정).

## STEP4. Applicability Analysis — 실측 코드 감사

`ApplicabilityAnalysis.ts`가 `fiveByFiveEdgeRecovery.ts`/
`fiveByFiveEdgeExecutor.ts`의 real `RESERVED_SLICE_MS` 상수를 직접 읽어(
ContractAudit.ts와 동일한 disclosed-audit 패턴, 수정 없이 읽기만 함) 7개
Recovery Primitive 전체를 분류했다:

| Primitive | dedicatedBudgetMs | Recovery Reserve(250ms) 초과 | 실측 Capability 확인 | Applicability |
|---|---|---|---|---|
| DISRUPT | 없음(genDeadline 공유) | - | CONFIRMED | Product Validation 충분 |
| REPAIR | 75ms | 아니오 | CONFIRMED | Product Validation 충분 |
| CCR | 없음(remainingTime 계약) | - | CONFIRMED | Product Validation 충분 |
| MIXED_COMMUTATOR | 300ms | 예 | CONFIRMED | Product Validation 충분 |
| SETUP | 500ms | 예 | CONFIRMED | Product Validation 충분 |
| **PARITY_GATED_CYCLE** | **2000ms** | 예 | **UNKNOWN_NEEDS_CHECK** | **구조적 위험군(미검증)** |
| MULTI_COMPONENT_MERGE | 2000ms | 예 | NOT_CONFIRMED (Product 축에서) | **MCM Protocol 필요** |

### 중요한 실측 발견

Directive 자신의 예시 목록("예)")은 최종 확정된 분류가 아니었다 — 실제 코드
감사 결과:

1. **PARITY_GATED_CYCLE이 MCM과 정확히 동일한 2000ms dedicated budget을
   가지고 있음**이 이번 Sprint에서 새로 발견되었다. Directive의 적용
   대상/비대상 예시 어느 목록에도 PARITY_GATED_CYCLE이 언급되지 않았다.
   구조적으로 MCM과 동일한 위험군이지만, 이 Sprint의 범위(Production 실행
   없음)에서는 실제 `attemptRecovery_direct`/`solve_e2e` 비교 실측을
   수행하지 않았으므로 `MCM_PROTOCOL_REQUIRED`로 단정하지 않고
   `STRUCTURALLY_AT_RISK_UNVERIFIED`로 명시적으로 남겨, 향후 별도 실측
   Sprint의 후보로 지정한다.
2. **SETUP(500ms)과 MIXED_COMMUTATOR(300ms)는 산술적으로는 250ms Recovery
   Reserve를 초과**하지만, 각각의 Production Integration/Validation
   Sprint(#345-347, #355-357, #368-373)가 이미 real `solve()` E2E로
   Capability를 실측 확인했고 후속 Measurement Mismatch Sprint가 발생하지
   않았다. 따라서 "명목 budget이 Recovery Reserve를 초과하는가"라는 단순
   산술 기준이 아니라, **"실측으로 solve_e2e에서 Capability가 이미 확인된
   이력이 있는가"**가 진짜 판정 기준임이 이번 Sprint에서 확정되었다.

## STEP5. Compatibility Audit — 실측 코드 감사

`CompatibilityAudit.ts`가 `ReleaseGates.ts`/`ChangeClassification.ts`
소스를 정규식으로 직접 읽어 확인한 결과:

- `evaluateGateA/B/C/E` 4개 함수 전부 `MetricEvaluation`/`KpiSnapshot`
  기반의 제네릭 시그니처를 사용한다 — `attemptRecovery_direct`나
  `solve_e2e` 어느 쪽 출처의 비교 결과든 동일한 함수에 그대로 입력 가능하다
  (경로 특정 타입에 전혀 종속되지 않음).
- Category C의 `requiredGates=[A,B,C,E]`가 Directive 자신이 요구한 Gate
  목록과 정확히 일치하며, 이는 Short-Circuit/Production Validation Sprint
  양쪽 모두 이미 Category C로 분류해 사용한 실제 전례와도 일치한다.

**`frameworkModificationRequired = false`** — Validation Framework 자체
(Gate 정의, Category 정의)는 수정할 필요가 없음이 코드 감사로 확인되었다.

## STEP6. Standardization Decision

- **Level1 (Validation Protocol 정의) = PASS** — 2개 축, 4단계 흐름이 순서대로
  완전히 정의됨.
- **Level2 (기존 Framework와 충돌 없음) = PASS** — Compatibility Audit
  `frameworkModificationRequired=false`.
- **Level3 (향후 재사용 가능) = PASS** — Validation Flow의 4단계 전부
  이미 커밋되어 검증된 실제 모듈만 인용하며, 새 인프라를 발명할 필요가 없다.

### Decision: **A — MCM Validation Protocol 공식 채택**

Validation Scope(2축) + Validation Flow(4단계) + Applicability(7개 Primitive
전체 분류) + Compatibility(Gate A/B/C/E 전부 generic, Category C
requiredGates 일치) 모두 실측/코드 감사로 확인되었다.

## 결론

MCM 연구는 다음 4단계를 모두 완료했다:

1. **Primitive 연구 완료** (Blueprint → Prototype → Comparative Selection)
2. **Production Integration 완료** (Recovery 레이어 배선 + Short-Circuit
   Contract 수정)
3. **Validation Methodology 완료** (Measurement Mismatch의 단일 원인 규명)
4. **Validation Protocol 표준화 완료** (이번 Sprint)

이후 MCM은 새로운 연구 대상이 아니라 **운영 표준(Operational Standard)**으로
관리된다. 향후 유사한 Dedicated Budget Primitive(구체적으로는 이번 Sprint가
새로 발견한 **PARITY_GATED_CYCLE** — 동일한 2000ms 예산을 가진 미검증
후보)에도 동일한 Validation Protocol(Capability Validation +
Product Validation 병행 보고)을 적용할 수 있다.

## Open Follow-up

- **PARITY_GATED_CYCLE**: MCM과 동일한 2000ms dedicated budget을 가지므로
  구조적으로 동일한 Measurement Mismatch 위험군이다. 별도의 실측
  Validation Methodology Sprint(이번 Sprint가 MCM에 대해 수행한 것과 동일한
  절차)가 필요한 후보로 명시적으로 남긴다.

## 산출물

- Validation Scope Matrix — `ValidationScopeMatrix.ts`
- Validation Flow — `ProtocolDefinition.ts`
- KPI Mapping Table — `KpiMapping.ts`
- Applicability Matrix — `ApplicabilityAnalysis.ts` (real 코드 감사)
- Compatibility Report — `CompatibilityAudit.ts` (real 코드 감사)
- Standardization Decision — `StandardizationDecision.ts`
- 실행 리포트/결과: `solverPrimitiveMultiComponentMergeValidationProtocol/data/multi-component-merge-validation-protocol-standardization-v1-{report.txt,result.json}`
- 드라이버: `runMultiComponentMergeValidationProtocolStandardizationV1.ts`

## Protected Files 검증

`git diff --stat` 확인 결과 다음 파일/디렉토리에 대한 diff **없음**:

- `fiveByFiveEdgeRecovery.ts`
- `fiveByFiveEdgePlanner.ts`
- `fiveByFiveEdgeExecutor.ts`
- `fiveByFiveEdgeSolverEngine.ts`
- `fiveByFiveEdges.ts`
- `solverPostReleaseValidationFramework/*`
- 모든 Primitive 구현 파일

이번 Sprint는 문서화 및 기존 코드에 대한 read-only 감사만 수행했으며,
위 파일/디렉토리를 한 번도 수정하지 않았다.
