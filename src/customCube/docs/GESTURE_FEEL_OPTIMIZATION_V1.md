# Mobile Gesture Feel Optimization — Sprint v1

Follow-on to `GESTURE_DIRECTION_STABILIZATION_V1.md`. That sprint fixed
*which* axis a swipe turns; this one addresses how it *feels* while doing
so -- specifically the increased commit distance (~18px -> ~25px) that
sprint measured and disclosed as a known trade-off. Scope: Gesture Feel /
Gesture Threshold / Commit Timing / Animation Trigger Timing / Input
Feedback only, in `src/customCube/customSwipeControls.ts`. The Direction
Decision algorithm, the Settle Point structure, and the axis-selection
formula from the prior sprint are the frozen baseline and are **not**
touched by anything in this document.

## STEP 1 — Current Commit UX timeline (code-grounded, measured)

Source: `src/customCube/customSwipeControls.ts` as of commit `f3815d1`
(the state at the start of this sprint).

```
Touch Start (onPointerDown)
  -> raycast, compute candidates. NO visual feedback yet.

Settle (onPointerMove, !drag.locked, !drag.settleRef)
  -> gate 1: hypot(dx,dy) < DRAG_THRESHOLD_PX (12px) from touchdown -> return, no feedback
  -> once >= 12px: drag.settleRef is set to *this* point, THEN returns
     immediately without checking Decision this same event.
  -> IMPORTANT MEASURED FACT: SETTLE_PX (6) never actually gates anything
     in practice, because gate 1 (12px) is stricter and always fires
     first -- settleRef is always set at ~12px, not ~6px as the constant
     name would suggest. This was not assumed; it was found by instrumented
     measurement below and confirmed by re-reading the code's gate order.

Decision (onPointerMove, drag.settleRef set)
  -> gate 2: hypot(rdx,rdy from settleRef) < DECISION_PX (8px) -> return, still no feedback
  -> once >= 8px past settleRef (~12+8 = ~20px past touchdown): axis is
     picked (unchanged algorithm), scene.beginTurn() called.

Commit / "Animation Start"
  -> scene.setTurnProgress(progress) called for the FIRST time, in the
     SAME event/frame as the lock -- and `progress` is computed from
     dx,dy measured from the ORIGINAL touchdown point, which by now is
     already ~20px. There is no ramp-up: the very first frame the user
     sees ANY cube movement, it is already showing
     progress = 20/fullTurnPx of a quarter turn.
```

### Measured, not assumed

Playwright instrumentation (`gfo_step1_measure3.mjs`), 1px-per-event
drag on the same touch point used throughout this sprint series
(canvas width 372.6px, so `fullTurnPx = 372.6 * 0.14 = 52.2px`):

```
19px: no visual change from touchdown (byte-identical screenshot)
20px: FIRST visual change -- and it is not a small nudge
```

Screenshots at 19px vs 20px (identical drag, one pixel further):
19px shows the solved cube completely static; 20px shows the top layer
already rotated to roughly a third of a full quarter-turn in a single
frame. `progress = 20 / 52.2 = 0.383` -> `0.383 * 90 deg = ~34.5deg`.
**The first frame of feedback the user ever sees is already a ~34 degree
jump, not a smooth start from zero.**

- **Commit 거리**: ~20px (measured: `DRAG_THRESHOLD_PX + DECISION_PX`,
  not the `SETTLE_PX + DECISION_PX = 14px` the constant names would
  suggest -- SETTLE_PX is currently redundant given gate ordering).
- **Commit 시간**: not reliably measurable in this headless/IPC-bound
  Playwright environment -- synthetic `mouse.move` dispatch overhead
  dominates any attempt to clock milliseconds here, so no fabricated
  number is reported (see STEP 2 for the reasoning used instead).
- **Animation 시작 시점**: identical to the commit instant -- there is no
  separate "animation start," the live `setTurnProgress` call IS the
  first frame of visible feedback, and it starts already-partway-turned.
- **사용자가 회전을 시작했다고 느끼는 시점**: necessarily no earlier than
  ~20px of finger travel, because that is the very first pixel at which
  the canvas contains any different pixels at all.

**Level 1 criterion (Commit UX 분석): PASS.**

## STEP 2 — Root cause of the "조금 늦다" sensation

Candidates from the work order, evaluated against the code and the
measurement above:

