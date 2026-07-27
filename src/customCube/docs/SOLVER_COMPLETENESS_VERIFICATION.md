# Solver Completeness Verification Sprint v1

Status: **Completeness NOT Verified**. 717건 전수 census(335 Snapshot + 150
Replay + 180 Depth-graded Scramble + 52 Worst Case) 결과 Gate1/3/4는
PASS했지만 Gate2(Infinite Loop 0)/Gate5(100% Success)/Gate6(Regression 유지)가
FAIL. Full driver report:
`solverCompletenessVerification/data/solver-completeness-verification-v1-report.txt`.

---

## 0. Completeness 정의

정의된 입력 도메인 내의 모든 합법적 상태에 대해 실제 Production `solve()`가

- (a) 정상 종료 (Crash/Exception/Infinite Loop/Deadlock/Timeout 없음)
- (b) Solved 또는 허용된 정상 종료 상태에 도달 (Unknown State 없음)
- (c) 확정된 3개 Operating Contract(ENDGAME/Incremental Recovery/CCR)를
  위반하지 않음

을 만족하는 성질. 이번 Sprint는 이 3개 조건을 6개 Gate로 분해해 측정만
수행했다 (새 알고리즘/Primitive/Contract 변경 없음, Production Solver
전 파일 미변경).

## 1. 측정 방법론

- **실행 방식**: Production 4-phase 전체 파이프라인(`solveTrueCenterPositions5`
  -> `solveCentersHumanStyle` -> wing-pairing `solve()` 반복 호출(수렴 또는
  50회 상한까지) -> `solveReduced5`)을 헤드리스로 그대로 호출. 실제
  `customSolvePlayback.ts`가 사용자 재입력마다 `solve()`를 다시 호출하는
  루프를 그대로 재현 -- 2회 연속 빈 plan에서 조기 종료하지 않음 (사전
  스모크 테스트에서 자체 발견/수정한 방법론 버그, 부록 참조).
- **수렴 판정**: `wrongWingCount5(cubies) === 0`. 최대 50회 반복(사용자
  확정 상한) 내 미도달 시 수렴 실패로 분류.
- **Ground truth**: 각 phase의 자체 보고 플래그가 아닌 `isSolved(cubies)`로
  최종 fullySolved 여부 판정.
- **Dataset**: 335 Snapshot(전수, 기존 failureAnalysis DB) + Replay Pool
  150건(신규 생성, depth=40) + Scramble Depth[10,20,30,40,50,100] x 30건 +
  Worst Case Library 52건(같은 335 population에서 parity/recovery-failed/
  high-wrongWingCount 태그로 파생, 신규 재계산 없음). 총 717건.
- **Repeatability**: Worst Case Library 52건에 대해 N=10회 재실행(520회).
- **Regression(Goal D)**: 기존 확정 Operating Contract(250ms/140ms/CCR)
  대비 N=30-trial paired 비교, 75건 stride-subsample -- 이 연구 전체가
  확립한 표준 평가 프로토콜 그대로 재사용.

## 2. STEP1 전수 census 결과 (717건, 카테고리별)

| Category | n | Success | Crash | 수렴실패 | BudgetViolation | UnknownState | avg WallMs | avg WingPairing Iter |
|---|---|---|---|---|---|---|---|---|
| snapshot335 | 335 | 0/335 (0.00%) | 0 | 335 | 0 | 0 | 62017.8 | 50.00 |
| replay150 | 150 | 0/150 (0.00%) | 0 | 150 | 0 | 0 | 59817.4 | 50.00 |
| scrambleDepth10 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 56221.1 | 50.00 |
| scrambleDepth20 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 58434.4 | 50.00 |
| scrambleDepth30 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 59182.7 | 50.00 |
| scrambleDepth40 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 59919.8 | 50.00 |
| scrambleDepth50 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 59381.1 | 50.00 |
| scrambleDepth100 | 30 | 0/30 (0.00%) | 0 | 30 | 0 | 0 | 59860.0 | 50.00 |
| worstCase | 52 | 0/52 (0.00%) | 0 | 52 | 0 | 0 | 58820.3 | 50.00 |
| **전체** | **717** | **0/717 (0.00%)** | **0** | **717** | **0** | **0** | -- | -- |

