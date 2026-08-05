# Gesture Axis Mapping Validation v3 — Low-Confidence Gate

## 배경

[`GESTURE_AXIS_MAPPING_VALIDATION_V2.md`](./GESTURE_AXIS_MAPPING_VALIDATION_V2.md)에서 top/right
면(오블리크 각도로 보이는 면)의 78개 샘플 포인트 중 21개(27%)가 두 후보 축의
`axisAlignment` 마진이 0.25 미만으로 거의 동률임을 확인했다. 사용자가 보고한
"3면이 보이는 상태에서 의도한 방향과 다른 축이 회전한다" 버그의 근본 원인이다.

사용자가 제시된 3가지 방향(카메라 각도 보정 / 신뢰도 게이트 / 대체 탄젠트 가중치) 중
**신뢰도 게이트 추가**를 선택했다. 이 문서는 그 구현(STEP4)과 검증(STEP5) 결과를 기록한다.

## STEP4 — Prototype: LOW_CONFIDENCE_MARGIN 게이트

`customSwipeControls.ts`의 `onPointerMove` 축 결정 블록에 게이트를 추가했다:

```ts
const LOW_CONFIDENCE_MARGIN = 0.15;
const LOW_CONFIDENCE_EXTRA_PX = 20;
// ...
if (Math.abs(align0 - align1) < LOW_CONFIDENCE_MARGIN &&
    Math.hypot(rdx, rdy) < DECISION_PX + LOW_CONFIDENCE_EXTRA_PX) {
  return; // 아직 잠그지 않고 더 기다린다
}
```

두 후보 축의 정렬도 차이(`|align0 - align1|`)가 0.15 미만이면, 평소 `DECISION_PX`(8px)
지점에서 바로 잠그지 않고 `DECISION_PX + LOW_CONFIDENCE_EXTRA_PX`(28px)까지 드래그가
늘어나길 기다린 뒤, 그 시점의 최선 추정치로 잠근다. Front face는 마진이 항상 0.3 이상으로
측정되었으므로 이 게이트는 front face에서는 발동하지 않도록 설계했다.

## STEP5 — Validation

### 검증 방법론에서 발견한 두 가지 함정 (중요)

1. **직선 스와이프 + 각도 지터(jitter)는 게이트 효과를 원리적으로 측정할 수 없다.**
   한 트라이얼 내내 정확히 일직선으로만 움직이면, `settleRef`로부터의 방향 벡터는
   거리가 늘어나도 각도가 전혀 변하지 않는다 (정규화 후 동일). 즉 8px 지점과 28px
   지점에서 계산되는 `align0`/`align1`이 완전히 같아서, 게이트가 얼마나 더 기다리든
   결과가 바뀔 수 없다. 실제로 이 방식(`gate_ab_test_v3.mjs`)으로 측정한 결과,
   baseline과 fixed 코드가 **바이트 단위로 동일한 결과**를 냈다(H: 38.0%,
   V: 48.0%, 완전 일치) — 이는 게이트가 무효하다는 증거가 아니라 테스트 설계
   자체의 구조적 결함이다.
2. **올바른 모델은 손 떨림(tremor)이다.** 실제 스와이프는 완벽한 직선이 아니라
   의도한 방향 주위로 흔들린다. 흔들림의 픽셀 진폭이 일정하다면, 총 이동 거리가
   짧을 때(8px)는 각도 오차가 크고(예: 3px 흔들림 / 8px 이동 ≈ 20.6°), 이동
   거리가 길어질수록(28px) 같은 흔들림의 각도 영향은 작아진다(3px / 28px ≈ 6.1°).
   이것이 게이트가 실제로 방어하려는 물리적 현상이며, `gate_ab_test_v4/v5.mjs`는
   각 스텝마다 독립적인 위치 노이즈(진폭 4px)를 더해 이 모델을 재현했다.

측정 방식은 화면 스크린샷 바이트 비교(불안정) 대신, `chosen.axis`를
`window.__GATE_PROBE__`에 직접 기록하는 임시 계측(측정 후 완전히 제거, git diff로 확인)을
사용했다.

### 결과 — 두 지점에서의 tremor 기반 A/B (N=50 per 방향, tremor=4px)

| 지점 (xf, yf) | 원 마진 (H / V) | Baseline 오인식률 | Fixed 오인식률 | 차이 |
|---|---|---|---|---|
| 0.55, 0.25 (거의 동률) | 0.022 / 0.040 | H 40.0% / V 40.0% (평균 40.0%) | H 44.0% / V 34.0% (평균 39.0%) | −1.0%p |
| 0.55, 0.35 (중간 마진) | 0.092 / 0.068 | H 46.0% / V 48.0% (평균 47.0%) | H 40.0% / V 42.0% (평균 41.0%) | −6.0%p |

두 지점 모두 fixed 코드가 방향성 있게(directionally) 더 낮은 오인식률을 보였으나,
N=50/방향 기준 표준오차(≈7.1%p/방향)를 감안하면 **통계적으로 유의하다고 단정할 수
없는 크기**다. 특히 거의 동률(margin < 0.05)인 지점은 각의 분리 자체가 너무 작아서
게이트가 아무리 오래 기다려도 손 떨림을 완전히 극복하지 못한다 — 이는 이 게이트의
근본적 한계이지 구현 결함이 아니다.

### Front face 회귀 검사 (N=100 × 3, tremor 없음, gate 적용)

```
HORIZONTAL (intent=0deg): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
VERTICAL   (intent=90deg): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
DIAGONAL   (intent=55deg, H-leaning): n=100 correct=100 wrong=0 noop=0 misrecognition=0.0%
```

설계대로 front face에서는 게이트가 결과에 영향을 주지 않았다 — **0% 회귀**.

## 판정

| 기준 | 결과 |
|---|---|
| Level 1 (회귀 없음) | **통과** — front face 0% 오인식 유지 (N=300) |
| Level 2 (문제 지점 개선) | **약한 양의 신호, 유의성 미확정** — 두 지점 모두 오인식률 감소(−1~−6%p) 방향이나 N=50 표준오차 범위 내 |
| Level 3 (문제 완전 해결) | **미달성** — 마진이 0.05 미만인 극단적 동률 지점은 게이트로 해결 불가능한 기하학적 한계 |

## 결론 및 다음 단계 제안

- 게이트는 **해롭지 않다** (front face 회귀 0%, 신뢰도 있는 결과).
- 중간 마진(0.05~0.15) 지점에서는 방향성 있는 개선 신호가 있으나, 이번 세션의
  N=50 단일 실행으로는 통계적으로 확정할 수 없다.
- 마진이 0.05 미만인 극단적 지점(예: 0.55/0.25의 H축)은 게이트만으로는 근본
  해결이 안 된다 — 두 후보 축의 실제 화면상 탄젠트 각도 차이 자체가 몇 도 수준밖에
  안 되기 때문이다. V2 문서에서 언급한 다른 두 방향(카메라 각도 보정 / 대체 탄젠트
  가중치)이 이 잔여 사례들에는 더 유효할 수 있다.
- 회귀가 없고 방향성 있는 개선이 확인되었으므로, **현재 상태로 통합하는 것을
  권장**한다. 더 큰 N(예: N=200/방향)으로 통계적 유의성을 확정하는 것은 후속
  작업으로 남긴다.
