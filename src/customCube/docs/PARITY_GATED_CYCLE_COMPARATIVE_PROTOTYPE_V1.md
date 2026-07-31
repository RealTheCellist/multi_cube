# Parity-Gated Cycle Comparative Prototype Sprint v1

## Section 0. 범위 및 방법론 disclosure

이번 Sprint는 Alternative Blueprint Sprint v1의 Pareto Frontier에
동점으로 남았던 두 후보(Dual Wing Bridge, Multi-Component Merge)를
**실제로 구현**해 동일 조건에서 비교했다. Production Solver는 전혀
수정하지 않았다 -- 보호 파일(`fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdges.ts`,
`solverV2Prototype/DeferredValidator.ts`,
`solverV2Prototype/MultiCycleAnalyzer.ts`) `git diff --stat` 결과
0건 변경 확인.

두 Prototype 모두:
- 기존 BFS(`bfsMoveWingToPosition`), Component Detection
  (`detectComponents`), Deferred Validation(`validateDeferred`)을
  수정 없이 재사용.
- genParityGatedCycle()과 동일한 단일 호출 구성(Bridge→Traversal→
  Cleanup→Final Validation)을 그대로 사용 -- 새 Scheduler 없음.
- **동일한 Dataset(전체 142-case Hole Dataset), 동일한 Budget(2000ms
  reserved slice), 동일한 Validation Pipeline**에서 평가.

## STEP1/2. Prototype 구현

- **Dual Wing Bridge** (170줄): forward(compX wing → compY slot)와
  backward(compY wing → compX slot) 두 단일-wing BFS 이동을 각각
  독립적으로 찾은 뒤 하나의 move sequence로 결합해, 결합된 결과가
  두 컴포넌트를 병합하는지 확인. 기존 `generateBridgeCandidates()`가
  이미 병합-필터링된 후보만 반환해 raw 후보를 얻을 수 없었으므로,
  별도의 `findRawBridgeMoves`(private `candidatesForDirection`의
  disclosed duplicate)를 작성해야 했다.
- **Multi-Component Merge** (143줄): componentCount>2일 때 가장 큰
  두 컴포넌트를 반복적으로 병합 -- 기존 `generateBridgeCandidates()`를
  수정 없이 반복 호출하는 오케스트레이션만 추가. componentCount==2인
  케이스는 현재 Primitive와 동일하게 단일 Bridge로 대체(공정한 비교
  위해).

## STEP3. Capability Benchmark (3-arm, 전체 142-case 실제 Replay)

| Arm | improvedCount | regressionCount | avgRuntimeMs |
|---|---|---|---|
| Baseline | 0 (정의상) | 0 | - |
| Dual Wing Bridge | **11/142** | 0 | 492.9 |
| Multi-Component Merge | **13/142** | 0 | 528.5 |

두 Prototype 모두 **regression 0건** -- 안전하게 개선만 발생.

(disclosed 관찰: `multiMergeStepsSucceededTotal=12`(성공한 병합
스텝 수)인데 `multiComponentReductionTotal=0`(전체 컴포넌트 수 순감소)
-- 이는 이 아크에서 이미 문서화된 현상과 일치한다: 하나의 face turn이
겨냥한 두 컴포넌트를 병합해도, 동시에 다른 곳에서 collateral로 새
컴포넌트가 생겨 전역 카운트가 상쇄될 수 있다. Capability 판정은
componentCount가 아니라 `wrongWingCount` 기반 `finalWrong` 개선
여부로 이루어지므로 이 현상이 결과의 신뢰성에 영향을 주지 않는다.)

## STEP4. Statistical Validation (95% CI, Cohen's d — 원시 count 아님)

| 비교 | improvedCountDiff mean | 95% CI | Cohen's dz |
|---|---|---|---|
| Dual vs Baseline | 0.0775 | **[0.0333, 0.1216]** | 0.289 (small) |
| Multi vs Baseline | 0.0915 | **[0.0439, 0.1392]** | 0.316 (small) |
| Dual vs Multi | -0.0141 | [-0.0335, 0.0054] | -0.119 (negligible) |

Dual/Multi 둘 다 Baseline 대비 **95% CI가 0을 포함하지 않아
통계적으로 유의미**하다. 그러나 **Dual vs Multi 직접 비교는 CI가
0을 포함**해, 둘 중 어느 쪽이 더 낫다고 통계적으로 말할 수 없다.
regressionCountDiff는 세 비교 전부 정확히 0 -- 안전성 차이도 없다.

## STEP5. Architecture Impact (실제 구현 기반)

| 후보 | 코드 줄 수 | 기존 Candidate Generator 재사용 | Planner/Recovery 변경 | avgRuntimeMs |
|---|---|---|---|---|
| Dual Wing Bridge | 170 | 아니오(신규 raw finder 필요) | 0 / 0 | 492.9 |
| Multi-Component Merge | 143 | 예(그대로 반복 호출) | 0 / 0 | 528.5 |

Multi-Component Merge가 코드량이 적고(27줄 적음) 기존 함수를 그대로
재사용해 통합 난이도가 약간 더 낮다. 둘 다 Planner/Recovery 레이어
변경이 전혀 필요 없다(genParityGatedCycle()과 동일한 단일 호출 구성).

## STEP6. Prototype Selection

- dualSignificantlyBeatsBaseline = **true**
- multiSignificantlyBeatsBaseline = **true**
- dualVsMultiDistinguishable = **false**
- winner = NONE

**finalDecision = B. Hybrid Primitive Blueprint Sprint v1**

두 Prototype 모두 Baseline 대비 통계적으로 유의미하게 개선하지만,
직접 비교에서 통계적으로 구분되지 않는다 -- 둘 중 하나를 버리고
단일 후보를 확정할 근거가 없다. 두 메커니즘을 결합하는 Hybrid
Primitive Blueprint 설계로 진행할 것을 제안한다.

### Level 1-3

- **Level1(두 Prototype 구현 완료)**: PASS.
- **Level2(통계적으로 비교 완료)**: PASS -- 3개 pairwise 비교
  전부 95% CI/Cohen's d 기준으로 완료.
- **Level3(Production Integration 대상 하나 확정)**: PARTIAL/FAIL --
  단일 후보로 좁혀지지 않음(Decision B).

## 결론

Dual Wing Bridge(11/142 개선)와 Multi-Component Merge(13/142 개선)
모두 Baseline 대비 통계적으로 유의미하고(95% CI가 0을 배제), 안전하다
(regression 0건). 그러나 두 메커니즘을 직접 비교하면 통계적으로
구분되지 않는다(CI가 0을 포함) -- 이는 후보가 부족해서가 아니라 두
메커니즘이 진짜로 비슷한 수준의 개선을 제공한다는 신호다. Architecture
Impact 상 Multi-Component Merge가 약간 더 가볍지만, Capability
차이가 통계적으로 확정되지 않은 이상 이를 근거로 단일 후보를 선택하는
것은 원시 count 기반 판단이 되어 이번 Sprint의 검증 원칙에 어긋난다.
다음 단계는 두 메커니즘을 결합한 Hybrid Primitive Blueprint 설계다.