717건 전부가 50회 반복 상한까지 도달하고도 `wrongWingCount5 === 0`에
이르지 못함(수렴 실패). Crash/Exception, Budget Violation, Unknown State는
전 카테고리에서 0건.

**핵심 발견 (스모크 테스트 단계에서 이미 사용자에게 공시하고 승인받은
사항)**: 이 미수렴은 확률적 실패(재시도로 해소 가능한 요행)가 아니라
**결정론적으로 고정된 잔여 상태**다. 동일 task plan, 0-move 결과가 반복
호출에도 계속 재현되는 사례가 확인되었으며, 이는 wing-pairing 엔진의
구조적 커버리지 공백(missing primitive/case match)이지 `solve()` 자체의
전략 선택 확률성 문제가 아님을 의미한다. 즉, 사용자가 아무리 많이
재시도해도 이 잔여 상태에서는 벗어나지 못한다.

## 3. Worst Case Library 재현성 (STEP2, N=10 x 52건 = 520회)

| | 결과 |
|---|---|
| Success | 0/520 (0.00%) |
| Crash | 0 |
| 수렴실패 | 520/520 (100%) |
| BudgetViolation | 0 |

10회 반복 전부 동일하게 수렴 실패 -- STEP1에서 관측한 "결정론적 고정
잔여" 가설과 정확히 일치하는 완벽한 재현성. Worst Case 52건은
parity/recovery-failed/high-wrongWingCount 세 카테고리에서 파생된
중복제거 집합이며, 이 subset에서 재시도 자체가 무의미함을 통계적으로
확증한다.

## 4. Regression 재확인 (STEP3, Goal D, N=30 trial, 75건 stride-subsample)

| 지표 | N=30-trial 평균 | 단일-pass 전체 census (참고용) |
|---|---|---|
| True Regression rate | **7.96%** | 6.67% |
| Primary (improved diff) mean | 0.233 | -- |
| Primary 95% CI | [-0.059, 0.526] | -- |
| Cohen's d_z | 0.286 (small) | -- |
| Gap Rescue | -- | 12.00% |
| New Deadline Miss | -- | 8.00% |
| New Budget Violation | -- | 0.00% |

이 연구 전체가 확립한 주 판정 기준(N-trial 평균)으로 True Regression
rate=7.96%, 5% 허용 범위를 초과한다. 95% CI가 0을 포함하므로 Primary
지표 자체도 통계적으로 유의미한 개선을 보이지 않는다 (Cohen's d_z=0.286,
small effect).

## 5. Completeness Gate 판정

| Gate | 정의 | 판정 | 근거 |
|---|---|---|---|
| Gate1 | Crash 0 | **PASS** | 717건 중 Crash/Exception 0건 |
| Gate2 | Infinite Loop 0 (50회 상한 내 수렴) | **FAIL** | 717건 전부 수렴 실패 |
| Gate3 | Budget Violation 0 | **PASS** | Recovery Trigger AND 해당 호출 자체 Deadline Miss 동시 발생 0건 |
| Gate4 | Unknown State 0 | **PASS** | fullySolved=false이면서 Crash/수렴실패로 설명 안 되는 건 0건 |
| Gate5 | 모든 Dataset Solve Success 100% | **FAIL** | 전체 Success Rate 0.00% (0/717), 전 9개 카테고리 미달 |
| Gate6 | Regression 기존 Release Contract 유지 (<=5%) | **FAIL** | N=30-trial 평균 True Regression rate 7.96% |

**6개 Gate 중 3개 PASS(1/3/4), 3개 FAIL(2/5/6).**

## 6. Final Completeness Declaration

**Completeness NOT Verified.**