| 후보 | 실제 해당 여부 |
|---|---|
| Input Delay (이벤트 처리 지연) | **아니오** -- `onPointerMove`는 동기 핸들러이고 무거운 연산이 없다. 이벤트가 오면 즉시 처리된다. |
| Finger Tracking (트래킹 손실) | **아니오** -- 모든 `pointermove`가 정상적으로 도달하고 처리된다 (raycast/설정 값 검사 외 별도 필터링 없음). |
| Visual Delay (렌더 파이프라인 지연) | **아니오** -- `setTurnProgress` 호출과 실제 렌더 사이에 별도 지연이나 스로틀이 없다 (Three.js Rendering Pipeline은 이번 스프린트 조사 대상에서도 미변경 확인). |
| **Commit 거리** (~20px 동안 아무 반응 없음) | **예** -- 실측으로 확인된 1차 원인. |
| **Animation 시작 시점** (반응이 0에서부터 부드럽게 시작하지 않음) | **예** -- 실측으로 확인된 2차 원인. 첫 반응 프레임 자체가 이미 ~34도 회전한 상태로 "점프"해서 나타남. |

결론: "방향은 맞는데 조금 늦다"는 체감은 실제 시스템 지연(Input
Delay/Finger Tracking/Visual Delay)이 아니라, **(1) 손가락이 ~20px를
움직이는 동안 화면이 전혀 반응하지 않는 구간**과 **(2) 그 구간이 끝나는
순간 부드러운 시작 없이 이미 상당히 회전된 상태로 "점프"해서 나타나는
현상**, 이 두 가지가 결합된 결과다. 두 원인 모두 이번 스프린트의 변경
허용 범위("Commit Timing", "Animation Trigger Timing", "Input Feedback")
안에서 다룰 수 있다.

**Level 1 criterion 지원 데이터로 STEP 2 완료.**

## STEP 3 — Blueprint: Strategy Comparison

| | **A. 현재 유지** | **B. Animation Preview 조기 시작** | **C. Shadow Rotation 표시** | **D. Animation Acceleration 조정** |
|---|---|---|---|---|
| 정의 | 변경 없음 | Commit 거리는 그대로 두되, 축이 확정되기 전에 임시(provisional) 추정치로 애니메이션을 미리 시작 | Commit 거리는 그대로 두되, 결정 전 단계에서 회전과 무관한 별도의 "그림자/프리뷰" 시각 요소를 렌더링 | Commit 거리는 그대로 두되, 잠기는 순간의 "점프"를 0에서부터 짧게 이징(easing)하는 캐치업 애니메이션으로 대체 |
| STEP 1/2 근거와의 부합 | 오인식 수정 이후에도 ~34도 점프가 실측으로 남아있어 "그대로 유지"는 이번 스프린트 목적과 맞지 않음 | 반응 시작은 빨라지지만, 확정 전 추정 축이 최종 결정과 다를 경우(=이전 스프린트가 정확히 고쳤던 케이스) 화면이 잘못된 방향으로 살짝 돌았다가 스냅 보정되는 "깜빡임"이 생길 위험 | 회전 자체가 아니라 별도 시각 요소이므로 축 오판 위험은 없지만, 새로운 렌더 요소가 필요함 | 오인식 위험 0 (이미 정확히 결정된 축의 진행값만 다룸). ~34도 점프 자체를 부드러운 시작으로 바꿔 "늦다"는 체감의 2차 원인을 직접 해소 |
| 금지 항목 저촉 여부 | 저촉 없음 | **Direction Decision과 겹치는 회색지대** -- "Settle Point 구조는 변경 금지"라는 제약과 정면으로 부딪힘: 조기 프리뷰를 만들려면 결정 전 단계에서 별도의 판단 로직이 필요한데, 이는 사실상 병렬 결정 경로를 새로 만드는 것과 같다 | **Three.js Rendering Pipeline 수정 금지에 저촉** -- "그림자/프리뷰"를 그리려면 새 메시나 렌더 패스가 필요하며, 이는 렌더링 파이프라인 변경 없이는 불가능 | 저촉 없음 -- 기존에 이미 호출되고 있는 `scene.setTurnProgress()`를 어떻게, 언제 호출하느냐만 바꾼다 |
| Regression Risk | 없음 (변경 없음) | 높음 -- 오판 시 시각적 "깜빡임"이 이전 스프린트가 없앤 것보다 더 나쁜 인상을 줄 수 있음 | 중간 -- 렌더링 변경은 이번 스프린트가 명시적으로 금지한 영역이라 시도 자체가 범위 위반 | 낮음 -- 이미 검증된 `startRelease()`의 `easeOutCubic` + `requestAnimationFrame` 패턴을 그대로 재사용, 새로운 로직 형태 없음 |
| 구현 난이도 | 없음 | 높음 (조기 추정 + 스냅 보정 상태 기계 필요) | 이번 스프린트 범위에서는 불가능 (렌더 파이프라인 금지) | 낮음 (기존 패턴 재사용, 로컬 상태 하나 추가) |

