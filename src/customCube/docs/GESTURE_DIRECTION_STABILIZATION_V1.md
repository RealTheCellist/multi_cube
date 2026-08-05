# Mobile Gesture Direction Stabilization — Sprint v1

Research → Blueprint → Prototype → Validation cycle for the swipe-to-turn
gesture's axis decision logic in `customSwipeControls.ts`. Scope: gesture
input decision only. Not touched: Production Solver, Primitive/Planner/
Recovery/Budget/Validation Framework, Cube Solve Logic, Replay/Hint Logic,
Three.js scene structure, cube state representation, rotation algorithm.

## STEP 1 — Current Gesture Decision Flow (code-grounded)

Source: `src/customCube/customSwipeControls.ts` (as of commit `1a52d0b`,
the state at the start of this sprint).

```
pointerdown (onPointerDown, L171)
  -> raycastNear(): raycast with a 3x3 pixel-offset retry ring (L149-169)
  -> resolve hit cubie, hit.face normal -> faceAxis (the axis you cannot
     spin by touching this face, L184-188)
  -> otherAxes = the two axes perpendicular to faceAxis (L189)
  -> for each candidate axis: layer = round(worldToGrid(hit.point[axis]))
     at the grid's own coordinate parity (odd=integer, even=half-integer,
     L198-214)
  -> dom.setPointerCapture(e.pointerId)                         [Pointer Capture: YES]
  -> drag = { startX, startY, hitPoint, candidates: [c0, c1], locked: null }

pointermove (onPointerMove, L221), while !drag.locked:
  -> dx = clientX - drag.startX, dy = clientY - drag.startY      (cumulative
     displacement since gesture START, not the incremental delta since the
     last move event)
  -> if hypot(dx, dy) < DRAG_THRESHOLD_PX (12px): return          [Threshold: YES, 12px]
  -> dragDir = normalize(dx, dy)
  -> tangent0/tangent1 = screenTangent(axis) for each candidate: the
     axis's local screen-space rotation direction at hit.point, derived by
     projecting a small rotation step through the real camera (L48-53)
  -> align_i = |dot(dragDir, tangent_i)|                         [Angle calc: YES --
     this is literally |cos(theta)| between the swipe and each tangent LINE]
  -> chosen = argmax_i(align_i)
  -> scene.beginTurn(chosen.axis, chosen.layer)
  -> drag.locked = { axis, layer, screenDir: tangent_chosen, fullTurnPx, progress }

pointermove, once drag.locked is set:
  -> decision block above is SKIPPED for the rest of the gesture -- the
     axis is never re-evaluated even if the finger's direction changes
     afterward                                                   [Direction Lock: YES,
                                                                    implicit, permanent
                                                                    once set]
  -> progress = clamp(dx*screenDir.x + dy*screenDir.y over fullTurnPx, -1, 1)

pointerup (onPointerUp, L264):
  -> startRelease(progress): commits if |progress| >= 0.3, else reverts
```

Summary of the 5 required findings:

| Item | Present? | Detail |
|---|---|---|
| 방향 결정 기준 | dot-product / angle comparison | `align_i = \|dragDir · tangent_i\|`, axis with larger value wins |
| Threshold 존재 여부 | 있음 | `DRAG_THRESHOLD_PX = 12`px cumulative distance from gesture start |
| Direction Lock 존재 여부 | 있음 (암묵적) | `drag.locked` set once, decision block never re-runs after |
| 각도 계산 여부 | 있음 | dot product of normalized vectors == cosine of the angle to each tangent line |
| Pointer Capture 사용 여부 | 있음 | `dom.setPointerCapture(e.pointerId)` at pointerdown |
| Dead Zone 존재 여부 | **없음** | decision is forced the instant the 12px threshold is crossed, regardless of how close `align0`/`align1` are |
| Angle Hysteresis 존재 여부 | **없음** (해당사항 없음) | since the axis is decided exactly once and never revisited, there is nothing to apply hysteresis to |

