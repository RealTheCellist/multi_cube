# Multi-Component Merge Production Integration Refinement Sprint v1 -- 결론 보고

## 무엇을 했나

이전 Sprint가 발견한 "Budget Starvation이 신규 Capability 부재의 원인"이라는
가설을 반사실(counterfactual) 실험으로 직접 검증했다. Primitive 알고리즘은
전혀 건드리지 않고, `fiveByFiveEdgeRecovery.ts`에 새 스케줄링 파라미터
(`multiComponentMergeOrder`)만 추가해 MULTI_COMPONENT_MERGE를 CCR보다
먼저 실행하도록 재배치한 뒤, 실제 142-case 전체에 대해
Baseline(MCM 없음)/AFTER_CCR(기존)/BEFORE_CCR(재배치) 3-arm을 실제
`attemptRecovery()`로 재측정했다.

## 실제 측정 수치

| 지표 | AFTER_CCR(기존) | BEFORE_CCR(재배치) |
|---|---|---|
| 평균 실제 가용 예산 | 435.1ms | **681.0ms**(+56%) |
| 개선 케이스 수 | 17 | 15 |
| 신규 Capability | 3 | 2 |
| Regression | 1 | 2 |
| CCR과의 겹침 | 11.1% | **0%** |

BEFORE_CCR vs AFTER_CCR improvedCountDiff: mean=-0.0141, 95% CI=[-0.0417,
0.0135] (0 포함, 유의하지 않음). 세 가지 비교(BEFORE_CCR vs AFTER_CCR,
BEFORE_CCR vs Baseline, AFTER_CCR vs Baseline) 모두 95% CI가 0을 포함했다.

## 핵심 발견

재배치는 실제로 MCM이 받는 예산을 56% 늘렸고 CCR과의 겹침도 완전히
제거했지만, 이것이 통계적으로 유의한 Capability 회복으로 이어지지
않았다 -- 오히려 raw 개선 건수는 소폭 감소했다(17→15). 다만 이번에
테스트한 예산(681ms)은 여전히 Outer Deadline(1000ms) 상한에 묶여 있어,
Comparative Prototype Sprint v1이 측정한 "완전히 경쟁 없는 2000ms 예산"
(그 조건에서는 9건 중 4건 성공)에는 미치지 못한다. 즉 "예산을 충분히
보장해도 회복되지 않는다"(Decision C의 조건)를 아직 확정적으로 입증한
것은 아니다.

## 성공/실패 기준 판정

- **Level1 (Budget Starvation 원인 재현)**: PASS
- **Level2 (Budget/Scheduler 수정으로 Capability 회복)**: FAIL
- **Level3 (최종 Operating Contract 확정)**: PARTIAL

## 결론

**Decision B: Refinement Sprint v2로 진행한다.**

Budget/Scheduler 재배치만으로는 통계적으로 유의한 회복이 확인되지
않았지만, Outer Deadline 제약 때문에 진짜 "충분한 예산" 조건을 아직
검증하지 못했다 -- Primitive 자체의 한계로 단정(Decision C)하기엔
이르다. Budget/Scheduler 조정을 계속 탐구하는 Refinement Sprint v2가
다음 단계로 타당하다.
