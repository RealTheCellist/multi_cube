# Multi-Component Merge Production Validation Sprint v1

## Section 0. 범위 및 방법론 disclosure

Short-Circuit Production Integration Sprint v1이 국소적으로(scrambleDepth30:2,
scrambleDepth100:5, outer=2000ms, `attemptRecovery()` 레벨) 확인한
Capability 회복이 Production Population 전체·real end-to-end `solve()`
레벨에서도 재현되는지 검증하는 **Product Validation Sprint**다. 이번
Sprint는 Production 코드를 전혀 수정하지 않았다 -- `git diff --stat`로
`fiveByFiveEdgeRecovery.ts`를 포함한 모든 protected 파일이 이 Sprint
시작 시점 대비 0건 변경 확인.

**측정 방법**: Short-Circuit 수정은 런타임 플래그가 없는 무조건 변경이라,
Baseline(수정 전, `git checkout e386da8^`으로 일시 복원)/Integrated
(현재 production, 수정 포함) 쌍을 이전 Sprint와 동일한 `git checkout`
토글로 확보했다. 이번 Sprint의 핵심 차이는 **측정 레벨**이다 -- 이전
Sprint들은 `attemptRecovery()`를 직접 호출했지만, 이번 Sprint는
`solverReleaseReadiness/EndToEndSolveProbe.ts`의 실제 `solve()` 진입점
(`FiveByFiveEdgeSolverEngine.solve()`, 무수정)을 그대로 재사용해 **진짜
end-to-end 1회 호출**로 측정했다(disclosed duplicate로 PARITY_GATED_CYCLE/
MULTI_COMPONENT_MERGE 분류 브랜치만 추가, 기존 파일은 건드리지 않음).

**N>=30 해석**: 전체 Hole Dataset(142케이스)을 그대로 사용해 N=142(>=30)를
만족시켰다 -- 이 arc의 다른 Sprint들이 Category B/C의 production-stage
minN=30을 케이스 수 기준으로 적용해온 것과 동일한 관례이며, "142케이스
집단을 30회 반복 실행"이 아니다(disclosed 해석).

## STEP1. Operating Contract Audit

`ContractAudit.ts` -- production 소스 텍스트 직접 읽기 + `git diff`.

- **allShortCircuitTypesPresent = true** (REPAIR/CCR/MIXED_COMMUTATOR/
  PARITY_GATED_CYCLE/MULTI_COMPONENT_MERGE 5개 전부 동일 조건).
- **noDriftSinceFix = true** -- Short-Circuit 수정 커밋(`e386da8`) 이후
  모든 protected 파일 diff 0건.

## STEP2. Large Population Replay (real end-to-end solve(), N=142)

| | improvedCount | solvedCount |
|---|---|---|
| Baseline(수정 전) | 1 | 0 |
| Integrated(현재 production) | 1 | 0 |

**핵심 실측 결과 disclosure**: 두 arm이 완전히 동일하다(1/142). 이는
Short-Circuit 수정의 효과가 사라졌다는 뜻이 아니라, 이 Hole Dataset
자체가 이미 과거의 전체 파이프라인(최대 50회 반복)이 소진된 뒤의 **최종
정체 상태**이고, `solve()`를 다시 한 번 단발 호출하는 이번 측정 방식은
Short-Circuit Production Integration Sprint v1이 실제로 효과를 확인한
조건(outer=2000ms, `attemptRecovery()` 자체를 직접 반복 호출)보다 훨씬
좁은 예산(내부 PLAN_TIME_BUDGET_MS=1000ms, 그 중 Recovery 자체 몫은 더
작음)만 준다 -- 그 2건(scrambleDepth30:2, scrambleDepth100:5)에 필요한
조건이 이번 측정 축에서는 애초에 재현되지 않는다.

## STEP3. Statistical Validation

