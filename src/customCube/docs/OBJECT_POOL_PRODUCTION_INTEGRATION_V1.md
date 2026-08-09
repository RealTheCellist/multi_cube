# Object-Pool Production Integration v1

## 배경

`CUBE_MODEL_MASTER_COMPARISON_V1.md`가 정리한 12개 상태모델 실험 중,
"매 턴 즉시 렌더링" 기준 실측 1위였던 **Object-Pool**을 사용자 승인
("옵젝트 풀로")을 받아 실제 프로덕션에 통합했다.

## 범위를 좁힌 이유

`cubeState.ts`의 `Cubie[]` 기반 공개 API(`buildSolvedCube`/`cloneCubies`/
`applyRawQuarterTurn`/`applyMoveToken`/`randomLayerScramble` 등)는
200개가 넘는 솔버 연구 파일이 직접 의존한다. 그중 다수가
`cloneCubies`가 **독립적인 스냅샷**을 준다는 전제로 짜여 있다(백트래킹/
시뮬레이션에 필수). Object-Pool의 핵심 특성인 "반환값이 스냅샷이 아니라
공유 참조"를 `cubeState.ts` 레벨에서 적용하면 이 전제를 깨뜨려 대규모
회귀 위험이 생긴다.

그래서 통합 범위를 **`CustomCubeScene.ts`의 내부 렌더링 상태 표현에만**
좁혔다. `cubeState.ts`의 공개 함수/타입은 1바이트도 바뀌지 않았고,
솔버 쪽에서 계속 쓰는 스냅샷 시맨틱도 그대로 유지된다.

## 적용 전 사실 확인 — 실시간 드래그는 애초에 영향받지 않음

통합하기 전에 실제 호출 경로를 추적했다: 드래그 중 실시간 회전은
`applyRawQuarterTurn`을 전혀 호출하지 않는다 — Three.js 그룹의
쿼터니언을 `setFromAxisAngle()`로 제자리 갱신할 뿐(할당 0)이고,
`applyRawQuarterTurn`은 **턴이 커밋될 때 단 한 번만** 호출된다. 즉
Object-Pool이 줄여주는 할당은 "턴 1회 커밋당" 것이라, 사람이 손으로
치는 속도(초당 1~3턴)에서는 체감 차이가 거의 없을 것으로 예상했다.
아래 실측이 이 예상을 확인해준다.

## 구현

- `cubeState.ts`: `randomLayerScramble`의 내부 로직을 `generateRandomLayerTurns(gridSize, length): RawTurn[]`으로 추출 (순수 데이터 생성 vs 적용을 분리) — 기존 export의 시그니처/동작은 완전히 동일, 순수 추가 리팩터.
- `CustomCubeScene.ts`: `this.cubies: Cubie[]` 필드 뒤에 `poolState: ObjectPoolState`를 추가. 모든 내부 턴 적용 경로(`endTurn`/`undoLastMove`/`resetToSolved`/`scramble`/`applyInstantMove`)를 `objectPoolModel.applyTurn()` + `objectPoolModel.toCubies()`를 거치는 `applyRawTurn()`/`applyMoveTokenToPool()` 헬퍼로 교체. `cubeState.ts`의 `applyMoveToken`/`applyRawQuarterTurn`/`buildSolvedCube`/`randomLayerScramble` import는 전부 제거.
- `getCubies()`(외부에 노출되는 유일한 통로)는 여전히 진짜 `Cubie[]`를 반환한다 — 유일한 실사용처인 `customSolvePlayback.ts`가 이미 `cloneCubies(scene.getCubies())`로 감싸 쓰고 있어(독립 스냅샷) 공유 참조 문제와 무관함을 코드로 확인했다.

## Validation

**정합성 (헤드리스, 실제 프로덕션 함수 대조)**:
`applyRawQuarterTurn`(기존 Ground Truth)과 `objectPoolModel.applyTurn`을
동일한 랜덤 턴 시퀀스에 나란히 적용해 매 턴마다 모든 큐비의
position+orientation을 diff:

| | 결과 |
|---|---|
| gridSize 2/3/4/5, 랜덤 raw turn 500회씩 | position 100% 일치, orientation 100% 일치(부호 무관 비교*) |
| 3x3/2x2 letter-notation(`R U' F2 M E' S2` 등) | 100% 일치 |
| 4개 gridSize 스크램블→역순 적용 라운드트립 | `isSolved()` 양쪽 모두 true, 잔여 diff 0 |

\* 원시 비교에서 나온 "불일치"는 전부 쿼터니언의 부호 반전(`q` vs
`-q`)이었다 — 둘은 물리적으로 완전히 같은 회전이다(`RotationGroup.ts`
자체 주석이 이미 명시하는 SO(3) 이중 피복 현상). 부호를 무시하는
비교로 재검증하니 2,023회 턴 전체에서 **실질 diff 0건**.

**실측 벤치마크** (동일 턴 시퀀스, `CustomCubeScene`이 실제로 쓰는 것과
동일한 호출 패턴 — 매 턴마다 `toCubies()`로 갱신, N=4,000, 5회 중앙값):

| gridSize | 기존(Ground Truth) | Object-Pool | 배수 |
|---|---|---|---|
| 3 | 5.15ms (1.29us/턴) | 2.14ms (0.54us/턴) | **2.40배** |
| 5 | 13.19ms (3.30us/턴) | 5.94ms (1.48us/턴) | **2.22배** |

절대 시간으로는 턴 1회당 1~3마이크로초 수준 — 애니메이션 프레임
예산(16.7ms)의 0.02% 미만이라, 실제 플레이 체감에는 사전 예상대로
차이가 없다. 다만 코드 변경은 실측으로 정합성과 속도 향상 모두
확인됐다.

**기능 회귀 검사** (Playwright, 실제 UI):
- `npx tsc --noEmit`, `npm run build` 통과
- 2×2/3×3/4×4/5×5 전 사이즈에서: 인터리어 스와이프 정상 반영, 스크램블
  후 이동수 0(설계대로 — 스크램블은 undo 대상 아님), 스크램블 후 실제
  스와이프 → 이동수 증가 → 실행취소 → 이동수 정상 복귀, 솔브 버튼 클릭
  시 크래시 없음, 콘솔 에러 0건

## Decision

**적용.** 정합성 실측 100%(2,023턴 + 4개 라운드트립), 기능 회귀 0건,
속도 2.2~2.4배 개선(체감은 미미하나 실측으로 확인). `cubeState.ts`의
공개 API와 200개 넘는 솔버 연구 파일은 전혀 건드리지 않아, 이번
변경의 블라스트 반경은 `CustomCubeScene.ts`의 렌더링 경로 하나로
한정된다.
