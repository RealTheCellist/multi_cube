# Parity-Gated Cycle Alternative Primitive Blueprint Sprint v1

## Section 0. 범위 및 방법론 disclosure

이번 Sprint는 **설계(Blueprint)만 수행하고 아무 알고리즘도 구현하지
않는다.** Production Solver, 기존 Primitive 알고리즘
(`BridgeCandidateGeneration.ts`/`MultiCycleTraversal.ts`/
`BridgeRemoval.ts`/`ComponentDetection.ts`) 전부 미변경(읽기 전용
재사용). 보호 파일(`fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdges.ts`,
`solverV2Prototype/DeferredValidator.ts`,
`solverV2Prototype/MultiCycleAnalyzer.ts`) `git diff --stat` 결과
0건 변경 확인.

목적: Prototype Refinement Sprint v1의 결론("단일 wing 재배치 기반
Bridge 메커니즘은 구조적으로 한계가 있다")을 검증하고, 이를 대체할
새 Primitive Architecture 후보를 설계·비교해 다음 구현 대상을
좁히는 것.

STEP4의 "이론적 % 추정"은 실제 알고리즘 없이는 정확히 측정할 수 없으므로,
가능한 부분(componentCount 분포 등)은 **실제 재계산한 실측 데이터**로
그라운딩하고, 나머지는 신뢰도 등급(grounded/qualitative/speculative)을
명시해 추정치의 한계를 투명하게 공개했다.

## STEP1. Existing Primitive Failure Model

현재 파이프라인을 7단계로 모델링하고, 이전 두 Sprint의 실측 실패율을
각 단계에 매핑:

| 단계 | 실측 실패율 | 출처 |
|---|---|---|
| Input(Gate) | 65.5% | Architecture Analysis Sprint STEP6 (전체 142건 기준) |
| Single Wing Selection | N/A(병목 아님, 무제한 확장해도 회복률 0%) | Prototype Refinement Sprint STEP4 |
| Bridge Candidate(BFS) | N/A(병목 아님, 경로는 거의 항상 발견됨) | Prototype Refinement Sprint STEP2 |
| **Validation(targetedComponentsMerged)** | **75.6%** | Prototype Refinement Sprint STEP1/2 -- 핵심 병목 |
| Multi-Cycle Traversal | 19.5% | Prototype Refinement Sprint STEP1/3 |
| Cleanup | 미측정 | - |
| Final Validation | 0% | Prototype Refinement Sprint STEP1 |

결론: 실패는 "이동 경로를 못 찾아서"가 아니라 "이동해도 의도한 두
컴포넌트가 병합되지 않아서"에 압도적으로 집중된다.

## STEP2. Alternative Mechanism Survey (4개 후보)

1. **Dual Wing Bridge** -- wing 2개를 동시에 재배치해 collateral
   무효화에 대한 "이중 보험" 구조 확보.
2. **Bridge Chain** -- 실패한 이동도 실제로 적용하며 반복 시도.
3. **Temporary Expansion** -- 즉시 병합 대신 "병합까지의 거리" 척도로
   점진적 접근 허용(척도 자체가 미설계).
4. **Multi-Component Merge** -- 2개가 아니라 3개 이상의 컴포넌트를
   동시에 병합 대상으로.

## STEP3. Structural Feasibility

| 후보 | Planner | Recovery | Primitive | BFS | Production 수정 필요 |
|---|---|---|---|---|---|
| Dual Wing Bridge | none | low | high | medium | 불필요(Prototype만) |
| Bridge Chain | none | medium | medium | none | 필요(`fiveByFiveEdgeRecovery.ts`) |
| Temporary Expansion | low | high | high | low | 미확정(설계 미성숙) |
| Multi-Component Merge | none | low | high | medium | 불필요(Prototype만) |

## STEP4. Counterfactual Capability Analysis (실측 그라운딩)

41개 실패 케이스 재계산: **componentCount==2가 35건(85.4%)**,
**componentCount>2가 6건(14.6%)**.

| 후보 | 적용 가능 모집단 | 이론적 추정 범위 | 신뢰도 |
|---|---|---|---|
| Dual Wing Bridge | 100% | 3.6% ~ 15% | qualitative |
| Bridge Chain | 100% | 0% ~ 20% | speculative |
| Temporary Expansion | 100% | 0% ~ 20% | speculative |
| Multi-Component Merge | **14.6%(실측 상한)** | 0% ~ 14.6% | **grounded** |

Multi-Component Merge는 설령 100% 성공해도 14.6%를 넘을 수 없다는
것이 실측으로 확정된 유일한 후보다. 나머지 3개는 100% 인구에 적용
가능하지만 정량적 추정은 정성적 수준에 머문다.

## STEP5. Cost/Benefit Matrix + Pareto Frontier

| 후보 | Capability | Complexity | Risk | Production Impact |
|---|---|---|---|---|
| Dual Wing Bridge | 9.3 | 6 | 2 | 0 |
| Bridge Chain | 10.0 | 4 | 4 | 2 |
| Temporary Expansion | 10.0 | 8 | 4 | 1 |
| Multi-Component Merge | 7.3 | 6 | 1 | 0 |

**실제 계산된 Pareto Frontier: 4개 후보 전부** -- 어느 하나도 다른
후보를 4개 축 전체에서 지배하지 못한다(Capability-Complexity-Risk-
Production Impact 사이의 진짜 tradeoff). (참고: Production Impact 점수
계산 로직에 첫 구현 시 버그가 있어 -- Dual Wing Bridge가 "Production
자체는 무변경 가능"이라고 명시했음에도 점수가 부풀려짐 -- 발견 즉시
수정 후 재계산했다.)

## STEP6. Blueprint Selection

**finalDecision = B. Comparative Prototype Sprint**

4개 후보가 모두 Pareto Frontier에 남아 단일 우월 후보가 없다.
risk+productionImpact 합산이 가장 낮은 2개, **Multi-Component Merge**와
**Dual Wing Bridge**를 다음 Comparative Prototype Sprint에서 우선
비교 구현할 것을 제안한다. (Multi-Component Merge는 적용 인구가
작지만(14.6%) 위험/Production 영향이 가장 낮고, Dual Wing Bridge는
전체 인구(100%)에 적용 가능하면서 두 번째로 안전하다.)

### Level 1-3

- **Level1(대체 Primitive 최소 4개 설계)**: PASS -- 4개 설계 완료.
- **Level2(구조적 비교 완료)**: PASS -- STEP3/4/5 전 축 비교 완료.
- **Level3(구현 대상 하나 확정)**: PARTIAL -- 단일 후보로 좁혀지지
  않음(Pareto Frontier 4/4). Comparative Prototype Sprint에서 실제
  구현 후 실측 비교가 필요하다.

## 결론

75.6%의 실패가 집중된 Validation 단계(targetedComponentsMerged)를
겨냥한 4개 대안 메커니즘을 설계했다. 실측으로 그라운딩 가능했던 유일한
정량 지표(Multi-Component Merge의 적용 인구 상한 14.6%)를 제외하면
나머지는 정성적 추정에 머물렀고, Cost/Benefit 4축 비교에서 단일 우월
후보가 나오지 않았다(Decision B). 다음 단계는 Multi-Component Merge와
Dual Wing Bridge를 실제로 프로토타입 구현해 비교하는 Comparative
Prototype Sprint다.
