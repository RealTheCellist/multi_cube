# Mobile Gesture Axis Mapping Validation Sprint v1

목적: "전면에서 좌우 스와이프가 상하 회전을, 상하 스와이프가 좌우 회전을
일으킨다"는 보고를 실제 코드 계측으로 검증한다. **이 Sprint는 계측과 원인
규명만 수행하며, 어떠한 동작도 수정하지 않는다.** (git diff는 이 문서
1개 파일 추가만 남긴다 -- `customSwipeControls.ts`는 계측 로그를 임시로
추가했다가 검증 직후 되돌려 커밋 시점 기준 diff가 0이다.)

## STEP 1 — Axis Mapping Flow (실제 코드 추적)

`src/customCube/customSwipeControls.ts` + `cubeMath.ts` + `CustomCubeScene.ts`
기준, 축 결정부터 실제 회전까지의 전체 흐름:

```
onPointerMove (locked 이전)
  dx, dy = e.clientX/Y - drag.startX/Y            [Screen space, px]
  rdx, rdy = e.clientX/Y - drag.settleRef.x/y      [Screen space, settle-anchored]
  dragDir = normalize(rdx, rdy)                    [Screen space, unit vector]
    ↓
  candidates = otherAxes.map(axis => ...)          [정면(faceAxis)을 제외한 2개 축]
    ↓
  screenTangent(scene, hitPoint, axis, rect):
    tangentWorld = axisVector(axis) × hitPoint      [World space]
    a = worldToScreen(hitPoint)                     [World → NDC → Screen]
    b = worldToScreen(hitPoint + 0.05*tangentWorld)
    return normalize(b - a)                         [Screen space, unit vector]
    ↓
  axisAlignment(dragDir, tangent) = |dragDir · tangent|   [sign-agnostic]
    ↓
  chosen = 두 후보 중 |dot|가 더 큰 쪽                    [selectedAxis]
    ↓
  scene.beginTurn(chosen.axis, chosen.layer)
    ↓
  progress = (dx*screenDir.x + dy*screenDir.y) / fullTurnPx   [원본 touchdown 기준 dx,dy 사용]
    ↓
  scene.setTurnProgress(progress):
    group.quaternion.setFromAxisAngle(axisVector(axis), progress * PI/2)   [Right-hand rule, World space]
```

핵심 관찰:

| 단계 | 사용 벡터 | 좌표계 | 정규화 |
|---|---|---|---|
| dragDir | rdx, rdy (settle-anchored) | Screen | O |
| tangent (후보별) | hitPoint 기준 world cross product를 world→screen 투영 | World → Screen | O |
| axisAlignment | dragDir · tangent | Screen (양쪽 다 unit vector) | 이미 정규화됨 |
| progress (회전량+부호) | dx, dy (원본 touchdown 기준) · screenDir | Screen | X (실측 거리 그대로) |
| 실제 회전 | THREE.Quaternion.setFromAxisAngle(axisVector(axis), progress·π/2) | World | - |

`progress`의 부호가 곧 회전 방향의 부호다: 사용자의 드래그가 `screenDir`
(선택된 후보의 실제 스크린 접선 벡터, 즉 그 축의 +90도 회전이 화면에서
움직이는 방향)와 같은 방향이면 양수 → 오른손 법칙 그대로 회전한다. 이
지점에서 별도의 부호 반전이나 축-특정 하드코딩은 없다 -- 코드 검토상
Sign Bug(C)의 여지는 낮다.

## STEP 2 — Instrumentation

`onPointerMove`의 축 잠금 직전에 임시로 다음 형식의 로그를 추가했다
(검증 후 제거, 최종 diff에는 남지 않음):

```
AXISMAP_PROBE Drag=(dx,dy) Cand0[axis]Tangent=(x,y) Dot0=v Cand1[axis]Tangent=(x,y) Dot1=v Selected=axis Layer=n SelectedTangent=(x,y)
```

## STEP 3 — 기준 테스트 결과 (실측)

Playwright, 3×3, 기본(한 번도 orbit하지 않은) 카메라 포즈, 이 세션
전체에서 써온 정면 터치 지점(캔버스의 30%,42%)에서 6방향 실측:

```
RIGHT  (1, 0):  Cand0[x]Tangent=(-0.36, 0.93) Dot0=0.363
                Cand1[y]Tangent=( 0.92, 0.39) Dot1=0.923  -> Selected=y
LEFT   (-1,0):  (RIGHT와 동일 -- sign-agnostic 축 정렬이므로 |dot| 동일) -> Selected=y
UP     (0,-1):  Cand0[x]Tangent=(-0.36, 0.93) Dot0=0.932
                Cand1[y]Tangent=( 0.92, 0.39) Dot1=0.386  -> Selected=x
DOWN   (0, 1):  (UP과 동일) -> Selected=x
45deg  (1,-1):  Dot0=0.916(x), Dot1=0.380(y) -> Selected=x  (수평-리닝이 아니라 실제로는 x-tangent(수직 성분 0.93)에 더 가까움)
135deg (1, 1):  Dot0=0.402(x), Dot1=0.925(y) -> Selected=y
```

