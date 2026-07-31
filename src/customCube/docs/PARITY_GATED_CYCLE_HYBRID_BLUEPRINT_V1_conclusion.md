# Parity-Gated Cycle Hybrid Primitive Blueprint Sprint v1 -- 결론 보고

## 무엇을 했나

Comparative Prototype Sprint v1에서 Dual Wing Bridge와
Multi-Component Merge가 둘 다 Baseline보다 확실히 좋지만 서로는
통계적으로 구분되지 않는다는 결과(Decision B)가 나왔다. 이번 Sprint는
그 결론을 존중하고, 억지로 하나를 선택하는 대신 **두 Primitive를
결합(Hybrid)했을 때 상호보완 효과(additivity)가 있는지**를 설계
단계에서 검증했다. 실제 코드는 구현하지 않고, Comparative Sprint가
이미 만들어 둔 142-case 전체 population의 실측 결과(JSON)를 그대로
재사용해 STEP1-6(Capability Overlap → Hybrid Scheduling Design →
Budget Architecture → Counterfactual Capability Estimation →
Integration Risk → Blueprint Selection)을 도출했다.

Production Solver 및 보호 파일은 이번에도 전혀 건드리지 않았다
(`git diff --stat` 0건 확인).

## 실제 측정 수치

| 지표 | 값 |
|---|---|
| dualOnlyCount (Dual만 성공) | **0** |
| multiOnlyCount (Multi만 성공) | 2 |
| bothCount (둘 다 성공) | 11 |
| jaccardIndex | 0.846 |
| overlapRatioOfSmaller | 1.000 |
| unionSuccessCount (합집합) | 13 |
| **expectedRescueOverBestSingle** | **0** |
| duplicateSuccessCount | 11 |
| marginalRescuePercentOfPopulation | 0.0% |
| extraRuntimeCostForMarginalRescueMs | 492.9ms |

핵심: Dual Wing Bridge가 단독으로 성공시키는 케이스는 0건 -- Dual의
성공 11건은 전부 Multi의 성공 13건에 포함된다. 즉 Multi가 Dual을
실증적으로 완전히 포함(superset)한다. 그 결과 Hybrid가 Multi 단독 대비
추가로 얻는 Capability(Expected Rescue)는 정확히 0이며, 오히려
11건에서는 두 Primitive를 모두 도는 중복 계산이, 나머지 대다수
케이스에서는 아무 소득 없이 추가 Primitive의 런타임(약 493ms)만 매번
지불하는 구조다.

## 성공/실패 기준 판정

- **Level1 (Capability 중복 구조 규명)**: PASS
- **Level2 (Hybrid Architecture 확정)**: N/A -- 확정할 실익이 없다는
  것 자체가 결론
- **Level3 (Prototype 구현 대상 1개 선정)**: PASS --
  `MULTI_SINGLE_PRIMITIVE_INTEGRATION`

## 결론

**Decision C: 중복이 지나치게 커서 Hybrid 이득이 없음 → 단일
Primitive Integration으로 회귀.**

Hybrid를 설계/구현하는 대신, 다음 Sprint는 **Multi-Component Merge
단일 Primitive의 Production Integration Planning**으로 진행하는 것이
타당하다.
