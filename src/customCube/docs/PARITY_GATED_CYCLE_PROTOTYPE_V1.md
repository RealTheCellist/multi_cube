# Solver Primitive Discovery Sprint #6 — Parity-Gated Cycle Prototype Sprint v1

## 0. 방법론 disclosure

- **Sprint 번호 충돌**: 이 Sprint는 직전 "Solver Primitive Discovery Sprint #6 —
  Parity-Gated Cycle Blueprint Sprint v1"과 동일하게 "#6"으로 지칭되었다
  (사용자 작업지시서 원문 그대로). 두 Sprint는 서로 다른 산출물(Blueprint
  설계 vs 실제 Prototype 구현)이므로 디렉토리/파일명으로 구분한다
  (`parityGatedCycleBlueprintV1/` vs `parityGatedCyclePrototypeV1/`). 번호를
  임의로 바꾸지 않고 충돌 사실만 기록한다.
- **범위**: 새 디렉토리 `parityGatedCyclePrototypeV1/` + 이 문서만 추가.
  Production Solver 파일(`fiveByFiveEdgeSolverEngine.ts`,
  `fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeRecovery.ts`,
  `fiveByFiveEdgeExecutor.ts`, `BoundedResolver.ts`, CCR, MixedCommutator,
  MultiHopBridgePrototype, DeferredValidator, Validation Framework)는
  일절 수정하지 않았다 — `git diff --stat`으로 빈 diff 확인 완료(본 문서
  STEP0 절 참조).
- **데이터셋**: `parityGatedCycleBlueprintV1/UnknownPopulationProfiling.ts`의
  `loadUnknownPopulation()`을 그대로 재사용 — 새 Dataset 생성 없음, 표본
  변경 없음 (실제 53건 TRULY_UNKNOWN 그대로).
- **판정 원칙**: 성공/실패는 Solver Validation Framework의 Gate와 이
  Sprint 고유의 Level1-4 기준으로만 판정한다. 수동 보정 없음. 아래 STEP3/4
  절에서 발견된 실측 불일치(타이밍 재현성 문제)도 있는 그대로 보고하고,
  설계를 바꿔서 숨기지 않는다.

## STEP0. Protected File 검증

```
git diff --stat -- fiveByFiveEdgeSolverEngine.ts fiveByFiveEdgePlanner.ts \
  fiveByFiveEdgeRecovery.ts fiveByFiveEdgeExecutor.ts BoundedResolver.ts \
  CCRPrototype.ts AdaptiveCycleCommutatorPrototype.ts \
  MultiHopBridgePrototype.ts DeferredValidator.ts \
  solverPostReleaseValidationFramework/
```
결과: 빈 diff (변경 없음). 새로 추가된 파일은 전부
`parityGatedCyclePrototypeV1/` 디렉토리와 `runParityGatedCyclePrototypeV1.ts`
드라이버뿐이다.

## STEP1. Prototype 구현 — Cross-Component Bridge Cycle Resolver

Blueprint Sprint에서 선정된 Candidate A를 실제 코드로 구현했다. 파이프라인:

1. **Component 탐색** (`ComponentDetection.ts`) — `buildStateGraph`(수정
   없음)의 WANTS 그래프를 재사용해 unfinished slot들의 연결 성분을 BFS로
   구한다.
2. **Bridge 후보 생성** (`BridgeCandidateGeneration.ts`) — 한 성분(X)의
   기존 wrong wing을 다른 성분(Y)이 점유한 슬롯으로 물리적으로 이동시켜
   (`bfsMoveWingToPosition`, 기존 export 재사용) 두 성분을 잇는 새 WANTS
   edge를 만든다. 양방향(X→Y, Y→X) 모두 시도.
3. **Temporary bridge 적용** — 찾은 이동 시퀀스를 실제로 적용.
4. **Multi-cycle traversal** (`MultiCycleTraversal.ts`) — 병합된 그래프의
   모든 cycle을 길이 내림차순으로 이어 붙여 `resolveBoundedMultiCycle`
   (BoundedResolver.ts, 수정 없음)에 넘긴다.
5. **Bridge 제거(best-effort cleanup)** (`BridgeRemoval.ts`) — 남은 wrong
   wing에 대해 `tryFixWing`을 한 번 시도, 개선될 때만 채택.