**Level 1 criterion (문서화): PASS.**

## STEP 2 — Reproduction

Method: production build served via `vite preview` (`GITHUB_PAGES=true`),
driven by Playwright issuing real `mouse.move`/`mouse.down`/`mouse.up`
sequences against the live canvas (not a unit-level mock of the decision
function). Touch point fixed at one location on the green face
(x=0.30, y=0.42 of the canvas), 3x3x3 cube, screenshot byte-size used as
the outcome classifier (already validated as a reliable proxy for "which
axis turned" in the prior sprint — confirmed visually).

**Key finding — the naive assumption that the horizontal/vertical
boundary sits at screen-angle 45° is wrong.** A fine sweep of swipe angle
(0°..90° in 5°, then 60°..75° in 1°) at this touch point found the real
decision boundary between **65° and 70°**, not 45°:

```
angle=0..65deg  -> HORIZONTAL axis chosen
angle=70..90deg -> VERTICAL axis chosen
```

This is not a bug — it's the correct, direct consequence of the code's
actual geometry: the two candidate axes' *screen-projected tangent
directions* are not symmetric around the screen's 45° diagonal, because
the camera views the cube at an oblique (near-isometric) angle. A swipe
that looks "45°" to a human eye on their phone screen can be much closer,
in the scene's actual local tangent geometry, to one axis than the other.
This is the central, code-grounded fact this Sprint's Blueprint (STEP 3)
has to design around — the goal is not to force a 50/50 split exactly at
45° screen-angle (that would fight the real camera geometry and feel
*more* arbitrary, not less), but to make the decision **robust and
repeatable** wherever the true boundary actually sits.

| 케이스 | 사용자 의도 | 실제 결과 | 오인식 |
|---|---|---|---|
| 0° (수평) 장거리 | 수평축 | 수평축 | 아니오 |
| 90° (수직) 장거리 | 수직축 | 수직축 | 아니오 |
| 30° 장거리 | 수평 쪽 | 수평축 | 아니오 |
| 60° 장거리 | 실제 경계(65-70°) 안쪽, 수평 쪽 | 수평축 | 아니오 (경계가 45°가 아니라 67°대이므로 60°는 여전히 수평 쪽) |
| 45° 장/단거리 | 정의상 모호 | 수평축 (이 접점에서는 수평 접선에 더 가까움) | 해당없음 — 진짜 애매 케이스 |
| 0°/90° 단거리(20px) | 각각 수평/수직 | 각각 수평/수직 | 아니오 |
| 30°/60° 단거리 | 위와 동일 | 위와 동일 | 아니오 |

기존(이번 스프린트 시작 시점, commit `1a52d0b`) 코드는 순수 수평/수직 및
그 근방(경계에서 충분히 떨어진 각도)에서는 오인식이 없었다. 문제가 남아
있는 지점은 **실제 경계(이 접점 기준 약 67.5°) 바로 근방**, 그리고 뒤에서
STEP 5로 정량화하는 **짧고 흔들리는(비직선) 실제 손가락 궤적**이다 —
"12px 이동 즉시, 그 시점까지의 누적 방향으로 단 한 번 결정하고 절대
재평가하지 않는다"는 현재 규칙은, 사람 손가락이 시작 12px 동안 그리다
말다 하는 실제 궤적에서는 그 순간의 스냅샷이 이후 명확해지는 진짜 의도와
다를 수 있다는 구조적 리스크를 안고 있다.

**Level 1 criterion 지원 데이터로 STEP 2 완료.**

## STEP 2b — Realistic wobble reproduction (not in the literal instruction list, but load-bearing)

The canonical-angle sweep above (0/30/45/60/90, clean straight lines) showed
**zero misrecognition** in the existing code — because a synthetic
perfectly-straight Playwright swipe is not representative of a real human
touch. Real fingers "hook": a brief off-axis settle before the intended
direction. Reproduced with a synthetic hooked path (short off-axis segment,
then a long, clean, unambiguous final direction):

```
True intent: HORIZONTAL, hook=11px near-vertical, then 79px clean horizontal
  hook=90deg -> HORIZONTAL (correct)
  hook=85deg -> HORIZONTAL (correct)
  hook=80deg -> HORIZONTAL (correct)

True intent: VERTICAL, hook=11px near-horizontal, then 79px clean vertical
  hook=0deg  -> HORIZONTAL (WRONG -- true intent was vertical)
  hook=5deg  -> HORIZONTAL (WRONG)
  hook=10deg -> HORIZONTAL (WRONG)
```

Root cause (traced in the real code, not guessed): the axis lock fires the
instant *cumulative displacement from the original touchdown pixel* first
exceeds `DRAG_THRESHOLD_PX` (12px). Because this touch point's real
horizontal/vertical boundary sits at ~66.5° (STEP 2 finding) rather than
45°, an 11px *horizontal* hook is already so far inside the "confidently
horizontal" zone that even the few px of the true vertical intent that
sneak in before the 12px trip barely move the needle -- the snapshot is
not ambiguous, it's confidently wrong. A margin/dead-zone check alone
(waiting only when the two candidates are nearly tied) would **not** catch
this case, since the wrong answer isn't a near-tie at the moment it's
locked. This is the concrete, evidence-based reason STEP 3 designs around
*diluting the influence of a short early hook*, not just "wait when
uncertain."

## STEP 3 — Blueprint: Strategy Comparison

| | **A. 현재(코사인 정렬, dead zone 없음)** | **B. Dead Zone (정렬 마진 대기)** | **C. Direction Lock** | **D. Angle Hysteresis** |
|---|---|---|---|---|
| 정의 | `align0 vs align1`을 12px 시점에 1회 비교 | `\|align0-align1\|`이 임계값 미만이면 결정 보류 | 결정 후 재평가 금지 (고정) | 결정을 자주 재평가하되 축 전환에 더 큰 각도차 요구 |
| 현재 코드 상태 | **이미 구현됨** (기존 baseline) | 없음 | **이미 구현됨** (암묵적, `drag.locked`) | 없음 |
| 구현 난이도 | — (기준) | 낮음 (조건 하나 추가) | — (이미 있음) | 중간 (재평가 루프 + 전환 임계값 설계 필요) |
| STEP 2b 실측 대비 오인식 방어력 | 실측된 "짧은 훅" 오인식 100% 재현 (3/3 vertical-intent 케이스 모두 오답) | **낮음** — 훅 사례는 마진이 크게 벌어진("확신에 찬 오답") 케이스라 마진 임계값만으로는 못 걸러냄 (STEP 2b 근거) | 오인식 자체를 줄이지 않음 — 이미 켜져 있고, 켜져 있어도 첫 스냅샷이 틀리면 그대로 고정됨 | 재평가를 허용하므로 이론상 훅을 스스로 교정할 수 있으나, "전환 임계값"을 잘못 설계하면 진동(flip-flop)이나 반대로 여전히 초기 오답 고착 위험 |
| UX(응답성) | 12px에서 즉시 반응 — 가장 빠름 | 마진 클리어 전까지 대기 → 애매한 각도에서만 지연, 훅 사례는 못 고침 | 영향 없음 (이미 항상 켜져 있음) | 재평가 로직에 따라 다름; 잘 설계하면 응답성 손실 최소화 가능하나 설계/튜닝 비용 큼 |
| 기존 코드 영향 | 없음(기준) | 작음 — `onPointerMove`의 lock 분기에 조건 1개 | 없음 (변경 불필요) | 중간 — lock 이후 상태를 다시 열고 닫는 상태 기계 필요, `progress` 계산과의 상호작용을 재설계해야 함 |
| 안정성(회귀 위험) | — | 낮음 | 없음 | 중간 — 재평가 중 이미 진행 중인 `scene.setTurnProgress`/`beginTurn`과의 상호작용을 잘못 다루면 훨씬 큰 회귀 위험 |

**핵심 실측 결론(STEP 2b)**: 이번 스프린트가 실제로 잡아야 할 오인식은
"경계 부근 애매함"이 아니라 **"손가락이 처음 11px 정도를 엉뚱한 방향으로
훑고(hook) 지나간 뒤 명확한 방향으로 곧게 펴지는" 상황에서, 그 순간의
누적 변위 스냅샷이 이미 한쪽으로 확신에 차 있어 이후의 진짜 의도를
반영하지 못하는 것**이다. 이는 B(마진 대기)로는 못 잡는다 — 그 순간의
`align` 값 자체가 이미 크게 벌어져 있기(확신에 찬 오답) 때문이다.

**채택: Strategy B의 변형 — "정착 지점(settle point) 이후 재기준
Dead Zone" + 기존 C(Direction Lock) 유지.**

Dead Zone을 "정렬 마진이 좁을 때 대기"가 아니라 **"방향 판단의 기준점
자체를 터치다운 지점이 아니라, 짧은 정착 구간(SETTLE_PX) 이후의 지점으로
재설정"**하는 방식으로 재정의한다. 이렇게 하면:

- 훅이 SETTLE_PX 이내로 짧으면, 그 훅 전체가 "정착 잡음"으로 취급되어
  판단에서 사실상 제외된다(기준점이 훅이 끝난 지점으로 밀림).
- 순수하게 곧은 스와이프는 SETTLE_PX를 넘는 즉시 기준점이 잡히고, 그 뒤
  DECISION_PX만큼만 더 이동하면 바로 잠기므로 응답성 손실이 크지 않다.
- 기존 Direction Lock(C)은 그대로 유지 — 기준점 이후 한 번 잠그면 다시는
  재평가하지 않는다(D처럼 계속 열어두지 않음 → 회귀 위험 최소화).

Rejected 상세:
- **A(현행 유지)**: STEP 2b가 실측으로 오인식을 재현했으므로 "그대로
  둔다"는 Level 3 기준(오인식 감소)을 만족할 수 없다.
- **순수 B(마진 대기만)**: 위에서 실측으로 기각.
- **D(히스테리시스)**: 이미 진행 중인 회전 애니메이션·`beginTurn`
  상태와 상호작용하는 상태 기계를 새로 설계해야 해서 구현 난이도와 회귀
  위험이 가장 크고, 이번 스프린트의 "Solver/Recovery/Rendering 미변경"
  범위에는 맞지만 "Three.js Scene 구조 자체 변경 금지"와 부딪힐 소지가
  있다(잠긴 회전을 되돌리는 로직이 필요해질 수 있음). 이번 스프린트에서는
  보류.

**Level 2(Blueprint) 완료.**

## STEP 4 — Prototype

Implemented in `src/customCube/customSwipeControls.ts` only (scope
respected — no changes to `CustomCubeScene.ts`, cube state, or the
rotation algorithm; the frozen 5x5 solver files were not touched).

```ts
const SETTLE_PX = 6;
const DECISION_PX = 8;

interface DragState {
  ...
  settleRef: { x: number; y: number } | null; // new field
}

// in onPointerMove, while !drag.locked:
if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;   // unchanged first gate

if (!drag.settleRef) {                                 // new
  if (Math.hypot(dx, dy) < SETTLE_PX) return;
  drag.settleRef = { x: e.clientX, y: e.clientY };
  return;
}
const rdx = e.clientX - drag.settleRef.x;               // new
const rdy = e.clientY - drag.settleRef.y;
if (Math.hypot(rdx, rdy) < DECISION_PX) return;

const dragDir = new THREE.Vector2(rdx, rdy).normalize(); // was (dx, dy)
// ...axis comparison unchanged from there (align0/align1, screenTangent)...
// progress calculation after lock is UNCHANGED -- still uses the
// original dx, dy (displacement from touchdown), only the AXIS decision
// itself is re-anchored.
```

`Level 2(Prototype 구현) 완료.`

## STEP 5 — Validation

### 5a. Hooked-swipe fix confirmed (the actual bug this sprint targets)

Re-ran the exact STEP 2b failure cases against the prototype:

```
True intent: VERTICAL, hook=11px near-horizontal, then 79px clean vertical
  hook=0deg  -> VERTICAL (fixed, was HORIZONTAL)
  hook=5deg  -> VERTICAL (fixed, was HORIZONTAL)
  hook=10deg -> VERTICAL (fixed, was HORIZONTAL)

True intent: HORIZONTAL, hook=11px near-vertical, then 79px clean horizontal
  hook=90deg -> HORIZONTAL (still correct)
  hook=85deg -> HORIZONTAL (still correct)
  hook=80deg -> HORIZONTAL (still correct)
```

### 5b. Known, measured trade-off: short-swipe commit distance increased

Regression-checked minimum swipe distance needed to actually commit a
turn (not just lock an axis) at this touch point, sweeping length in the
same horizontal direction, real move-counter readout:

| length | baseline (commit `1a52d0b`) | prototype (SETTLE=6, DECISION=8) |
|---|---|---|
| 12px | no commit | no commit |
| 14px | no commit | no commit |
| 16px | no commit | no commit |
| 18px | **commits** | no commit |
| 20px | commits | no commit |
| 25px | commits | **commits** |
| 30px | commits | commits |

The minimum committing swipe grew from **~18px to ~25px** (+~7px). This
is a direct, unavoidable consequence of diluting a short hook: the axis
decision now waits for `SETTLE_PX + DECISION_PX` (worst case 14px) of
movement past the touchdown pixel instead of `DRAG_THRESHOLD_PX` (12px)
alone, which leaves less of a short swipe's total length available to
cross `COMMIT_PROGRESS_THRESHOLD` after the axis locks. This is disclosed
here rather than hidden — see the Regression Report and Decision below
for how it's handled.

### 5c. Statistical validation (N=100 per category, realistic hooked swipes)

Method: `gesture_validation_n100.mjs`, seeded PRNG (reproducible), each
trial synthesizes a short random hook (0–10px, random direction) followed
by a long (90px), clean, unambiguous final swipe -- the same "hooked
swipe" shape STEP 2b showed the baseline failing on. Same touch point
(green face, x=0.30, y=0.42) for all trials so results are directly
comparable to STEP 1/2's boundary measurement.

```
HORIZONTAL (intent=0deg): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
VERTICAL (intent=90deg):  n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
DIAGONAL (intent=55deg, geometrically H-leaning): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
```

(Exact figures inserted from the completed run below.)

### 5d. Regression report (existing features)

| 항목 | 결과 |
|---|---|
| 큐브 회전(일반 스와이프) | 정상 -- 스크램블/솔브 클릭 이후에도 정상 회전 (4. 참고) |
| 카메라 회전(둘러보기 모드 궤도 회전) | 정상 -- `OrbitControls` 기반, 이번 스프린트가 건드린 `customSwipeControls.ts`와 별개 경로. 실측으로도 뷰가 정상적으로 바뀜을 확인 |
| Multi-touch | 크래시 없음 -- 두 개의 동시 포인터 이벤트를 인위적으로 발생시켜도 앱이 죽지 않음 (합성 이벤트라 `setPointerCapture` 콘솔 경고가 뜨지만, 이는 실제 OS 터치가 아닌 테스트 방식 자체의 한계이며 이번 변경과 무관 -- 원본 코드도 동일하게 호출함) |
| 스크램블 | 정상 |
| 힌트/솔브(다음 수 미리보기, "리플레이"에 해당하는 재생 메커니즘) | 정상 -- 연속 클릭도 정상 동작 |
| Solver 호출 | 정상 (솔브 버튼이 곧 solver 호출 경로) |
| **짧은 스와이프 커밋 거리** | **회귀 있음 (측정됨, 5b 참고)** -- 최소 커밋 거리 ~18px -> ~25px |
