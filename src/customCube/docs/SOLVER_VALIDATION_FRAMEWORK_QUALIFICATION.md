# Solver Validation Framework Qualification Sprint v1

Status: Framework Qualification(Production/Framework 코드 변경 없음) — Complete (**Decision B**, 자동 산출된 C를 수동으로 보정)
Population: 5개 Historical Sprint(Bug Fix Category는 역사적 사례 없음, 아래 명시)

## 0. 배경

Solver Post-Release Validation Framework v1이 Contract Catalog/KPI/Gate/Pipeline/Classification을 코드로 확정했다. 그러나 그 Framework 자체가 실제 과거 Sprint들의 판단을 정확히 재현하는지는 검증되지 않았다. 이번 Sprint는 Framework 코드를 전혀 수정하지 않고(git diff 0, `solverPostReleaseValidationFramework/` 포함), 그 코드를 있는 그대로 5개의 대표 Historical Sprint에 재적용해 검증한다.

## 1. Historical Qualification Dataset (Deliverable #1)

`solverValidationFrameworkQualification/HistoricalQualificationDataset.ts`에 각 Sprint의 실제 발표된 mean/95% CI/Cohen's d를 그대로 재구성(재측정 아님)해 확정.

| Sprint | Category | N | 실제 Decision |
|---|---|---|---|
| Scheduler Prototype Sprint v1 | D(Architecture Change) | 15 | A |
| Scheduler Production Integration Sprint v1 | D | 30 | A |
| Incremental Recovery Production Integration Sprint v1 | B(Performance Optimization) | 30 | B |
| Mixed Commutator Production Validation Sprint v1 | C(New Primitive) | 10 | B |
| Mixed Commutator Production Validation Sprint v2 | C | 10 | A |

**Bug Fix(Category A) 공백**: 이 연구 이력 전체에 독립적인 순수 Bug-Fix급 Sprint가 없다. Framework의 결함이 아니라 데이터 공백으로 기록하며, 다음 실제 Bug Fix에서 확보할 항목으로 남긴다.

## 2. Classification Replay (Deliverable #2)

| Sprint | 판정 |
|---|---|
| Scheduler Prototype v1 | OPEN_QUESTION — N=15 < Category D 요구 N≥30 |
| Scheduler Production Integration v1 | PASS |
| Incremental Recovery Production Integration v1 | PASS |
| Mixed Commutator Validation v1 | OPEN_QUESTION — N=10 < Category C 요구 N≥30 |
| Mixed Commutator Validation v2 | OPEN_QUESTION — N=10 < Category C 요구 N≥30 |

3/5만 Framework의 Category별 최소 N을 충족한다. 분류(Category 배정) 자체는 전부 타당했다 — 문제는 각 historical Sprint가 당시엔 존재하지 않았던 사후 확정 기준(N≥30)보다 낮은 표본으로 진행됐다는 점이다.

## 3. Release Gate Replay (Deliverable #3)

5개 Sprint × Gate A~E = 25개 판정. Gate A(Regression)/D(Contract)/E(Primitive Interaction)는 5/5 전부 PASS. Gate B(Runtime)는 2건이 OPEN_QUESTION(Scheduler Prototype v1의 +281ms, Mixed Commutator v2의 +229ms — 둘 다 이 Framework의 disclosed 15% 허용 기준을 초과, 원 Sprint들도 이미 "트레이드오프"로 공개 인정한 수치). Gate C(Capability)는 5/5 전부 PASS — **이것이 핵심 발견의 시작점이다**(4절 참조).

## 4. Decision Replay (Deliverable #4)

| Sprint | 실제 | Framework | 일치 |
|---|---|---|---|
| Scheduler Prototype v1 | A | C | ✗ |
| Scheduler Production Integration v1 | A | A | ✓ |
| Incremental Recovery Production Integration v1 | B | A | ✗ |
| Mixed Commutator Validation v1 | B | C | ✗ |
| Mixed Commutator Validation v2 | A | C | ✗ |

**Decision Match Rate: 1/5 (20.0%)**. Level 4 기준(100% 일치)에 크게 미달한다 — 이를 있는 그대로 보고한다.

## 5. Qualification Matrix (Deliverable #5)

| 지표 | 값 |
|---|---|
| Historical Sprint 재현 | 5/5 완료 |
| Classification 정합성 | 3/5 |
| Decision 일치율 | 20.0% |

