# Cube Model Hybrid Sprint v1 — Slot-Cycle + Log

## 배경

앞선 Cube Model Experiment Sprint v1(3개 모델 비교)에서 Slot-Cycle이
정합성 100% + 전 크기 최고 속도로 "CUBIXX 모델"로 명명됐고, Delta-Log는
느리지만("매 턴 즉시 해석" 기준 5x5에서 8.5배 느림) 무브 히스토리가
공짜로 따라온다는 별개의 장점이 있었다. 사용자 지시("장점 극대화 단점
최소화")에 따라, Delta-Log의 느린 부분(상태 해석을 로그 재생에 의존)을
가져오지 않고 그 장점(무브 로그)만 Slot-Cycle에 붙이는 합성 모델을
설계·검증했다.

**Discrete-Twist는 별도로 합칠 필요가 없었다** — Slot-Cycle이 이미
내부적으로 방향을 쿼터니언이 아닌 회전군 정수 인덱스로 저장하고 있어,
Discrete-Twist의 아이디어를 자체적으로 포함하고 있다.

## 설계

`SlotCycleLoggedModel.ts`는 새 로직을 만들지 않고 `slotCycleModel`에
얇게 위임한다:
- `buildSolved`/`applyTurn`/`toCubies` 전부 내부적으로 `slotCycleModel`의
  동일 함수를 그대로 호출.
- 유일한 추가: `applyTurn`마다 그 턴을 `state.log`에 push.
- **현재 상태 해석(`toCubies`)은 로그를 전혀 참조하지 않는다** — Slot-Cycle
  자체가 이미 완전히 해석된 상태(`slotToPiece`/`pieceOrientation`)를
  들고 있으므로, Delta-Log처럼 재생 비용을 치를 이유가 없다.

## 검증 방법 및 결과

### STEP 1 — 정합성 (gridSize 2~5, 각 40시퀀스×80턴)

| gridSize | 결과 |
|---|---|
| 2x2 | 40/40 |
| 3x3 | 40/40 |
| 4x4 | 40/40 |
| 5x5 | 40/40 |

### STEP 2 — 로그 충실도 (gridSize 2~5, 각 20시퀀스×80턴)

모델 자신의 `toCubies()` 결과가 아니라, **`state.log`만 따로 꺼내
완전히 새로운 프로덕션 솔브드 큐브에 진짜 `applyRawQuarterTurn`으로
독립 재생**했을 때 모델이 보고하는 최종 상태와 정확히 일치하는지 검증.
이건 "로그가 그냥 존재한다"가 아니라 "로그가 실제로 신뢰 가능한 무브
히스토리다"를 확인하는 테스트다.

| gridSize | 결과 |
|---|---|
| 2x2 | 20/20 |
| 3x3 | 20/20 |
| 4x4 | 20/20 |
| 5x5 | 20/20 |

### STEP 3 — 성능 (렌더러 기준: 매 턴 즉시 해석, 4,000턴)

| 모델 | 3x3 | 5x5 |
|---|---|---|
| 프로덕션 | 13.8ms | 36.2ms |
| Slot-Cycle (로그 없음) | 5.6ms | 20.4ms |
| **Slot-Cycle+Log** | **7.9ms** | **20.5ms** |

- 5x5에서는 로그 오버헤드가 사실상 0(20.4ms → 20.5ms) — 여전히
  프로덕션보다 1.77배 빠름.
- 3x3에서는 로그 push 오버헤드가 상대적으로 더 도드라진다(5.6ms →
  7.9ms, 41% 증가) — 절대 시간이 워낙 작아 배열 push 하나의 상수 비용
  비중이 커지기 때문. 이 경우도 프로덕션(13.8ms)보다는 여전히 1.75배
  빠르다.

## 결론

**장점 극대화, 단점 최소화가 실측으로 확인됐다**: Slot-Cycle의 속도
우위(전 크기 프로덕션보다 1.75~1.77배 이상)를 잃지 않으면서, Delta-Log의
유일한 강점(무브 히스토리)을 그 약점(재생 비용) 없이 그대로 얻었다.
`CustomCubeScene.ts`가 지금 수동으로 관리하는 별도 moveHistory 리스트가
구조적으로 불필요해지는 부산물도 그대로 유효.

이번 Sprint도 순수 실험/검증이며, 프로덕션 코드는 전혀 수정하지
않았다(git diff 0건). 프로덕션 통합 여부는 여전히 별도 결정 사항이다.

## 변경 범위

새로 추가된 파일만 존재한다:
- `src/customCube/customCubeExperiments/SlotCycleLoggedModel.ts`
- `src/customCube/runCubeModelHybridSprintV1.ts` (드라이버)
- 이 문서

기존 파일은 0건 수정.
