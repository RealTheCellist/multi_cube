# Cube Model Experiment — Real Swipe Verification v1

## 배경

Cube Model Experiment Sprint v1(`CUBE_MODEL_EXPERIMENT_V1.md`)에서 3개
후보 모델(Delta-Log, Discrete-Twist, Slot-Cycle) 전부 **시드 고정 랜덤
턴**으로 정합성을 검증했다. 이번 라운드는 "3면이 보이는 실제 화면에서
실제로 스와이프했을 때, 입력에 맞게 각 모델의 회전이 일어나는지"를
**진짜 스와이프 입력**으로 직접 확인해 달라는 요청에 따른 것이다 —
랜덤 턴이 아니라, 실제 프로덕션 제스처 판정 로직(`customSwipeControls.ts`)이
실제 3면 카메라 뷰에서 내린 축 판정 결과를 그대로 재생해 검증했다.

**모델 명명(CUBIXX)은 이 검증이 끝날 때까지 보류한다는 지시에 따라
철회했다** — `SlotCycleModel.ts`의 `name`을 다시 중립적인 "Slot-Cycle"로
되돌렸다(git으로 추적됨).

## 방법

1. `customSwipeControls.ts`(프로덕션, 손대지 않음)에 임시
   `AXISMAP_PROBE` 로그를 추가해, 스와이프가 커밋될 때 실제로 판정된
   `(axis, layer, sign)`을 콘솔에 출력하게 했다.
2. Playwright로 실제 3x3 프로덕션 앱(기본 3면 카메라)에서 화면 10개
   지점(Top/Right/Front, 이전 세션에서 확인된 애매 구역 Right face
   0.85,0.55 포함) × 가로/세로 2방향 = 20회의 **진짜 스와이프**(작은
   손떨림 노이즈 포함, 14스텝 드래그)를 수행하며 커밋된 turn을 그대로
   캡처했다.
3. 캡처된 20개의 `(axis, layer, sign)` 각각을, 매번 새로 만든 솔브드
   3x3x3에 프로덕션 모델과 3개 후보 모델 전부에 독립적으로 적용한 뒤,
   표현 방식과 무관한 "물리적 스티커 슬롯→색상" 맵으로 결과가 일치하는지
   비교했다.
4. 검증 직후 `AXISMAP_PROBE` 로그를 완전히 되돌렸다(`git diff --exit-code`
   0건 확인).

## 결과

캡처된 20개 turn은 x/y/z축, 양쪽 부호, 바깥층(±1)과 가운데 슬라이스(0,
M/E/S) 모두를 실제로 포함했다(애매 구역 포함 지점에서의 스와이프도
정상 커밋됨).

| 모델 | 결과 |
|---|---|
| Delta-Log | **20/20** 실제 스와이프 turn 정확히 일치 |
| Discrete-Twist | **20/20** 실제 스와이프 turn 정확히 일치 |
| Slot-Cycle | **20/20** 실제 스와이프 turn 정확히 일치 |

## 판정

**3개 모델 전부, 실제 3면 카메라에서 실제 스와이프로 판정된 회전을
입력대로 정확히 수행한다.** 이는 Sprint v1의 랜덤 턴 검증(모델당
12,800턴)이 이미 시사한 결과와 일치하며, 그 이유도 동일하다 — 축/레이어/
부호 판정은 화면 기하(카메라·터치 좌표)만으로 결정되고, 어떤 상태
모델을 쓰는지와는 무관하기 때문이다. 즉 "큐브 모델을 바꾸면 스와이프
오작동이 줄어들거나 늘어날 것"이라는 가설은 이번 실측으로도 지지되지
않는다 — 오작동은 모델이 아니라 판정 로직·카메라 기하의 문제라는 이전
결론을 다시 한번 확인한 것에 가깝다.

## 변경 범위

- `src/customCube/runRealSwipeModelVerificationSprintV1.ts` (신규,
  검증 드라이버)
- `src/customCube/customCubeExperiments/SlotCycleModel.ts` (모델 이름을
  "CUBIXX"에서 "Slot-Cycle"로 되돌림 — 명명 보류 지시 반영)
- `customSwipeControls.ts`는 진단용 임시 로그만 추가했다가 완전히
  되돌렸다(git diff 0건).
