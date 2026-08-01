# Multi-Component Merge Production Integration Sprint v1 -- 결론 보고

## 무엇을 했나

Integration Planning Sprint v1에서 확정된 Operating Contract(Position
before_PARITY, Gate componentCount>=3, Budget 2000ms Dedicated Slice)를
실제 Production Recovery Pipeline(`fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgeSolverTypes.ts`)에 배선했다. Multi-Component Merge를 최초로
Production에 연결한 Sprint다. 이후 STEP2-6에서 실제 production 함수
(`generateRecoveryStrategies()`/`attemptRecovery()`, 수정 없음)를 통해 전체
142-case Hole Dataset에 대해 Contract Audit, Baseline vs Integrated
Capability Validation, Primitive Interaction, Statistical Validation +
Validation Framework, Root Cause Analysis를 모두 실측했다.

Directive가 허용한 두 파일(`fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgeSolverTypes.ts`) 외에는 아무 것도 건드리지 않았다(`git diff
--stat` 0건 확인).

## 실제 측정 수치

| 지표 | 값 |
|---|---|
| Gate 일치율(componentCount>=3) | 6.3%(9/142) -- Planning Sprint와 정확히 일치 |
| Position 정확도 | 100%(9/9) |
| **평균 실제 가용 예산** | **493.6ms**(명목 2000ms의 24.7%) |
| **Budget Starved 비율** | **100%(9/9)** |
| 신규 Capability(raw) | 1건 → 재확인 결과 **0건** (MCM과 무관, CCR 케이스의 wall-clock 노이즈) |
| Regression | 0건 |
| Gate C(Capability 감소 없음, strict) | OPEN_QUESTION |

## 핵심 발견

Contract 자체(어디에 넣을지, 언제 발동할지)는 설계대로 정확히 동작했다.
하지만 CCR의 `remainingTime` Budget Contract가 Outer Deadline(1000ms)을
먼저 소진해, MCM은 명목 2000ms 예산의 4분의 1(평균 493.6ms)만 받았다. 실제로
MCM이 후보를 생성한 유일한 케이스(`scrambleDepth100:5`)는 Comparative
Prototype Sprint v1의 독립적인 2000ms 예산 테스트에서는 성공했던 케이스였지만,
이번엔 예산 부족으로 실패했다. 즉 신규 Capability 0건의 원인은 **Primitive
알고리즘 자체의 한계가 아니라 CCR과의 Budget 경쟁(Budget Starvation)**으로
명확히 귀속된다.

## 성공/실패 기준 판정

- **Level1 (Operating Contract 정확히 구현)**: PASS
- **Level2 (Regression 0)**: PASS
- **Level3 (신규 Capability 확인)**: FAIL
- **Level4 (Validation Framework 통과)**: FAIL (Gate C OPEN_QUESTION)

## 결론

**Decision B: Production Integration Refinement Sprint로 진행한다.**

Contract는 안전하고 정확하지만, Root Cause 분석이 실패 원인을 Budget
Starvation으로 명확히 분리했으므로 Primitive Blueprint로 회귀(Decision C)하는
대신, Budget/Scheduler 재설계(예: MCM을 CCR보다 먼저 실행하거나 독립적인
예산 슬라이스를 부여)를 다루는 Refinement Sprint가 다음 단계로 타당하다.