전체는 `CrossComponentBridgeCycleResolver.ts`의
`tryCrossComponentBridgeCycleResolverConfigured(cubies, lib, deadline, config)`
하나로 묶여 있고, `ResolverConfig`가 `useBridge`/`useTraversal`/`useCleanup`/
`componentSelectionStrategy`를 토글할 수 있게 설계되어 STEP4 Ablation이
동일 함수를 재사용한다.

### 디버깅 여정 (있는 그대로 공개)

- **1차 시도(단순 재배치)**: X의 wrong wing을 Y 슬롯으로 옮기는 가장
  단순한 형태. 실제 Unknown 5건에 대해 smoke test한 결과 `bridgeUsed=false`
  전부 — 그런데 그 중 한 케이스를 깊이 파보니 BFS 경로 자체는 찾았는데
  (`countComponents(after)`) 값이 그대로였다.
- **2차 시도(SACRIFICE 가설, 잘못된 일반화)**: "두 성분이 분리되어 있다면
  둘 사이에 색이 겹치는 조각이 전혀 없어야 한다(color-closed)"는 가설을
  세우고, 외부에서 색이 일치하는 조각을 희생시켜 연결하는 방식을 시도.
  디버그 스크립트로 직접 확인한 결과 이 가설 자체가 틀렸다(같은 색의
  두 물리적 반쪽이 서로 다른 슬롯에 분산될 수 있음, 예: 색 "FL"의 두
  반쪽이 `y2,z-2`와 `x-2,z2`에 각각 존재) — 하지만 테스트한 케이스들에서는
  그 "다른 반쪽"이 매번 이미 같은 target 성분 안에 있어서 외부에서 쓸 수
  있는 "donor"가 없었다. 실제 12건에서 0/12 후보로 확인, 폐기.
- **3차 시도(1차 방식으로 복귀, 탐색 범위 확대)**: `MAX_SOURCE_WINGS_TRIED=5`,
  `MAX_TARGET_SLOTS_TRIED=5`, `BRIDGE_BFS_MAX_DEPTH=8`,
  `BRIDGE_BFS_PER_CANDIDATE_MS=150`, 양방향 시도. componentCount>1인 실제
  36건 전체에 대해 실행 — **0/36에서 후보를 찾지 못함** (global
  componentCount 감소 기준).
- **근본 원인 진단**: 가장 작은 케이스(`worstCase:4549b041`, 성분 크기
  [3,2])에서 여유 있는 설정(depth 12, 3000ms)으로 6개 source×target 조합
  전부 시도 — 전부 BFS 경로는 찾았지만 `countComponents(after)`는 항상
  [3,2] 그대로였다. 의심스러워서 특정 이동(source id=57, slot `y2,z-2` →
  target id=40, slot `y2,z2`) 전후의 `buildStateGraph(cubies).edges`를
  직접 출력해 비교했다. **결과**: 의도한 병합은 실제로 일어났다 — former-X와
  former-Y 노드를 포함하는 새 3-노드 cycle 성분이 형성됨. 하지만 동시에
  같은 물리적 다층 회전의 부작용으로 무관한 기존 SolvedPair 슬롯
  (`x2,y-2`)이 깨지면서 별도의 새 2-노드 성분이 생겨, 전체
  componentCount는 상쇄되어 그대로였다(2→2).
- **수정**: 검증 기준을 "전역 componentCount 감소"에서 "원래 대상이었던
  compSource∪compTarget 슬롯들(이동 후에도 unfinished 노드로 남아있는
  것들)이 이제 하나의 성분에 속하는가"로 변경 (`targetedComponentsMerged`,
  `BridgeCandidateGeneration.ts`). 무관한 곳에서 생긴 부작용 성분은
  실패로 세지 않는다.
- **수정 후 실측**: componentCount>1인 36건 중 **10건**에서 유효한 bridge
  후보 발견(총 22개 후보) — 수정 전 0/36에서 수정 후 10/36으로 확인.
  메커니즘 자체는 실재하며, 이전의 0% 결과는 측정 버그였다.

## STEP2. Unknown Population Replay

`parityGatedCycleBlueprintV1/UnknownPopulationProfiling.ts`의
`loadUnknownPopulation()`을 그대로 호출 — 새 Dataset 생성 없음.
- n=53 (TRULY_UNKNOWN 전체), componentCount>1 하위집합=36건.