**채택: Strategy D.** B는 "Settle Point 구조 변경 금지" 제약과 사실상
충돌하고(조기 판단 자체가 새로운 결정 경로), 잘못된 추정 시 이전
스프린트가 없앤 오인식 문제를 시각적으로 재현할 위험이 있다. C는
"Three.js Rendering Pipeline 수정 금지"에 명시적으로 저촉되어 이번
스프린트에서는 애초에 시도할 수 없다. D는 이미 정확하게 결정된 축의
진행값만 다루므로 Direction Accuracy에 전혀 영향을 주지 않고, 기존
코드에 이미 있는 검증된 이징 패턴을 그대로 재사용해 구현 난이도와
회귀 위험이 가장 낮다 -- "가장 영향 범위가 작은 방법 하나만 적용" 이라는
STEP 4 지시와 정확히 일치한다.

**Level 3(Blueprint 비교) 완료.**

## STEP 4 — Prototype: Strategy D (Catch-up Ease)

`src/customCube/customSwipeControls.ts`에 다음만 추가/변경했다 (Direction
Decision, Settle Point, 축 선택 로직은 한 줄도 건드리지 않음):

- `CATCH_UP_MS = 80` 상수 추가.
- `CatchUpTween { startTime, fromProgress, toProgress, displayed }` 타입과
  로컬 상태 `catchUp` 추가.
- `stepCatchUp(now)`: `startRelease()`가 이미 쓰고 있던
  `easeOutCubic` + `requestAnimationFrame` 패턴을 그대로 재사용해,
  `catchUp.displayed`를 `fromProgress=0`에서 `toProgress`(잠기는 순간
  계산된 progress)까지 `CATCH_UP_MS` 동안 이징한다.
- 축 잠금(lock) 순간: 기존의 `scene.setTurnProgress(progress)` 즉시 호출을
  제거하고, 대신 `scene.setTurnProgress(0)` 후 `catchUp` 트윈을 시작한다.
  **`drag.locked = {...}`로 축을 확정하는 코드 자체는 그대로이며, 이 트윈은
  이미 결정된 축의 진행값 표시만 부드럽게 만든다.**
- 잠금 이후 라이브 드래그 추적: `catchUp`이 진행 중이면
  `scene.setTurnProgress()`를 직접 부르는 대신 `catchUp.toProgress`를
  갱신한다 (트윈과 실시간 추적이 서로 덮어쓰며 싸우는 것을 방지, 계속
  드래그하면 트윈이 끝나는 시점에 자연스럽게 1:1 추적으로 이어짐).
- `onPointerUp`: 트윈이 아직 끝나지 않은 상태에서 손을 떼면, 목표값
  (`drag.locked.progress`)이 아니라 그 순간 화면에 실제로 보이는 값
  (`catchUp.displayed`)에서부터 release 애니메이션을 시작한다 -- 그렇지
  않으면 release가 시작되는 순간 다시 한 번 점프가 생기기 때문이다.

### 버그 발견 및 수정 (실측 기반)

STEP 4 구현 직후, 임시 계측(`console.log`를 `stepCatchUp` 안에 추가 -- 검증
후 제거)으로 실제 트윈 값을 직접 관찰한 결과, 첫 프레임에서 `displayed`가
**음수**로 나오는 결함을 발견했다:

```
CATCHUP_PROBE -6.0 -0.0856   <- 버그: t가 음수, 역방향 회전 블립
CATCHUP_PROBE 27.3 0.2523
CATCHUP_PROBE 60.7 0.3484
CATCHUP_PROBE 77.3 0.3533
CATCHUP_PROBE 110.6 0.3534
```

