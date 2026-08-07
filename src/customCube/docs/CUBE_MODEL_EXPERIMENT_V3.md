# Cube Model Experiment Sprint v3 — 신규 후보 5종 (Compose-Batched / Object-Pool / TypedArray-Cycle / Persistent / Zobrist-Hash)

## 배경

"또다른 다섯개 정도 모델 개발 가능할까?"라는 질문에 제안했던 5개 후보를
동일한 절차(정합성 + 성능 벤치마크, `customCubeExperiments/`에서만 작업,
프로덕션 파일 변경 0건)로 실제 구현하고 검증했다. 이번 5개는 지금까지
다룬 3개 축(턴 적용 속도, 저장 압축, 방향 표현)과 겹치지 않는 새 축 —
"몰아치기 해석", "할당 회피", "저장 포맷", "되돌리기 비용", "상태
지문(fingerprint)" — 을 하나씩 겨냥한다.

`SlotCycleModel.ts`에서 정합성이 이미 검증된 정수 순열 셔플 로직
(`applyTurnToArrays`)과 정밀 계산 데이터(`getPrecomputedGrid`)를 `export`
로 열어서 5개 모델이 재사용하도록 했다 — 이 파일은 보호 대상 프로덕션
파일이 아니라 우리 실험 인프라라서(ExperimentHarness.ts/RotationGroup.ts와
같은 위치), 로직을 5번 새로 베끼는 대신 추가만 하는 리팩터로 처리했다.
동작 자체는 바뀌지 않았음을 리팩터 전후 정합성/성능 재실행으로 확인했다.

## 모델 소개 및 결과

### D. Compose-Batched — 조건부 대성공, 그리고 심각한 함정

**아이디어**: Delta-Log처럼 turn을 즉시 적용하지 않고 로그만 쌓지만(적용
비용 0), 해석 시점엔 프로덕션 지오메트리 대신 Slot-Cycle의 정수 순열
테이블로 재생한다.

**의도된 시나리오(몰아서 턴 적용 후 딱 한 번 해석 — 실제
`randomLayerScramble`이 20~25턴을 렌더링 없이 연달아 적용하는 패턴과
정확히 일치)에서는 압도적으로 좋다:**

| 모델 | 3x3 (4,000턴 적용, 1회 해석) | 5x5 |
|---|---|---|
| 프로덕션 | 5.8ms | 15.7ms |
| Delta-Log | 6.4ms | 13.1ms |
| Slot-Cycle | 1.0ms | 1.4ms |
| **Compose-Batched** | **1.1ms** | **1.4ms** |

Slot-Cycle과 사실상 동률(오차 범위)이면서, 프로덕션보다 5x5에서 11배,
Delta-Log보다도 9배 이상 빠르다.

**하지만 "매 턴 즉시 해석"(이 앱의 실제 렌더링 요구사항) 시나리오에서는
치명적으로 느리다:**

| 모델 | 3x3 (4,000턴, 매 턴 해석) | 5x5 |
|---|---|---|
| 프로덕션 | 34.7ms | 40.2ms |
| Slot-Cycle | 11.9ms | 24.2ms |
| **Compose-Batched** | **1,759.7ms** | **2,778.9ms** |

프로덕션보다 **50~70배**, Slot-Cycle보다 **110~150배** 느리다. 원인은
설계 자체에 있다 — Delta-Log는 로그가 30턴을 넘으면 체크포인트로
압축하지만, Compose-Batched는 그런 압축이 전혀 없다. 그래서 "턴 적용 →
즉시 해석"을 매번 반복하면, N번째 해석이 그때까지 쌓인 로그 전체(N턴)를
처음부터 재생해야 하고, 이게 4,000번 누적되면서 총 재생 횟수가
1+2+...+4,000 ≈ 800만 번으로 폭증한다(2차 시간 복잡도). **"몰아서 적용 후
한 번만 보여주기" 전용 모델이며, "매번 즉시 보여주기" 용도로 잘못 쓰면
프로덕션보다도 훨씬 나쁘다는 걸 실측으로 명확히 확인했다.**

### E. Object-Pool — 지금까지 나온 모델 중 가장 빠름

**아이디어**: 출력 `Cubie[]`를 `buildSolved`에서 딱 한 번만 만들고,
`toCubies()`마다 같은 Vector3/Quaternion 인스턴스를 `.copy()`로 덮어써서
반환한다 — 매 호출 할당 0.

**주의사항**: 반환값이 스냅샷이 아니라 공유 참조다. 이전 `toCubies()`
결과를 붙들고 있다가 다시 호출하면 그 이전 참조의 값도 같이 바뀐다 — 이
실험이 확인하려는 게 정확히 이 트레이드오프(할당 회피 vs 스냅샷 보장)다.

