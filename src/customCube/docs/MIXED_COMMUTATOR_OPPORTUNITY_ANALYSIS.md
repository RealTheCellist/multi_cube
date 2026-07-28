# Mixed Commutator Opportunity Analysis Sprint v1

Status: **Complete. Decision: Conclusion B -- Gate가 실제 Capability를 막고
있다. Gate Refinement Sprint 진행 권장.** Read-only Research Sprint -- 0
diff confirmed on every protected file (Gate/Prototype/Planner/Recovery/
Evaluator all untouched; `git status --short` shows only new files under
`mixedCommutatorOpportunityAnalysis/` and this document).

---

## 0. Question this Sprint answers

Production Validation Sprint v1 found real technical success (integration
safe, 0 regressions, negligible runtime cost) but no product-level success
yet (ONLY_MIXED=1/142, not statistically distinguishable). Before touching
the Gate or any code, this Sprint asks: **is Mixed Commutator inherently
rare, or does the current Gate just make it look rare?**

## 1. RQ-1: Gate Funnel (n=142)

| Stage | Count |
|---|---:|
| Total | 142 |
| cycleCount===1 | 43 |
| + componentCount===1 | 41 |
| Final Gate (+ conflictCount===0) | **34** |
| Generated (300ms production budget) | **7** |
| Improved | 7 |

Only 34/142 cases even reach the real Gate, and of those only 7 actually
produce a move within the real 300ms production budget.

## 2. RQ-2: Shadow Evaluation (Gate entirely bypassed, extended budget=5000ms)

- Prototype's own looser precondition (any cycle exists): **108/142**
- **Potentially Solvable (shadowSolvable): 86/142**
- `anyDeadlineHit=false` -- the extended budget was enough to fully exhaust
  the search space on every single case; "not solvable" genuinely means
  "the mechanism doesn't find an improving move here", not "ran out of time".

**86 potentially solvable vs only 34 actually let through the Gate, of
which only 7 actually attempted within budget.** This alone is a strong
early signal.

## 3. RQ-3: Gate Ablation (each condition removed independently)

| Condition removed | Newly admitted | Of those, shadow-solvable |
|---|---:|---:|
| cycleCount===1 | 19 | **17** |
| componentCount===1 | 1 | 1 |
| conflictCount===0 | 7 | **7** |

**cycleCount===1 is by far the most restrictive condition** -- relaxing it
alone admits 19 new cases, 17 of which are genuinely solvable (89%
efficiency). **conflictCount===0 is smaller but perfectly "wasted"** -- every
single one of the 7 cases it alone excludes is solvable (100%). The
**componentCount===1 condition is nearly irrelevant** -- it only excludes 1
case beyond what the other two already exclude.

## 4. RQ-4: Priority Reorder Test (near-miss cases, n=13)

13 cases pass the real Gate but fail to generate within the real 300ms
budget, despite being shadow-solvable at 5000ms. Tested two alternate
`PATTERN_PAIR_PRIORITY` orderings (REVERSED, PARITY_FIRST) against these 13
cases at the same real 300ms budget: **neither variant rescued any of them.**
This is useful negative evidence -- the 300ms shortfall for these
Gate-passing cases is a genuine **budget** constraint, not an **ordering**
one; reprioritizing which pattern pair is tried first cannot fix it, only
a larger budget (or a cheaper search) could.

## 5. RQ-5: Opportunity Matrix / Opportunity Loss

| Population | Eligible | Improved | Potentially Solvable | Lost |
|---|---:|---:|---:|---:|
| PRIMARY | 28 | 5 | 18 | 0 |
| SECONDARY_ONLY | 0 | 0 | 10 | 10 |
| REGRESSION | 6 | 2 | 58 | 56 |
| **ALL** | **34** | **7** | **86** | **66** |

**Opportunity Loss (ALL) = 86 - 34 = 52.**

Two distinct findings worth separating:
- **PRIMARY population (Lost=0)**: every PRIMARY case already passes the
  Gate by construction (PRIMARY was originally defined as the
  PURE_CYCLE_ISOLATION residual class, itself cycleCount==1-like). Here the
  gap is 18 potentially-solvable vs only 5 actually-improved-at-300ms -- a
  **budget** gap (confirmed by RQ-4: reordering doesn't help), not a Gate
  gap.
- **SECONDARY_ONLY and REGRESSION (Lost=10, 56)**: these are genuinely
  excluded by the Gate's structural conditions (mostly cycleCount>1, per
  the Ablation), and would need Gate relaxation, not just a bigger budget,
  to reach.

## 6. Recommendation (Deliverable #5)

**Conclusion B -- Gate가 실제 Capability를 막고 있다. Gate Refinement
Sprint 진행 권장.**

Opportunity Loss=52 (far above the negligible threshold), and the mechanism
itself (Shadow Evaluation, Gate entirely removed) is far from exhausted
(86/142 solvable) -- this rules out Conclusion C (mechanism-limited) just as
clearly as it rules out Conclusion A (Gate already near-optimal).

---

## 핵심 발견 요약

1. **Gate가 압도적 병목**: 142건 중 86건이 실제로 개선 가능하지만, 현재
   Gate는 34건만 통과시키고 그중 7건만 실제로 예산 내에서 성공.
2. **cycleCount===1이 가장 큰 병목** (19건 배제, 17건 실제 해결 가능,
   89% 효율), **conflictCount===0도 완전히 낭비되는 배제** (7건 배제,
   7건 모두 해결 가능, 100% 효율), **componentCount===1은 거의 무의미**
   (1건만 영향).
3. PRIMARY 모집단 내부에는 별도의 **예산(budget) 병목**도 존재 (28건 중
   18건 잠재적 해결 가능이나 5건만 300ms 내 실제 성공) -- 우선순위
   재정렬로는 해결되지 않음(RQ-4), 예산 증가가 필요한 별도 이슈.
4. Shadow Evaluation은 모든 케이스에서 탐색 공간을 완전히 소진했음
   (anyDeadlineHit=false) -- "해결 불가"는 시간 부족이 아니라 실제
   Mechanism의 한계를 의미.

## 결론 및 다음 단계

Gate Refinement Sprint(아직 요청되지 않음)가 자연스러운 다음 단계이며, 이
Sprint의 실측 데이터가 그 설계를 직접 뒷받침합니다:
- cycleCount===1 조건 완화가 가장 큰 지렛대 (우선순위 1순위)
- conflictCount===0 조건 완화도 100% 효율로 유효 (우선순위 2순위)
- componentCount===1 조건은 그대로 유지해도 손실 거의 없음
- PRIMARY 모집단 내에서는 Gate 완화와 별개로 예산 증가도 함께 고려할 가치
  있음 (우선순위 재정렬만으로는 해결 안 됨, RQ-4 실측 확인)

이번 Sprint에서는 Production 코드, Gate, Prototype, Planner, Recovery,
Evaluator를 전혀 수정하지 않았습니다.

---

- 코드 변경: 없음 (Research Sprint, Shadow 실행만 수행)
- 신규 파일: `mixedCommutatorOpportunityAnalysis/` (측정 모듈), 이 문서
- 데이터: `mixedCommutatorOpportunityAnalysis/data/mixed-commutator-opportunity-analysis-v1-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