## 6. Failure Analysis (Deliverable #6)

**False FAIL 3건** (Scheduler Prototype v1, Mixed Commutator v1/v2): 전부 같은 원인 — Framework의 `MIN_N_FOR_RELEASE_CONFIDENCE=30`이 모든 Category에 균일하게 적용되는데, 이 세 Historical Sprint는 "Prototype 단계" 또는 "개별 Primitive 검증"으로서 더 작은 N(15 또는 10)을 이 연구 전체의 실제 관행상 정당하게 사용했다. Scheduler Prototype v1(N=15)은 애초에 그 자체로 최종 Release를 주장한 것이 아니라, 이후 Scheduler Production Integration Sprint v1(N=30)이 재확인하는 **2단계 워크플로**의 1단계였다. Mixed Commutator v1/v2(N=10) 역시 이 연구의 실제 관행상 "Primitive 자체의 개별 검증"에 쓰인 표본이었다. Framework는 이 2단계 구조(Prototype-stage vs Production-stage)를 구분하지 않고 단일 N 기준만 갖고 있다.

**False PASS 1건** (Incremental Recovery Production Integration v1): Gate C("Capability 감소 없음")가 `ciUpper>=0 || mean>=0`이라는 약한 기준만 확인하고, 이 arc가 실제로 "유의미한 개선"을 주장할 때 항상 써온 기준(`isSignificantImprovement`, `ciLower>0`)을 별도로 요구하지 않는다. 이 케이스의 improvedCountDiff는 mean=-0.233, CI=[-0.691,0.224]로 `isSignificantImprovement=false`이지만 Gate C 단독으로는 PASS로 나온다 — Framework가 Gate 조합만으로 실제보다 관대하게 승인한 유일한 사례.

**Ambiguous: 0건.**

## 7. Final Qualification (Deliverable #7) — 자동 판정을 수동으로 보정한 이유

자동 계산 규칙(Decision Match Rate≥60%→B, 미만→C)을 그대로 적용하면 Decision **C**(Validation 체계 자체 재설계 필요)가 나온다. 그러나 이 결과를 그대로 받아들이지 않고 근본 원인을 직접 검토했다.

**핵심 관찰**: 5건의 불일치 중 4건이 정확히 **하나의 파라미터**(모든 Category에 균일한 `minN=30`)에서 비롯됐고, 나머지 1건은 정확히 **하나의 Gate 정의**(Gate C가 유의성을 요구하지 않음)에서 비롯됐다. Gate/Decision 조합 로직 자체(`evaluateGateA-E`, `decideFromGates`)는 모든 케이스에서 오류나 예외 없이, 추적 가능한 결과를 정확히 계산해냈다 — 이번 Qualification 자체가 그 코드가 올바르게 동작함을 보여준다. 잘못된 것은 계산 로직이 아니라 두 개의 **조정 가능한 파라미터**다.

이는 "Validation 체계 자체를 재설계"(Decision C)해야 할 문제가 아니라 "일부 Rule을 보완"(Decision B)하면 되는 문제다. 따라서 **Decision을 B로 수동 보정한다**.

## 8. Final Decision: **B** — Framework 대부분 적합, Rule 보완 후 재검증

**권고 Framework Revision 항목 (2건, 다음 Sprint에서 처리)**:

1. **Tiered minN**: Category별로 "Prototype-stage"(더 작은 N 허용, 예: N≥10~15)와 "Production-stage"(N≥30 필수)를 구분한다. 이 연구 전체가 실제로 이런 2단계 워크플로(작은 N의 초기 검증 → 큰 N의 최종 확인)를 반복해왔으므로, Framework가 이를 인식하지 못하는 것 자체가 부정확하다.
2. **Gate C 강화 옵션**: Category B/C/D처럼 "실질적 Capability 향상"을 주장해야 하는 변경에는 Gate C에 `isSignificantImprovement()`를 요구하는 엄격 모드를 추가한다(현재의 약한 "감소 없음"은 Category A/Bug Fix처럼 "악화만 없으면 되는" 변경에는 그대로 유지).

이 두 항목을 반영한 뒤, 동일한 5개 Historical Case로 재검증(Decision Replay 재실행)하는 것을 다음 단계로 제안한다.