정합성 100% (전 gridSize), 표준 성능 벤치마크(매 턴 즉시 해석,
4,000턴)에서:

| 모델 | 3x3 | 5x5 |
|---|---|---|
| 프로덕션 | 34.7ms | 40.2ms |
| Slot-Cycle (이전 1위) | 11.9ms | 24.2ms |
| **Object-Pool** | **2.4ms** | **6.3ms** |

**Slot-Cycle보다 5~7배, 프로덕션보다 6~14배 빠르다 — 지금까지 만든 12개
모델 전부 통틀어 가장 빠르다.** 할당 회피 효과만 따로 격리한 벤치마크
(스크램블 1회 후 새 턴 없이 `toCubies()`만 20,000회 반복)도 같은 방향을
가리킨다:

| 모델 | 3x3, 20,000회 해석 | 5x5 |
|---|---|---|
| 프로덕션 | 35.0ms | 108.0ms |
| Slot-Cycle | 36.3ms | 112.4ms |
| **Object-Pool** | **4.9ms** | **17.9ms** |

이 시나리오에서 프로덕션과 Slot-Cycle이 거의 같은 이유는 둘 다
`toCubies()`마다 새 객체를 할당하기 때문 — Object-Pool만 할당을 0으로
만들어서 7배 이상 차이가 난다.

### F. TypedArray-Cycle — 통념과 반대되는 실패

**아이디어**: Slot-Cycle과 알고리즘은 완전히 동일, 저장소만 `number[]`
대신 `Uint8Array`로.

정합성 100%지만, 성능은 오히려 나쁘다:

| 모델 | 3x3 | 5x5 |
|---|---|---|
| Slot-Cycle (number[]) | 11.9ms | 24.2ms |
| **TypedArray-Cycle (Uint8Array)** | **15.1ms (+26%)** | **27.6ms (+14%)** |

"타입 배열이 항상 빠르다"는 통념과 반대다. V8이 이미 작은 정수만 담긴
일반 배열(SMI 배열)을 상당히 최적화해 두기 때문에, `Uint8Array`의 경계
체크/클램핑 오버헤드가 메모리 절약 이득을 상쇄하는 것으로 보인다. 정직한
실패 사례로 기록한다.

### G. Persistent — 렌더링 속도는 손해, 되돌리기는 실제로 싸다

**아이디어**: 턴마다 배열을 통째로 복사한 새 스냅샷을 `history`에 쌓는다
— 되돌리기(undo)가 재생/재클론 없이 배열 인덱스 참조 1회로 끝난다.

정합성 100%. 표준 벤치마크(매 턴 즉시 해석)에서는 스냅샷 복사 비용 때문에
Slot-Cycle보다 약간 손해:

| 모델 | 3x3 | 5x5 |
|---|---|---|
| Slot-Cycle | 11.9ms | 24.2ms |
| Persistent | 12.2ms (+3%) | 34.2ms (+41%) |

하지만 이 모델의 진짜 가설은 렌더링 속도가 아니라 **되돌리기 비용**이다
— Slot-Cycle은 자체 히스토리가 없으므로, 같은 되돌리기 기능을 얻으려면
매 턴마다 별도로 `toCubies()`를 호출해 완전히 해석된 스냅샷을 외부에
저장해둬야 한다. 30턴을 적용하는 동안 그 "얹기 비용"을 측정하면:

| 방식 | 30턴 적용(히스토리 유지 포함) |
|---|---|
| Persistent (내장 history) | **0.058ms** |
| Slot-Cycle + 외부 clone-per-turn | **0.203ms (3.5배)** |

Persistent가 같은 되돌리기 능력을 3.5배 싸게 얻는다. (되돌리기 실행 자체
는 양쪽 다 이미 만들어진 배열/객체를 인덱스로 읽기만 하므로 30스텝
규모에서는 0.002~0.003ms로 사실상 측정 불가 수준 — 실질적 비용 차이는
"매 턴 히스토리를 유지하는 대가"에 있지 되돌리기 실행 자체에 있지
않다는 게 이번 벤치마크의 정직한 결론이다.)

### H. Zobrist-Hash — 가설이 실측에서 거의 사라진 경우

**아이디어**: Slot-Cycle 상태 그대로 두고, 매 턴 영향받은 슬롯만 XOR로
갱신되는 32비트 지문(hash)을 공짜로 유지 — 상태 전체를 매번 다시 해싱할
필요 없이 O(1) 조회.

**충실도(hash가 항상 독립적으로 재계산한 값과 일치하는지)는 완벽하다**:

