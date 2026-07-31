# Multi-Component Merge Production Integration Planning Sprint v1 -- 결론 보고

## 무엇을 했나

Hybrid Primitive Blueprint Sprint v1의 Decision C(Hybrid 이득 없음 →
Multi-Component Merge 단일 Primitive Integration으로 회귀)에 따라, 이번
Sprint는 Multi-Component Merge를 Production Recovery Pipeline에
통합하기 위한 Integration Contract를 설계했다. 실제 코드는 수정하지
않고, 실제 production 함수(`generateRecoveryStrategies`,
`detectComponents`, `generateBridgeCandidates`, `analyzeCcrGate`)를
읽기 전용으로 전체 142-case Hole Dataset에 호출해 STEP1(Position) ~
STEP6(Contract)을 도출했다. Production Solver 및 보호 파일은 이번에도
전혀 건드리지 않았다(`git diff --stat` 0건 확인).

## 핵심 발견

**MCM의 componentCount==2 fallback은 실제 프로덕션
`genParityGatedCycle()`과 코드 수준에서 동일하다** -- 즉 MCM의 진짜 신규
가치는 componentCount>=3에만 존재한다.

| 지표 | 실측값 |
|---|---|
| componentCount>=3 Gate 적용 인구 | 9/142 (6.3%) |
| **신규 rescue(newCapabilityCount)** | **4/142 (2.8%)** |
| 기존 Production과 중복(duplicateOfProduction) | 0 |
| runtimeCostPerRescueMs | 1189ms |
| CCR와의 실측 겹침(ccrOverlap) | 2/9 (22.2%) |
| REPAIR와의 실측 겹침 | 0/9 (0%) |

## 성공/실패 기준 판정

- **Level1 (Integration Position 확정)**: PASS -- BEFORE_PARITY
  (genCCR() 다음, genParityGatedCycle() 이전 -- MCM Gate와
  PARITY_GATED_CYCLE Gate를 상호 배타적으로 분리)
- **Level2 (Gate·Budget Contract 확정)**: PASS -- Gate=componentCount>=3,
  Budget=Dedicated Slice(PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000ms 재사용)
- **Level3 (Production Integration 명세 완료)**: PASS -- Operating
  Contract 확정, 다음 Sprint에서 그대로 구현 가능

Risk Assessment: Regression=LOW, Scheduler=LOW, Budget=LOW,
Runtime=MEDIUM, Primitive Interaction=MEDIUM -- High 위험 0건.

## 결론

**Decision A: Integration Contract가 명확히 확정됨 → Multi-Component
Merge Production Integration Sprint v1로 진행한다.**

확정된 Operating Contract: `genCCR()` 다음, `genParityGatedCycle()` 이전에
`componentCount>=3` Gate로 삽입, `PARITY_GATED_CYCLE_RESERVED_SLICE_MS`
(2000ms)를 그대로 재사용하는 Dedicated Slice. 다만 신규 Capability
규모가 작으므로(2.8%), 다음 Sprint의 성공 기준은 이 규모에 맞게 보정해야
한다.