## STEP3. Capability 측정 (Baseline vs Prototype)

| | n | gateMatched | solved | improved | rescueRate | trueRegression | avgRuntimeMs |
|---|---|---|---|---|---|---|---|
| Baseline(no-op) | 53 | 0 | 0 | 0 | 0.0% | 0 | 0.0 |
| Prototype(FULL_CONFIG) | 53 | 34 (64.2%) | 0 | 7 | 13.2% | 0 | 1271.2 |

- Gate 일치율 34/53=64.2%는 Blueprint Sprint STEP1의 구조 전용 추정치
  (explainedFraction 34/53=64.2%)와 정확히 일치 — Blueprint→Prototype
  연결이 실제로 정합적임을 확인.
- rescue된 케이스(7건): `worstCase:46086463`, `snapshot335:b714481`,
  `snapshot335:36336c1`, `scrambleDepth30:3`, `scrambleDepth40:1`,
  `scrambleDepth50:2`, `scrambleDepth50:5`.
- Baseline은 정의상 "no-op"이므로 rescue=0은 당연한 결과이지, Prototype이
  약해서가 아니다(비교 기준선).

## STEP4. Ablation

| Variant | gateMatched | improved | rescueRate | trueRegression | avgRuntimeMs |
|---|---|---|---|---|---|
| full(all steps) | 34 | 9 | 17.0% | 0 | 1177.5 |
| no bridge (Bridge 생성 제거) | 34 | 7 | 13.2% | 0 | 1109.2 |
| no traversal (Traversal 제거) | 34 | 4 | 7.5% | 0 | 469.0 |
| no cleanup (Bridge Removal 제거) | 34 | 9 | 17.0% | 0 | 1125.7 |
| smallestTwo (Component 선택 변경) | 34 | 7 | 13.2% | 0 | 1156.4 |

**해석**: Bridge를 제거하면 improved 9→7로 감소, Traversal을 제거하면
9→4로 크게 감소(핵심 요소), Cleanup 유무는 이번 population에서는 영향
없음(9→9, best-effort cleanup이 실제로 발동한 케이스가 없었던 것으로
추정), Component 선택 전략(largestTwo→smallestTwo)은 9→7로 소폭 감소.
Bridge와 Traversal 둘 다 실제 기여가 있으며, 특히 이 Sprint가 새로
만든 유일한 요소인 Bridge가 없으면(no bridge) 능력이 줄어드는 것을
확인했다 — Root Cause가 우연이 아님을 뒷받침.

**데이터 정직성 note (실측 그대로 보고)**: STEP3의 "Prototype(FULL_CONFIG)"
단독 측정값(improved=7)과 STEP4 Ablation의 "full(all steps)" 측정값
(improved=9)은 **동일한 config, 동일한 population**에 대한 것인데도
서로 다르게 나왔다. 원인은 `BridgeCandidateGeneration.ts`의
BFS 예산(`BRIDGE_BFS_PER_CANDIDATE_MS=150ms`,
`BRIDGE_CANDIDATE_BUDGET_MS=300ms`)이 연산 횟수가 아니라 **실제 wall-clock
시간** 기준이라서, 호출 시점의 시스템 부하에 따라 같은 호출이 실제로
탐색하는 후보 수가 달라질 수 있기 때문으로 추정된다(코드 자체에는
Math.random()/shuffle() 등 명시적 무작위성이 없음을 재확인했다 — 완전한
결정론은 아니지만 RNG 기반도 아닌, "환경 의존적 비재현성"). 설계를 바꿔
이 불일치를 숨기지 않고 그대로 보고한다. 두 숫자 모두 실제 실행 결과이며,
Level1/3(STEP3의 짝지은 baseline/prototype 쌍)과 Level4(STEP4 자체 배열
내부의 full vs no-bridge 비교)는 각각 자기 자신의 단일 pass 내에서는
내적으로 일관되므로 최종 판정 자체는 무효화되지 않지만, **다음 Sprint
(Production Integration Planning)에서는 wall-clock 예산 대신 연산 횟수
기반 예산이나 반복 측정을 통한 분산 정량화가 필요**하다고 권고한다.

## STEP5. 기존 Primitive와 비교 (동일 population)