Crash/Budget Violation/Unknown State는 전 717건에서 0건으로, Production
Solver가 예측 불가능하게 죽거나 계약을 깨는 방식으로 실패하지는 않는다
(Gate1/3/4 PASS). 그러나 Wing-pairing 단계의 구조적 커버리지 공백으로
인해 50회 반복 상한 내 수렴하지 못하는 사례가 전체 717건 전부에서
관측되었고(Gate2 FAIL), 이는 곧 100% Success 기준(Gate5)도 충족할 수
없음을 의미한다. 이 결과는 이 연구 전체가 앞선 여러 Sprint에서 이미
반복 관측해온 "wing-pairing Success Rate ~0%"와 정확히 일치하며, 새로운
퇴행이 아니라 기존에 알려진 구조적 한계가 5x5 전체 파이프라인 스코프에서
재확인된 것이다.

Regression(Gate6)도 N=30-trial 평균 기준 5% 허용 범위를 초과(7.96%)해
Production Release Closeout에서 확정한 Release Contract 유지 조건을
만족하지 못한다.

**권고**: 이 Sprint는 측정/문서화 전용으로 진행되었으며 Primitive/Planner/
Recovery/Executor를 전혀 수정하지 않았다(File scope 검증 참조). Gate2/5의
근본 원인(wing-pairing 구조적 공백)을 해소하려면 이 연구 전체가 이미
누적한 Primitive Research 계보(Blueprint/Prototype/Gap Analysis 등)를
다시 여는 새로운 Sprint가 필요하며, 이는 Production Release Closeout에서
동결한 범위를 벗어난다. 현재 Production Solver는 "Crash/Budget
Violation/Unknown State 없음"이라는 안전성 계약은 지키지만, "항상
Solved에 도달한다"는 완전성 계약은 지키지 못한다.

## 7. File Scope 검증

착수 시점부터 완료까지 `git diff --stat`을 보호 파일 전체
(`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdges.ts`,
`fiveByFiveCenters.ts`, `fiveByFiveHumanCenters.ts`,
`fiveByFiveReduction.ts`, `cubeState.ts`,
`productionIntegrationFinalization/`)에 대해 확인한 결과, **0 diff**. 이번
Sprint에서 변경된 파일은 전부 `solverCompletenessVerification/`(신규 측정
하네스)와 이 문서뿐이다.

---

## 부록: 자체 발견/수정한 방법론 이슈

착수 전 스모크 테스트에서 "2회 연속 빈 plan -> 조기 포기"라는 초기
하네스 로직이 실제 `customSolvePlayback.ts`의 사용자 재입력 루프를
정확히 반영하지 못한다는 것을 자체 발견했다. `solve()`가 `shuffle()`
기반으로 확률적이라, 같은 미변경 cube 상태에 대한 재호출이 직전 호출
직후에도 성공할 수 있다는 점을 감안하면 조기 포기는 거짓 음성(false
negative)을 만든다. 초기 버전은 depth-10 등 쉬운 스크램블조차 2~8회
반복 만에 실패로 오분류했다. 본 실행 전 이를 발견/수정하고(50회 상한과
`wrongWingCount5===0` 수렴만을 종료 조건으로 함), 재-스모크 테스트로
정상 동작(50회 전체를 소진하는, 구조적으로 의미 있는 결과)을 확인한 뒤
본 실행을 진행했다.

## 부록: 인프라 이슈 재발 (반복 관측)

이번 Sprint의 본 실행은 이 연구 전체에서 반복 관측된 패턴대로, 긴 유휴
구간 중 세션/컨테이너 전체가 응답 없이 정지하는 문제가 수 차례 발생했다
(최장 1회는 약 8.5시간). STEP1(717건 census)은 25건 단위 체크포인트로,
STEP2(Worst Case 재현성, N=10 트라이얼)는 이번 Sprint 중 사용자 요청으로
트라이얼 단위에서 **케이스 단위**로 체크포인트 세분화를 완료해 중단
시점부터 정확히 재개했다(데이터 손실 0). STEP3(Regression 재확인, N=30
trial)는 체크포인트가 없어 중단 시 처음부터 재시작해야 하는 구조였지만,
다행히 이번 실행에서는 STEP3 진입 후 중단 없이 완료됐다. 세션 밖에서
동작하는 시간 기반 자동 복구(Routine)는 승인 절차가 완료되지 않아 이번
Sprint에서는 적용하지 못했다 -- 매 중단마다 수동으로 재확인/재시작하는
방식으로 완주했다.
