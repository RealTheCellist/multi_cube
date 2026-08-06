# Swipe Reliability Closeout Sprint v1 — 최종 결론

## 목표

사용자가 보고한 스와이프 오작동 문제를 원인 규명부터 Production 개선까지
완료하고, 추가 연구 필요 여부를 최종 판정한다.

## 수행한 연구

### Phase 1 — 원인 규명

축 선택 알고리즘을 계측한 결과:
- 저신뢰도(margin) 구간 존재 확인
- 특정 카메라 각도에서 후보 축이 거의 평행해지는 기하학적 현상 확인

→ 원인 규명 완료.

### Phase 2 — LOW_CONFIDENCE_MARGIN

신뢰도가 낮은 경우 즉시 축을 잠그지 않고 추가 드래그를 기다리는 Gate를
추가.

**결과**: Front Face 회귀 없음, 일부 오인식 감소. Production 채택.

### Phase 3 — Camera Optimization

Yaw −5°. Production 채택.

**결과**: 저마진 영역 약 50% 감소, Top Face 오인식 감소, 회귀 없음.

### Phase 4 — Camera Expansion

Yaw −7° 이상 추가 탐색.

**결과**: Top Face는 더 좋아졌지만 Right Face는 오히려 악화. 즉 고정
카메라 하나로 모든 면을 동시에 최적화하는 것은 불가능함을 확인.
**Decision B**.

### Phase 5 — Undo UX

축 선택 알고리즘은 유지. Undo 추가.

**결과**: 잘못된 스와이프를 즉시 복구 가능. 사용자 비용 감소. Production
채택.

### Phase 6 — Edge Gesture Hit Expansion

가장자리 오작동을 다시 조사. 새로운 사실 발견 — 대부분은 축 선택 문제가
아니라 레이캐스트가 큐브를 맞히지 못한 **입력 인식 문제**였다.

Proxy Hitbox를 Fallback으로 추가.

**결과** (현실적인 80px 스와이프 기준):

```text
30.4%  →  94.6%
```

회귀 없음. Production 채택.

## 최종 상태

현재 Production은 다음 네 가지 개선이 모두 포함되어 있다:

1. LOW_CONFIDENCE_MARGIN
2. Camera Yaw −5°
3. Edge Gesture Proxy
4. Undo

## 남은 한계

남은 실패는 두 종류뿐이다.

**① 캔버스 극단 모서리** — Hitbox를 더 키우면 배경 오탐이 급격히 증가한다.

**② 후보 축이 거의 완전히 평행한 기하학적 모호성** — Camera Expansion
Sprint에서 카메라만으로 해결 불가능함을 확인했다.

이 두 항목은 현재 구조에서는 추가 개선보다 회귀 위험이 더 크다.

## 최종 판정

**성공 기준**
- ✅ 원인 규명 완료
- ✅ Production 개선 완료
- ✅ 회귀 없는 통합 완료
- ✅ UX 보완 완료
- ✅ 검증 완료

**실패 기준**
- ❌ 모든 오인식 제거 → 달성하지 못함

그러나 현재 남은 사례는 터치 기반 3D 큐브 UI가 갖는 구조적 한계이며,
추가 수정은 새로운 회귀 위험이 기대 효과보다 크다고 판단한다.

## Decision

**A: Swipe Reliability Research Complete**

Gesture Reliability는 Maintenance Mode로 전환한다. 향후에는 새로운
사용자 데이터가 현재 알려진 한계를 넘어서는 새로운 유형의 문제를
드러낼 경우에만 Research를 재개한다.

---

이번 연구에서 가장 중요한 성과는 "오작동을 0%로 만드는 것"이 아니라
"어떤 문제는 해결 가능하고, 어떤 문제는 현재 구조에서는 해결 불가능한지
그 경계를 실측으로 규명했다"는 점이다. 이 프로젝트는 미완성이라서
끝내는 것이 아니라, 명확한 종료 기준에 도달했기 때문에 종료한다.