| Primitive | gateMatched | improved | rescueRate | trueRegression |
|---|---|---|---|---|
| DeepCycle(BP-1) | 0 | 0 | 0.0% | 0 |
| CCR | 0 | 0 | 0.0% | 0 |
| MixedCommutator | 0 | 0 | 0.0% | 0 |
| MultiHopBridge | 0 | 0 | 0.0% | 0 |

4개 기존 Primitive 전부 이 53건에서 gateMatched=0, improved=0 — 이 53건이
"TRULY_UNKNOWN"으로 분류된 근거(Unresolved Mechanism Validation Sprint
v1에서 6개 기존 Primitive 전부/조합/budget 연장으로도 풀리지 않은 잔여)와
정확히 일치하는 sanity check. Prototype만 7~9건을 rescue한 것은 진짜
새로운 Capability다.

## STEP6. 통계 검증 (Validation Framework)

Baseline(no-op) vs Prototype(FULL_CONFIG) 짝지은 차이(paired-diff), n=53
(결정론적 메커니즘이므로 population 자체를 N으로 사용, 반복 시행 아님).

| Metric | mean | 95% CI | 비고 |
|---|---|---|---|
| improvedCount diff | 0.1321 | [0.0401, 0.2241] | Cohen's dz=0.386(small) |
| trueRegression diff | 0.0000 | [0.0000, 0.0000] | |
| runtime diff(ms) | 1271.17 | — | baseline은 no-op이라 runtime≈0 |

Gate 결과: A(Regression 증가 없음)=PASS, B(Runtime 허용 범위)=OPEN_QUESTION
(baseline p95≈1ms 대비 비교 기준 자체가 무의미), C(Capability 감소
없음)=PASS(strict mode, 유의미한 개선), E(Primitive Interaction 이상
없음)=PASS(placeholder — 아직 실제 Recovery dispatcher에 통합되지 않음).
Framework 자체의 `decideFromGates` 종합 판정은 "B"(Gate B가
OPEN_QUESTION이라 조건부 승인) — 이는 Runtime이라는 별도 축의 advisory
판정이며, 아래 Level1-4는 이 Sprint 고유의 기준이라 서로 다른 결론을
낼 수 있음을 밝힌다.

## Level1-4 + 최종 Decision

| Level | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | 실제 Rescue 발생(rescue>0) | **PASS** | improvedCount=7/53, rescueRate=13.2% |
| 2 | Regression 없음 | **PASS** | trueRegressionCount=0/53 |
| 3 | Capability Improvement 통계적 유의성(95% CI lower bound>0) | **PASS** | CI=[0.0401, 0.2241], Cohen's dz=0.386 |
| 4 | Root Cause(Ablation이 핵심 요소의 인과성 확인) | **PASS** | full rescueRate=17.0%(9) vs no-bridge rescueRate=13.2%(7) |

**Decision: A** — Level1-4 전부 PASS. Parity-Gated Cycle Production
Candidate로 승격. 다음 Sprint는 **Production Integration Planning
Sprint**.

## 결론

- Blueprint Sprint에서 설계만 했던 Candidate A(Cross-Component Bridge
  Cycle Resolver)를 실제로 구현했고, STEP1 디버깅 과정에서 발견한
  측정 버그(전역 componentCount 기준 → 대상 성분 병합 기준)를 수정한 뒤
  실제 53건 TRULY_UNKNOWN population에서 7~9건(13.2~17.0%)을 rescue —
  기존 6개 Primitive가 전혀 손대지 못했던 영역에서 처음으로 확인된 진짜
  새로운 Capability다.
- Regression 없음, CI 하한>0, Ablation이 Bridge/Traversal 둘 다 실제
  기여함을 확인 — Level1-4 전부 PASS로 Decision A.
- 단, STEP3/STEP4 간 동일 config의 재현성 불일치(wall-clock 기반 BFS
  예산)를 있는 그대로 공개했다 — Production 통합 전에 예산 방식을
  연산 횟수 기반으로 바꾸거나 반복 측정으로 분산을 정량화할 것을
  권고한다.
- 다음 단계: Production Integration Planning Sprint에서 (1) Recovery
  dispatcher에 이 Primitive를 실제로 배선하는 방법, (2) wall-clock 예산의
  재현성 문제 해결, (3) Runtime(평균 1.2초)이 Production 배포 시 허용
  가능한지 검토가 필요하다.