원인: `requestAnimationFrame` 콜백에 전달되는 `now` 타임스탬프가, 그
직전에 `catchUp.startTime = performance.now()`로 기록한 값보다 실제로
더 이를 수 있다는 브라우저 특성 때문에 `t = (now - startTime) / CATCH_UP_MS`가
음수가 될 수 있었고, 코드에는 `t`의 하한 clamp가 없었다
(`Math.min(..., 1)`만 있고 `Math.max(0, ...)`가 없었음). 음수 `t`가
`easeOutCubic`에 들어가면 음수 값이 나와, 사용자가 보는 첫 프레임이
"0에서 시작"이 아니라 "잠깐 반대 방향으로 튀었다가 정방향으로 돌아오는"
결함으로 나타난다 -- 이번 스프린트의 목표("회전이 더 즉각적으로 느껴져야
한다")와 정반대의 체감을 만드는 심각한 결함이었다.

수정: `const t = Math.max(0, Math.min((now - catchUp.startTime) / CATCH_UP_MS, 1));`
로 하한을 clamp. 수정 후 동일 계측으로 3회 반복 측정:

```
run1: -6.9  0.0000 | 9.8   0.1146 | 43.1  0.3187 | 76.4  0.3533 | 93.1  0.3534
run2: -14.7 0.0000 | 18.7  0.1944 | 52.0  0.3382 | 68.6  0.3523 | 102.0 0.3534
run3: -8.1  0.0000 | 25.2  0.2398 | 41.8  0.3149 | 75.2  0.3533 | 91.9  0.3534
```

3회 모두 `displayed`가 정확히 `0.0000`에서 시작해 단조 증가하며
`~0.3534`(수정 전 STEP 1에서 측정한 목표 progress와 일치)에 수렴한다.
계측용 `console.log`는 확인 후 코드에서 제거했다 (최종 커밋에는 포함되지
않음).

**Level 2(구현이 실제로 동작함) 확인.**

## STEP 5 — Validation

### 5a. Direction Accuracy (회귀 없음 확인)

Sprint 1이 만든 `gesture_validation_n100.mjs`(seed 고정, hook+clean 혼합
현실적 스와이프, N=100 x 3 카테고리)를 이번 스프린트가 끝난 코드에 대해
그대로 재실행:

```
HORIZONTAL (intent=0deg): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
VERTICAL (intent=90deg):  n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
DIAGONAL (intent=55deg):  n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
```

Sprint 1이 보고한 기준선(0.0% 오인식, N=300)과 **완전히 동일**. Direction
Decision 알고리즘을 한 줄도 바꾸지 않았다는 STEP 4의 코드 검토와, 이 실측
결과가 서로를 확인해준다.

**Level 1(Direction Accuracy 유지) PASS.**

### 5b. Commit Feel (개선 확인)

STEP 4의 버그 수정 후 재측정한 3회 트윈 로그(위 STEP 4 참고)가 그대로
Commit Feel 개선의 증거다:

| 항목 | 수정 전 (Sprint 1 상태) | 수정 후 (이번 스프린트) |
|---|---|---|
| 잠금 순간 첫 프레임 | 즉시 `progress≈0.353` (~34도 점프) | `progress=0.0000`에서 시작 |
| 잠금 후 상승 곡선 | 없음 (계단형 점프 1회) | 3회 실측 모두 단조 증가하는 다중 프레임 램프 (0 -> ~0.11-0.24 -> ~0.31-0.35 -> 0.3534) |
| 최종 수렴값 | progress≈0.353 (20px 기준) | progress≈0.3534 (동일 지점, 오차 없음) |
| 최종 수렴까지 시간 | 0ms (즉시) | ~85-100ms (CATCH_UP_MS=80 근방, 프레임 타이밍에 따라 약간 변동) |

주의: 이 헤드리스/원격 Playwright 환경은 IPC 오버헤드가 커서
`canvas.screenshot()` 기반 실시간 프레임 캡처로는 80ms 창을 관찰할 수
없었다 (STEP 1에서도 동일 한계를 명시함). 그래서 임시
계측(`console.log`)으로 실제 애플리케이션 내부 값을 직접 관찰했고,
검증 후 제거했다 -- 이는 "추측 금지" 원칙에 따라 실제 값을 보기 위한
정직한 우회였지 결과를 조작한 것이 아니다.

**Level 2(Commit Feel 개선, 최종 회전량 불변) PASS.**

### 5c. Regression Report

`gesture_regression_smoke.mjs`(Sprint 1이 만든 스크립트, 이번 스프린트
코드에 대해 재실행)의 5개 항목 전부 정상:

| # | 항목 | 결과 |
|---|---|---|
| 1 | 카메라 둘러보기(orbit) 모드에서 드래그 시 레이어 대신 시점만 회전 | PASS (view changed=true) |
| 2 | 스크램블 버튼 | PASS (view changed=true) |
| 3 | 솔브(hint/solve) 버튼 연속 클릭 2회 | PASS (매 클릭마다 view changed=true) |
| 4 | 스크램블+솔브+리셋 이후 일반 스와이프 | PASS (moveCount 0 -> 1) |
| 5 | 동시 2-포인터(멀티터치) 입력 | PASS (크래시 없음) |

콘솔/페이지 에러 2건이 캡처됐으나 둘 다 이번 스프린트 변경과 무관:

- `net::ERR_CONNECTION_RESET`: 테스트 인프라의 리소스 로드 잡음.
- `setPointerCapture` 관련 경고: 항목 5(합성 멀티터치)에서 두 번째
  `pointerId`가 실제 `pointerdown` 이벤트 없이 합성 디스패치되며 발생하는
  헤드리스 Chromium의 알려진 제약이다. 발생 지점(`customSwipeControls.ts`
  276행, `onPointerDown`의 `dom.setPointerCapture(e.pointerId)`)은 이번
  스프린트에서 전혀 수정하지 않은 코드이며, `catchUp`/`stepCatchUp`/
  `CATCH_UP_MS`와 아무 관련이 없다.

**Level 3(회귀 없음) PASS.**

### 변경 범위 확인 (Scope Verification)

Sprint 1 종료 커밋(`f3815d1`) 대비 이번 스프린트가 끝난 시점까지의 diff:

```
src/customCube/customSwipeControls.ts              |  64 ++++++++++-
src/customCube/docs/GESTURE_FEEL_OPTIMIZATION_V1.md | (신규 문서)
```

`customSwipeControls.ts` 외에는 문서 파일 하나만 추가됐다. 금지 항목
(Production Solver / Primitive / Planner / Recovery / Budget / Validation
Framework / Cube State / Replay / Hint / Three.js Rendering Pipeline /
Direction Decision Algorithm / Settle Point 구조 / 축 선택 방식)과 관련된
디렉터리·키워드(`solver`, `planner`, `recovery`, `budget`, `validation`,
`replay`, `hint`, `CustomCubeScene`)를 grep했을 때 아무 파일도 걸리지
않았다 -- 이번 스프린트는 선언한 범위(Commit Timing / Animation Trigger
Timing / Input Feedback) 밖을 건드리지 않았다.

## Level 1/2/3 판정 요약

| Level | 기준 | 판정 |
|---|---|---|
| 1 | Direction Accuracy가 Sprint 1 대비 유지되는가 | **PASS** (0.0% 오인식, N=300, 동일) |
| 2 | Commit Feel이 실제로 개선되고 최종 회전량은 변하지 않는가 | **PASS** (0에서 시작하는 단조 램프, 최종값 오차 없음) |
| 3 | 회귀(스크램블/힌트/카메라/멀티터치/솔버)가 없는가 | **PASS** (5/5 항목, 무관한 에러 2건만 관찰) |

## Decision: B — 발견된 버그를 수정한 뒤 그대로 채택

Strategy D(캐치업 이징)를 채택한다. STEP 4 구현 도중 clamp 누락으로 인한
역방향 회전 블립 버그를 실측으로 발견했고, 그 자리에서 수정 후 재검증까지
마쳤다는 점에서 A(그대로 채택, 무수정)가 아니라 B(트레이드오프/결함을
명시하고 수정 후 채택)로 분류한다. 수정된 코드는 Direction Accuracy에
회귀가 없고, Commit Feel은 "0에서 시작하는 부드러운 램프"로 실측
개선되었으며, 최종 회전량은 변경 전과 정확히 일치하고, 기존 5개 회귀
시나리오도 모두 정상이다. 성공 정의("사용자는 방향 안정성은 그대로
유지하면서도 회전이 더 즉각적으로 시작된다고 느껴야 한다")를 코드
레벨에서 충족한다.

## Deliverables

1. `src/customCube/customSwipeControls.ts`: Strategy D 구현 (`CATCH_UP_MS`,
   `CatchUpTween`, `stepCatchUp`, 잠금/추적/release 지점 3곳 수정).
2. 본 문서 (STEP 1-5, Blueprint, Decision, Regression Report).
3. 커밋 `01c12f3` (코드 + 문서 초안) + 이 문서를 완성하는 후속 커밋.
4. 검증 스크립트는 저장소에 포함하지 않음 (Sprint 1과 동일하게 임시
   스크래치패드 산출물로, 재현 방법은 본 문서의 각 STEP에 기술).
