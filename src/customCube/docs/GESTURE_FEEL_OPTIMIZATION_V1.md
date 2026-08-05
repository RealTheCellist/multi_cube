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