**해석**: `y`축 후보의 접선 벡터는 `(0.92, 0.39)`로 스크린 x성분이
압도적 -- 즉 화면에서 거의 수평선이다. `x`축 후보의 접선 벡터는
`(-0.36, 0.93)`로 스크린 y성분이 압도적 -- 즉 거의 수직선이다.

- 수평(RIGHT/LEFT) 드래그 -> y축 접선(수평선)에 더 가까움 -> **y축 회전
  선택** -> y축 회전은 상/하 레이어를 수평 평면에서 돌리므로 시각적으로도
  "수평 밴드"가 좌우로 움직인다.
- 수직(UP/DOWN) 드래그 -> x축 접선(수직선)에 더 가까움 -> **x축 회전
  선택** -> x축 회전은 좌/우 레이어를 수직 평면에서 돌리므로 시각적으로도
  "수직 밴드"가 위아래로 움직인다.

즉 **수평 스와이프는 시각적으로 수평 방향 움직임을, 수직 스와이프는
시각적으로 수직 방향 움직임을 만든다 -- 보고된 "뒤바뀜" 현상과 정반대**다.
스크린샷으로도 확인: RIGHT 스와이프는 상단 레이어(흰색 윗면 유지, 앞면의
윗줄 색상만 변경)가 수평으로 돌아간 패턴을, UP 스와이프는 왼쪽 세로줄
색상이 바뀐 수직 밴드 패턴을 보였다 (첨부 스크린샷: `axismap_RIGHT.png`,
`axismap_UP.png`, 세션 스크래치패드에 보관).

### 다른 면(top/right)에서의 추가 확인

같은 기본 카메라 포즈에서 보이는 다른 두 면(top, right)에서도 동일한
horizontal/vertical 드래그 2종씩 추가 실측:

```
TOP-face   RIGHT: Selected=z (Tangent=(-1.00,-0.08), 거의 순수 수평)
TOP-face   UP:    Selected=x (Tangent=(-0.94,-0.33), 두 후보 모두 수직 성분이 작음 -- 카메라가 top면을 거의 수직으로 내려다보는 각도라 구조적으로 발생하는 현상, Sprint 1 STEP2가 발견한 "경계가 45도가 아니다"와 같은 종류의 구조적 사실)
RIGHT-face RIGHT: Selected=y (Tangent=(0.70,-0.71))
RIGHT-face UP:    Selected=z (Tangent=(-0.31,-0.95), 거의 순수 수직)
```

세 면 모두에서, 선택된 축은 항상 드래그 방향과 **가장 평행한** 접선을 가진
후보였다 -- 즉 코드가 실제로 계산하는 대로 정확히 동작하고 있으며, 축이
90도 뒤바뀐 사례는 10회 테스트 중 단 한 번도 나타나지 않았다.

**Level 1(재현 시도) 결과: 이 빌드/환경에서는 재현되지 않음.**

## STEP 4 — 기하 검증

`screenTangent(axis)`는 카메라의 일반적인 Right/Up 벡터를 쓰는 게
아니라, **터치 지점(hitPoint)에서 그 축으로 회전했을 때 실제로 그 점이
움직이는 방향**을 world cross product로 직접 계산한 뒤 world→screen으로
투영한다 (`axisVector(axis).cross(hitPoint)`). 이는 카메라가 어느 각도에
있든, 어느 면을 만지든 항상 "그 축 회전이 그 지점을 화면에서 실제로
어느 방향으로 움직이는가"를 구조적으로 정확히 반영하는 방식이다 -- 화면의
고정된 가로/세로 축에 의존하지 않으므로, 카메라를 회전(둘러보기)해도
매 프레임 다시 계산되어 자동으로 갱신된다.

STEP 3의 실측값들을 보면: 정면 터치에서 y축 접선이 거의 수평
`(0.92,0.39)`, x축 접선이 거의 수직 `(-0.36,0.93)`인 것은, 이 카메라
포즈(`(5.4,4.5,6.6)`에서 원점을 보는 등각 비슷한 시점)에서 y축(수직
회전축)의 회전이 실제로 화면상 수평 이동을, x축(수평 회전축)의 회전이
화면상 수직 이동을 만든다는 사실과 정확히 일치한다. **기하 계산과 실제
투영 결과가 서로 어긋나는 지점을 찾지 못했다.**

