# Cube Model Experiment Sprint v1

## 배경

"큐브를 구현하는 데 쓰는 베이스 모델 자체를 새로 발명해서 테스트해보자"는
사용자 제안에 따라, 현재 프로덕션이 쓰는 피스(Cubie) 기반 연속 좌표 모델과는
구조적으로 다른 3개의 새로운 큐브 상태 모델을 설계·구현하고, 프로덕션과
동일한 결과를 내는지(정합성) + 얼마나 빠른지(성능)를 실측했다. **현재
프로젝트(`cubeState.ts`, `CustomCubeScene.ts` 등)는 전혀 건드리지 않고**,
`src/customCube/customCubeExperiments/`라는 완전히 격리된 디렉터리에서
진행했다 -- 순수 회전 수학 함수(`rotateGridVector90`,
`quarterTurnQuaternion`, `buildSolvedCube`, `applyRawQuarterTurn` 등)만
읽기 전용으로 재사용했다.

## 테스트한 3개 모델

| 모델 | 핵심 아이디어 |
|---|---|
| **Delta-Log** | 상태를 저장하지 않고 "체크포인트 스냅샷 + 그 이후 턴 목록"만 저장. 필요할 때만(또는 로그가 30턴을 넘으면) 실제 위치로 재생/압축. |
| **Discrete-Twist** | 피스 방향을 THREE.Quaternion(실수 4개) 대신, 정육면체 회전군의 24개 원소 중 하나를 가리키는 정수 인덱스 1개로 저장 -- 방향 합성이 배열 조회 1회로 끝남. |
| **Slot-Cycle** | 매 턴마다 기하 계산(벡터 회전+쿼터니언 곱)을 하는 대신, gridSize당 딱 1번 "이 턴이 어떤 슬롯들을 어떻게 순열하는지"를 사이클로 미리 계산해두고, 실행 시점엔 정수 배열 셔플 + 회전군 조회만 수행. |

3개 모델 모두 회전군(24개 원소) 자체는 `cubeMath.ts`의 실제 쿼터니언
생성자를 BFS로 닫아서(`RotationGroup.ts`) 유도했다 -- 손으로 표를 만들지
않아 프로덕션 수학과 어긋날 여지가 없다.

## 검증 방법

- **정합성**: gridSize 2/3/4/5 각각에서, 시드 고정 PRNG로 생성한 랜덤 턴
  시퀀스(시퀀스당 80턴) 40개씩을 프로덕션 모델과 각 후보 모델에 동일하게
  적용한 뒤, 결과를 **표현 방식에 무관한 "물리적 스티커 슬롯 → 색상" 맵**으로
  변환해 완전 일치하는지 비교했다(`FaceletSnapshot.ts`) -- 내부 자료구조가
  달라도 눈에 보이는 최종 상태가 같은지만 본다.
- **성능**: gridSize 3/5에서 4,000턴을 두 가지 시나리오로 측정했다.
  - "apply-only": 4,000턴 연속 적용 후 마지막에 한 번만 실제 위치로 해석
  - "apply+resolve every turn": **매 턴마다** 즉시 실제 위치로 해석 --
    렌더러가 실제로 요구하는 조건(스와이프 커밋마다 바로 화면을 갱신해야
    함)과 동일한, 더 엄격하고 공정한 비교 기준.

## 결과

### 정합성 -- 3개 모델 전부 100% 통과

| 모델 | 2x2 | 3x3 | 4x4 | 5x5 |
|---|---|---|---|---|
| Delta-Log | 40/40 | 40/40 | 40/40 | 40/40 |
| Discrete-Twist | 40/40 | 40/40 | 40/40 | 40/40 |
| Slot-Cycle | 40/40 | 40/40 | 40/40 | 40/40 |

(gridSize당 40시퀀스 x 80턴 = 3,200턴, 4개 gridSize 합쳐 모델당 12,800턴 검증)

### 성능 -- "apply+resolve every turn" (렌더러 기준 실측치)

| 모델 | 3x3 (4,000턴) | 5x5 (4,000턴) |
|---|---|---|
| Ground Truth(프로덕션) | 14.4ms (278,708 턴/초) | 35.5ms (112,688 턴/초) |
| Delta-Log | 72.7ms (55,047 턴/초) | 303.2ms (13,195 턴/초) |
| Discrete-Twist | 9.7ms (412,387 턴/초) | 34.9ms (114,498 턴/초) |
| **Slot-Cycle** | **9.2ms (435,154 턴/초)** | **26.6ms (150,527 턴/초)** |

- **Slot-Cycle**이 두 크기 모두에서 가장 빠르다 -- 프로덕션 대비 3x3에서
  1.56배, 5x5에서 1.34배.
- Discrete-Twist도 프로덕션보다 빠르거나(3x3: 1.48배) 대등(5x5: 거의 동일).
- Delta-Log는 이 "매 턴 즉시 해석" 기준에서는 프로덕션보다 확연히 느리다
  (5x5에서 8.5배) -- 체크포인트 이후 로그를 매번 재생하는 구조이기
  때문에, "매 턴마다 실제 위치가 필요하다"는 이 앱의 실제 요구사항과는
  안 맞는다. 다만 "apply-only"(마지막에 한 번만 해석) 시나리오에서는
  프로덕션과 거의 동률(3x3: 6.7ms vs 6.5ms, 5x5: 16.0ms vs 14.1ms)이라,
  스크램블 애니메이션처럼 중간 상태를 안 보여줘도 되는 용도나, 되돌리기/
  히스토리 스크러빙처럼 "전체 이동 로그가 공짜로 따라오는" 용도에는
  여전히 의미가 있다.

## 판정 및 결론: **Slot-Cycle 모델을 "CUBIXX 모델"로 명명**

3개 후보 모두 정합성은 완벽했고, 실제 렌더러 요구사항(매 턴 즉시 해석)
기준으로 Slot-Cycle이 모든 테스트 크기에서 가장 빠르면서 구조도 가장
급진적으로 다르다(런타임에 삼각함수/벡터 연산이 전혀 없음 -- gridSize당
1회 계산해 둔 정수 순열표만 사용). 사용자 지시("성공하는 하나의 모델에
우리 앱 이름을 부여할 것")에 따라 **Slot-Cycle 모델을 "CUBIXX 모델"로
명명한다.**

이번 Sprint는 순수 실험/검증이며, 프로덕션 코드(`cubeState.ts`,
`CustomCubeScene.ts`, `customSwipeControls.ts` 등)는 전혀 수정하지
않았다(git diff 0건 확인). CUBIXX 모델을 실제로 프로덕션에 통합할지는
별도 결정 사항이다.

## 변경 범위

새로 추가된 파일만 존재한다:
- `src/customCube/customCubeExperiments/RotationGroup.ts`
- `src/customCube/customCubeExperiments/FaceletSnapshot.ts`
- `src/customCube/customCubeExperiments/ExperimentTypes.ts`
- `src/customCube/customCubeExperiments/ExperimentHarness.ts`
- `src/customCube/customCubeExperiments/DeltaLogModel.ts`
- `src/customCube/customCubeExperiments/DiscreteTwistModel.ts`
- `src/customCube/customCubeExperiments/SlotCycleModel.ts` (= CUBIXX 모델)
- `src/customCube/runCubeModelExperimentSprintV1.ts` (드라이버)
- 이 문서

기존 파일은 0건 수정.
