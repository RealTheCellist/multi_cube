# CONFLICT_DEEP_DEPENDENCY Budget & Scheduling Validation Sprint v1

Status: Research Sprint (Read-only) — Complete
Population: 16 CONFLICT_DEEP_DEPENDENCY labels (Sprint 2's own set) for dose-response; full 142-case Hole Dataset for regression check.

## 0. 배경

Sprint 2(Structural Mechanism Analysis)는 CONFLICT_DEEP_DEPENDENCY 16건 전체에서 DISRUPT가 75%, SETUP이 100% 성공한다는 것을 5000ms의 독립적 예산 하에서 확인했다. 반면 Production Recovery Layer는 이 두 Primitive에게 별도 예약 없이 4-way 공유 slice(`Math.max(5, Math.floor((genDeadline-Date.now())/4))`)만 배정한다. 이번 Sprint는 "그 능력 격차가 예산 부족 때문인지"를 Shadow Scheduler로 직접 검증했다.

## 1. Budget Allocation Matrix (Deliverable #1)

| reservationMs | Arm | improvedRate | onlyReserved | timeoutRate | avgBudgetUtil |
|---|---|---|---|---|---|
| 75 | BASELINE | 0.0% | - | 0.0% | - |
| 75 | ARM_A_DISRUPT | 0.0% | 0 | 100.0% | 186.9% |
| 75 | ARM_B_SETUP | 0.6% | 1 | 99.4% | 220.9% |
| 75 | ARM_C_BOTH | 0.6% | 1 | 100.0% | 203.9% |
| 150 | BASELINE | 0.6% | - | 0.0% | - |
| 150 | ARM_A_DISRUPT | 0.6% | 0 | 100.0% | 137.4% |
| 150 | ARM_B_SETUP | 3.1% | 4 | 98.8% | 146.3% |
| 150 | ARM_C_BOTH | 3.1% | 4 | 100.0% | 141.9% |
| 300 | BASELINE | 0.6% | - | 0.0% | - |
| 300 | ARM_A_DISRUPT | 0.6% | 0 | 100.0% | 121.8% |
| 300 | ARM_B_SETUP | 8.1% | 12 | 96.9% | 129.4% |
| 300 | ARM_C_BOTH | 8.1% | 12 | 100.0% | 125.6% |
| 500 | BASELINE | 0.0% | - | 0.0% | - |
| 500 | ARM_A_DISRUPT | 0.0% | 0 | 100.0% | 116.7% |
| **500** | **ARM_B_SETUP** | **11.9%** | **19** | **93.1%** | **111.5%** |
| 500 | ARM_C_BOTH | 11.9% | 19 | 100.0% | 114.1% |

(n=160 repeats per row = 16 case × 10 repeats)

**핵심 관찰 — RQ-3 답변**: `ARM_A_DISRUPT`는 4개 Reservation 크기(75/150/300/500ms) 전 구간에서 `onlyReserved=0`이다 — 즉 DISRUPT에게 독립 예약을 줘도 실제로 Baseline 대비 새로 풀리는 케이스가 **단 하나도 없다**. `ARM_C_BOTH`(DISRUPT+SETUP 동시 예약)의 수치는 `ARM_B_SETUP`(SETUP 단독)과 매 행 정확히 동일하다(improvedRate, onlyReserved 모두). 즉 이번 Sprint의 개선 효과는 **전적으로 SETUP에서만** 나온다.

## 2. Reserved Slice Dose-Response (RQ-4, Deliverable #2)

SETUP Reserved Slice의 improvedRate: 75ms→0.6%, 150ms→3.1%, 300ms→8.1%, 500ms→11.9% — 4개 지점 모두 단조 증가하는 명확한 dose-response 곡선이다. Baseline(예약 없음)은 같은 크기에서 0.0~0.6%에 머무른다.

**주의**: 500ms에서도 SETUP의 `timeoutRate=93.1%`로, 예약된 시간을 거의 항상 소진한다 — dose-response 곡선이 500ms에서 아직 포화(saturate)되지 않았다는 뜻이다. 이번 Sprint의 상한(500ms, `MAX_ACCEPTABLE_RESERVATION_MS`)은 Directive가 정한 실용적 상한이지 SETUP의 진짜 성능 한계가 아니다. 더 큰 Reservation을 주면 improvedRate가 더 오를 가능성이 높지만, 그건 이 Sprint의 범위(Out of Scope: 새 Parameter 탐색) 밖이다.

## 3. Runtime Report (RQ-1/RQ-2)

| Metric | 관찰 |
|---|---|
| RQ-1 (현재 공유 slice의 손실) | Production의 4-way 공유 slice는 이 population에서 SETUP이 필요로 하는 300~500ms대 예산을 전혀 주지 못한다 — Sprint 2가 측정한 100% 성공률(5000ms 독립 예산)과 Production의 실질 0% 성공률 사이의 간극이 이번 Sprint로 정량 확인됐다. |
| RQ-2 (Reserved Slice 부여 효과) | SETUP에 500ms Reserved Slice를 주면 improvedRate 0.0%→11.9%(+11.9pp)로 증가. |
| Budget Utilization 초과 | 모든 Arm에서 `avgBudgetUtilization`이 100%를 넘는다(예: SETUP@500ms=111.5%, SETUP@75ms=220.9%). 이는 `tryEndgameMultiPly`/`tryEndgameThroughDisruption`이 deadline을 폴링 방식으로 체크하기 때문에 실제 종료 시각이 명목 Reservation을 소폭~크게 초과할 수 있다는 뜻이다 — Production Integration 시 "500ms 예약"이 실제로는 평균 ~557ms, 짧은 예약(75ms)에서는 최대 ~2배까지 초과할 수 있음을 감안해야 한다. |

## 4. Regression Report (RQ-5, Deliverable #4)

Best Config(`ARM_B_SETUP@500ms`)를 전체 142-case Hole Dataset에 대해 재측정:
- `casesWithSinglePassFlip=1`, `trueRegressionCount=0`, `falseRegressionCount=1`.
- Shadow Reconstruction 방법론(REAL `generateRecoveryStrategies()` 후보 + Synthetic SETUP 후보를 합쳐 REAL `chooseBestRecovery()`가 선택) 특성상 Arm은 Baseline의 상위집합이므로 구조적으로 더 나쁠 수 없다 — 관측된 단 1건의 single-pass flip은 REPEAT-MEAN 비교 결과 `meanGap<=0.5`로 판정되어 FALSE_REGRESSION(순수 확률적 노이즈)으로 분류됐다. TRUE_REGRESSION은 0건.

## 5. Production Recommendation (Deliverable #5)

자동 생성 모듈(`ProductionRecommendation.ts`)의 판정: **Conclusion A — Reserved Slice 방식이 명확히 우월하고 안전함. Production Integration 진행 권고.**

Success Criteria 검증(공개된 규칙 그대로):
- `recoveryIncreased`: improvedRate +11.9pp, onlyReserved=19 → 충족
- `regressionSafe`: trueRegressionCount=0 → 충족
- `runtimeAcceptable`: reservationMs=500ms ≤ 500ms(상한) → 충족
- `clearlySuperior`: delta 11.9pp ≥ 5pp 기준 → 충족

자동 판정 자체는 정확하지만, **1절/2절에서 확인한 두 가지 뉘앙스를 자동 생성 텍스트가 담지 못하므로 명시적으로 덧붙인다** (Sprint 2에서 자동 텍스트를 데이터로 직접 교정했던 것과 같은 이유):

1. **DISRUPT에게 예약을 줄 필요가 없다.** `ARM_C_BOTH`가 `ARM_B_SETUP`과 완전히 동일한 수치를 내는 것은 DISRUPT Reserved Slice가 이 population에서 0의 한계 기여를 한다는 뜻이다. Production Integration은 **SETUP 단독 Reserved Slice(500ms)** 로 좁혀서 진행하는 것이 예산 낭비를 없앤다.
2. **500ms는 SETUP의 성능 상한이 아니라 이번 Sprint의 탐색 상한이다.** timeoutRate=93.1%가 보여주듯 SETUP은 500ms에서도 여전히 budget-starved 상태다. Production Integration 이후 이어질 자연스러운 다음 단계(사용자 자신이 제안한 로드맵과 일치)인 "Reserved Slice Production Integration → Production Validation" 단계에서, 실제 solve() 전체 지연시간(latency) 예산이 허용한다면 500ms보다 큰 Reservation을 재탐색해볼 여지가 있다.

**최종 결론: Conclusion A.** SETUP 전용 500ms Reserved Slice의 Production Integration을 권고한다. DISRUPT에는 Reserved Slice를 배정하지 않는다.

## 6. 다음 로드맵

사용자가 제시한 순서(Reserved Slice Production Integration → Production Validation → Solver Completeness Validation v3)를 그대로 따르되, Integration 범위를 "SETUP 단독"으로 명확히 하고, Runtime Report의 Budget Utilization 초과 특성(폴링 기반 deadline이라 예약을 소폭 넘길 수 있음)을 Production Integration 설계에 반영할 것을 권고한다.