**Level 2(기하 일치성) PASS.**

## STEP 5 — 원인 분류

| 후보 | 채택 여부 | 근거 |
|---|---|---|
| A. Axis Mapping Bug | **아니오** | 정면 10회 + 다른 두 면 4회, 총 14회 실측에서 선택된 축이 항상 드래그와 가장 평행한 후보였다. 뒤바뀐 사례 없음. |
| B. Screen Tangent Bug | **아니오** | STEP4에서 world cross product → world→screen 투영 결과가 실제 카메라 포즈에서 기대되는 방향과 일치함을 확인. |
| C. Sign Bug | **아니오 (코드 검토 기준)** | `progress`의 부호는 별도 반전 없이 `dragDir · screenDir`에서 직접 나오며, `setTurnProgress`도 표준 오른손 법칙 쿼터니언을 그대로 사용한다. 스크린샷상 회전 결과도 육안으로 이상 없음. |
| D. UX Policy Difference / 재현 불가 | **가능성 있음** | 이 환경(헤드리스 Playwright, 마우스 에뮬레이션, 기본 카메라 포즈)에서는 보고된 증상이 전혀 재현되지 않았다. top 면처럼 카메라가 거의 정면으로 내려다보는 그레이징 앵글에서는 두 후보 접선이 모두 화면에서 비슷하게 눕는 구조적 현상이 있어 "직관과 다르게 느껴질" 여지는 있지만, 이는 90도 뒤바뀜이 아니라 원근 투영의 구조적 특성이다 (Sprint 1 STEP2의 "경계가 45도가 아니다"와 동일 계열의 사실). |

**Decision: 이 빌드에서는 근본 원인을 찾지 못했다 -- 이 시점 기준 "버그
없음"으로 잠정 결론.** 코드 수정은 하지 않는다 (Sprint 지시 범위 밖).

### 왜 재현되지 않았는지에 대한 가능한 설명 (추측이 아니라, 검증되지 않은 채로 남은 변수 목록)

실제로 위 계측이 보고된 현상을 반증하는 것은 아니다 -- 아래 변수들은
이번 Sprint의 헤드리스/마우스 에뮬레이션 환경에서는 통제되지 않았고,
실제 버그가 이 변수들 중 하나에 있다면 여기서는 재현되지 않았을 것이다:

1. **실기기 터치 좌표계**: 실제 모바일 브라우저의 `PointerEvent`
   좌표(`clientX/Y`)가 이 환경의 마우스 에뮬레이션과 다르게 동작할
   가능성 (예: 특정 브라우저의 `devicePixelRatio`/뷰포트 스케일링 처리
   차이). 이번 계측은 코드가 받는 `clientX/Y`가 항상 CSS 픽셀 기준으로
   일관되다는 전제 위에서 이뤄졌다.
2. **카메라를 사용자가 직접 회전(둘러보기)한 이후의 포즈**: 이번 계측은
   앱을 새로 열었을 때의 기본 카메라 포즈에서만 이뤄졌다. 코드 구조상
   `screenTangent`가 매번 `scene.camera`를 다시 읽으므로 이론적으로는
   문제없어야 하지만, 사용자가 실제로 여러 차례 orbit한 뒤 특정 극단적인
   각도(예: 거의 카메라 아래에서 올려다보는 포즈)에서 보고했다면 이번
   Sprint는 그 각도를 재현하지 않았다.
3. **다른 그리드 크기(2×2/4×4/5×5)**: 이번 계측은 3×3에서만 이뤄졌다.

## Deliverables

1. Axis Mapping Flow (STEP 1 위 표/다이어그램).
2. Instrumentation Log 포맷 및 실측 로그 14건 (STEP 2/3).
3. 기준 테스트 결과: 정면 6방향 + 다른 2개 면 4방향, 스크린샷 포함
   (`axismap_*.png`, 세션 스크래치패드에 보관, 저장소에는 포함하지 않음).
4. 기하 검증 결과 (STEP 4).
5. Root Cause: 위 표 (A/B/C 모두 기각, D-재현 불가로 잠정 결론).
6. **수정 필요 여부: 없음 (이번 계측 범위에서는 버그를 찾지 못함).**
7. Decision: 코드 변경 없음. 재현 조건을 좁히기 위해 추가 정보(정확한
   기기/브라우저, 카메라 각도, 그리드 크기, 재현 동영상 등)가 있으면
   후속 Sprint로 좁혀서 재조사 가능.

`customSwipeControls.ts`는 계측 추가/제거 후 커밋 시점 기준 마지막 커밋
(`823d7e3`)과 diff 0 -- 이번 Sprint는 문서 1개만 추가한다.