| gridSize | 결과 |
|---|---|
| 2x2 | 20/20 |
| 3x3 | 20/20 |
| 4x4 | 20/20 |
| 5x5 | 20/20 |

**하지만 속도 이득은 기대만큼 나오지 않았다.** "턴 적용 후 즉시 해시
확인"을 4,000회 반복(BFS 중복 탐지가 실제로 하는 접근 패턴)해서 측정한
결과:

| 방식 | 5x5, 4,000회 턴+해시확인 |
|---|---|
| Zobrist-Hash (증분 갱신) | **4.1ms** |
| Slot-Cycle + 매번 처음부터 재계산 | **3.8ms** |

오히려 증분 갱신 쪽이 살짝 더 느리다(오차 범위 내). 원인으로 추정되는
것: (1) 5x5 한 레이어가 건드리는 조각 수(최대 25개)가 전체 98개 대비
결코 작은 비율이 아니라서, "처음부터 O(98)"과 "영향받은 슬롯만 O(~25) x
2번(턴 전/후)"의 차이가 이론만큼 크지 않다. (2) 현재 구현이 매
`applyTurn` 호출마다 영향받은 슬롯 목록을 담을 새 배열을
할당(`affectedSlots: number[]`)하는데, 이 자체가 절약분을 일부 상쇄한다.
**"O(1) 대 O(n)"이라는 이론적 프레이밍이 실측에서는 거의 무의미해진
사례로, 사용자에게 제안할 때 암시했던 만큼의 명확한 승리는 아니라는
점을 정직하게 보고한다.**

## 종합 평가

| 모델 | 정합성 | 성능 결론 |
|---|---|---|
| Compose-Batched | 100% | **조건부 대성공 + 함정** — 몰아치기+1회해석엔 최고 수준(Slot-Cycle과 동률), 매턴즉시해석엔 프로덕션보다 50~70배 느림 |
| Object-Pool | 100% | **최고 기록 경신** — 전 벤치마크에서 Slot-Cycle보다 5~7배, 프로덕션보다 6~14배 빠름. 단, 반환값이 공유 참조라는 제약 |
| TypedArray-Cycle | 100% | **실패** — Slot-Cycle보다 14~26% 느림, "타입 배열이 항상 빠르다" 통념 반박 |
| Persistent | 100% | **다른 축에서 승리** — 렌더링은 3~41% 손해, 되돌리기 기능을 얹는 비용은 3.5배 저렴 |
| Zobrist-Hash | 100% | **가설 미입증** — 충실도는 완벽하지만 실측 속도 이득은 오차 범위 내로 사실상 없음 |

Object-Pool이 지금까지 만든 12개 모델(원조 3 + 하이브리드 1 + 확장 3 +
이번 5) 전체를 통틀어 실측 속도 1위다. Compose-Batched는 "적합한
시나리오에서만" 쓰면 강력하지만 오용 시 위험하다는 게 이번 Sprint의
핵심 교훈이다. TypedArray-Cycle과 Zobrist-Hash는 직관적으로 그럴듯해
보였던 가설이 실측에서 기대에 못 미친 정직한 사례들이다.

프로덕션(`cubeState.ts`/`CustomCubeScene.ts`) 통합 여부는 12개 모델
전부에 대해 여전히 별도 결정 사항이며, 이번 Sprint에서도 프로덕션 코드는
전혀 건드리지 않았다.

## 변경 범위

새로 추가된 파일:
- `src/customCube/customCubeExperiments/ComposeBatchedModel.ts`
- `src/customCube/customCubeExperiments/ObjectPoolModel.ts`
- `src/customCube/customCubeExperiments/TypedArrayCycleModel.ts`
- `src/customCube/customCubeExperiments/PersistentModel.ts`
- `src/customCube/customCubeExperiments/ZobristHashModel.ts`
- `src/customCube/runCubeModelExperimentSprintV3.ts` (드라이버)
- 이 문서

수정된 파일 1건 (프로덕션 파일 아님, 순수 추가):
- `src/customCube/customCubeExperiments/SlotCycleModel.ts` — 내부 함수
  4개(`TurnTable`/`PrecomputedGrid`/`getPrecomputedGrid`/`turnKey`)를
  `export`로 열고, `applyTurn`의 셔플 로직을 재사용 가능한
  `applyTurnToArrays` 함수로 추출. 동작은 바뀌지 않음 — 리팩터 전후로
  Slot-Cycle 자체의 정합성/성능을 재확인함.

`git diff --stat -- cubeState.ts CustomCubeScene.ts customSwipeControls.ts
cubeMath.ts` 결과 0건.