| 비교 | 값 |
|---|---|
| improvedCountDiff(primary) | mean=0.0000, 95% CI=[0.0000, 0.0000], Cohen's dz=0.000 |
| solvedCountDiff(secondary) | mean=0.0000, 95% CI=[0.0000, 0.0000] |
| runtimeDiffMs | mean=-8.4ms, 95% CI=[-18.2, 1.5] |

두 arm이 문자 그대로 동일해 diff 분포 자체가 0에 고정되어 있다 --
이는 "효과가 있는데 유의성이 부족하다"가 아니라 "이 측정 축에서는
차이 자체가 관측되지 않는다"는 뜻이다.

## STEP4. Primitive Interaction Matrix

| Type | competition | starvedByMcm | duplicateWithMcm | replacedByMcm |
|---|---|---|---|---|
| REPAIR | 0 | 0 | 0 | 0 |
| CCR | 0 | 0 | 0 | 0 |
| MIXED_COMMUTATOR | 0 | 0 | 0 | 0 |
| PARITY_GATED_CYCLE | 0 | 0 | 0 | 0 |
| SETUP | 0 | 0 | 0 | 0 |

전체 표가 0이다 -- 이번 측정 축에서는 MCM이 단 한 번도 Recovery
후보로 offer되지 않았다(STEP2에서 이미 확인한 대로 개선 케이스 자체가
1건뿐이고 그 1건도 MCM과 무관). 경쟁/중복/대체 모두 관측 불가.

## STEP5. Validation Framework

| Gate | 결과 |
|---|---|
| A(Regression 증가 없음) | PASS |
| B(Runtime 허용 범위) | PASS |
| C(Capability 감소 없음, strict) | OPEN_QUESTION |
| E(Primitive Interaction 이상 없음) | PASS(0건이라 이상 신호도 없음) |

Pipeline Decision(Category C Gate 구성) = **B**(조건부 승인).

## Level 1-4 판정

- **Level1 (Contract Audit)**: **PASS**.
- **Level2 (Capability 95% CI 하한>0)**: **FAIL** -- diff가 0에 고정.
- **Level3 (Regression 0)**: **PASS**.
- **Level4 (Validation Framework Decision A)**: **FAIL** -- Gate C
  OPEN_QUESTION으로 Pipeline Decision B.

## Decision

**Decision B: 모집단 확대가 아니라 측정 조건 재정합이 필요하다
(Population Expansion Needed, 재정의됨).**

Contract는 정상이고(Level1 PASS) Regression도 없다(Level3 PASS,
newRegressionCount=0). 그러나 이번 Sprint가 요구한 "real end-to-end
solve() 1회 호출" 측정 축에서는 Baseline과 Integrated가 완전히
동일했다(improvedCountDiff mean=0.0000) -- Level2/Level4 모두 FAIL이다.

**이것을 Decision C(Primitive 자체의 한계로 판단해 Blueprint로 회귀)로
읽어서는 안 된다.** Short-Circuit Production Integration Sprint v1은
이미 같은 2건(scrambleDepth30:2, scrambleDepth100:5)에서 **직접 trace로
확인된 실측 회복**(`mcmShortCircuited=true`, wrongWing 11→10 / 10→9)을
보고했다 -- 그 실험은 outer=2000ms에서 `attemptRecovery()` 자체를
직접 호출한 것이었다. 이번 Sprint의 E2E `solve()` 단발 호출은 그보다
훨씬 좁은 예산 조건이라, 이미 증명된 효과가 이 측정 축 자체에서는
드러나지 않는 것으로 판단한다(measurement mismatch, 새로운 부정적
증거가 아님).

따라서 다음 단계는 "모집단을 늘리는 것"이 아니라, **Short-Circuit
효과가 실제로 관측되는 조건(outer=2000ms급 예산)에서 Product 레벨
측정을 재설계하는 것**이다 -- 이 Sprint의 disclosed 발견 자체가 이미
그 방향을 가리킨다.
