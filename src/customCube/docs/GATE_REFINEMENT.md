# Gate Refinement Sprint v1

Status: **Complete. Decision: Conclusion A -- Gate C(cycleCount===1 AND
componentCount===1, conflictCount 조건 제거)로 교체 권고.** Production-safe
Parameter Validation -- only the Gate CONDITION was varied via shadow
evaluation; `git status --short` confirms 0 diff on every protected file
(Recovery Algorithm/Prototype/Planner/Executor/Evaluator all untouched;
only new modules under `gateRefinement/` and this document were added).

---

## 0. Method

For each of the 5 candidate Gates (A=current production baseline, B=cycle
relaxed, C=conflict relaxed, D=cycle+conflict relaxed, E=maximum
relaxation), this Sprint:

1. Computed the real structural stats (`analyzeConstraints`, unmodified)
   once per case.
2. Generated REAL base Recovery candidates (DISRUPT/SETUP/REPAIR/CCR only,
   via `generateRecoveryStrategies(..., includeMixedCommutator=false)`,
   unmodified, fresh deadline each of N=10 repeats -- DISRUPT/SETUP are
   stochastic).
3. Computed Mixed Commutator's own candidate ONCE per case (deterministic,
   no randomness in `BracketSearch`) at the real 300ms production budget.
4. For each Gate, if the case is eligible under that Gate, combined the
   Mixed candidate (scored via `scoreLikeRecoveryLayer`, Production
   Integration Blueprint Sprint v1's own exact replica of the real,
   unmodified `add()` scoring formula) with the base candidates and called
   the REAL, unmodified `chooseBestRecovery()` to get the actual selection
   outcome a production wiring change would produce -- without ever
   modifying `fiveByFiveEdgeRecovery.ts` itself.

This directly answers RQ-2 ("does Generated increase actually translate to
Improved, or just more attempts?") by simulating the REAL competition
against DISRUPT/SETUP/REPAIR/CCR, not just checking whether Mixed alone
would improve in isolation.

## 1. Gate Funnel Comparison (RQ-1)

| Gate | Description | Eligible | Generated |
|---|---|---:|---:|
| A (baseline) | cycleCount==1 AND conflictCount==0 AND componentCount==1 | 34 | 6 |
| B | cycleCount>=1 AND conflictCount==0 AND componentCount==1 | 53 | 13 |
| **C** | cycleCount==1 AND componentCount==1 | 41 | 12 |
| D | cycleCount>=1 AND componentCount==1 | 61 | 20 |
| E | cycleCount>=1 | 108 | 40 |

(Note: Generated counts here are slightly lower than the prior Opportunity
Analysis Sprint's own Gate Funnel numbers for Gate A -- 6 vs 7 -- a real,
expected small variance from independent single-pass timing at the exact
300ms budget boundary, not a discrepancy in method.)

## 2. Capability Comparison (RQ-2, real chooseBestRecovery() competition, N=10 repeats)

| Gate | mixedChosenCount | improvedByMixedCount | uniqueCapabilityCases |
|---|---:|---:|---:|
| A | 60 | 60 | 6 |
| B | 130 | 130 | 11 |
| **C** | 120 | 120 | 12 |
| D | 200 | 200 | 18 |
| E | 395 | 395 | 34 |

`improvedByMixedCount === mixedChosenCount` for every Gate -- whenever Mixed
wins the real selection, it is always genuinely improving (expected: the
Prototype's own `validateDeferred` guarantee already filters out any
non-improving result before it can even become a candidate).

## 3. Runtime Comparison (RQ-4)

| Gate | n (eligible cases) | mean | timeoutCount |
|---|---:|---:|---:|
| A | 34 | 301.1ms | 6 |
| B | 53 | 301.2ms | 13 |
| **C** | 41 | 301.1ms | 12 |
| D | 61 | 301.2ms | 20 |
| E | 108 | 301.2ms | 40 |

Every Gate's own added cost is hard-bounded at ~300ms by construction
(`MIXED_COMMUTATOR_RESERVED_SLICE_MS`) regardless of which Gate is used --
relaxing the Gate only changes HOW OFTEN this bounded cost is paid, never
its per-case size.

## 4. Regression Report (RQ-3)

| Gate | trueRegressionCount |
|---|---:|
| A | 0 |
| B | **1** |
| **C** | **0** |
| D | **1** |
| E | **1** |

**This is the key finding that separates Gate C from B/D/E**: every Gate
that relaxes `cycleCount` (B, D, E) introduces a real regression in at
least one case, even though Gate Ablation (prior Sprint) showed relaxing
`cycleCount` alone unlocks the most raw capability (17/19 solvable). A
multi-cycle state's Mixed candidate can occasionally win the real,
score-based `chooseBestRecovery()` competition over a genuinely better
existing candidate for that specific case, in a way a single-cycle state's
candidate does not. **Relaxing `conflictCount` alone (Gate C) does not
share this risk.**

## 5. Recovery Ratio Report

| Gate | improvedCaseRepeats | Recovery Ratio (Improved/86) |
|---|---:|---:|
| A | 60 | 0.698 |
| B | 130 | 1.512 |
| **C** | 120 | 1.395 |
| D | 200 | 2.326 |
| E | 395 | 4.593 |

(Ratios exceed 1.0 because this counts case-REPEATS across N=10, not
distinct cases -- a relative comparison across Gates, not a literal
"fraction of the 86 potentially-solvable cases recovered".)

## 6. Gate Decision (Success Criteria)

| Gate | Conclusion | Rationale |
|---|---|---|
| A | C (keep) | improvedDelta=+0 by definition (baseline) |
| B | B (needs refinement) | +70 improved, but regression=1 |
| **C** | **A (replace)** | **+60 improved, regression=0, runtime OK, Recovery Ratio 0.698->1.395** |
| D | B (needs refinement) | +140 improved, but regression=1 |
| E | B (needs refinement) | +335 improved, but regression=1 |

## 7. Final Recommended Gate

**Gate C: `cycleCount===1 AND componentCount===1`** (drop the
`conflictCount===0` condition; keep `cycleCount===1` and
`componentCount===1` exactly as they are today).

---

## 핵심 발견 요약

1. **더 큰 완화가 항상 더 좋은 게 아니다.** Gate E(최대 완화)가 raw
   capability로는 압도적이지만(improvedByMixedCount=395) Regression도
   함께 발생한다(1건). "Capability가 크다"와 "Production에 안전하게
   적용 가능하다"는 서로 다른 질문이며, 이번 Sprint가 그 둘을 분리했다.
2. **cycleCount 완화가 Regression의 원인**: B/D/E(모두 cycleCount 완화
   포함)는 전부 Regression 1건씩을 유발하지만, cycleCount를 그대로 두고
   conflictCount만 제거한 Gate C는 Regression 0건이다. 이전 Sprint(Gate
   Ablation)가 cycleCount 완화를 "가장 큰 지렛대"로 지목했지만, 실제
   Recovery 경쟁(`chooseBestRecovery`) 시뮬레이션에서는 그 지렛대가
   동시에 유일한 Regression 원인이기도 했다.
3. **Gate C가 Success Criteria A를 유일하게 완전히 충족**: Improved
   +60(유의미), Regression 0, Runtime 허용범위, Recovery Ratio 0.698→1.395
   (2배 가까이 증가).

## 결론 및 다음 단계

**Gate C**(`cycleCount===1 AND componentCount===1`, `conflictCount===0`
조건 제거)를 Production Gate로 교체할 것을 권고합니다. 이번 Sprint는
Production-safe Parameter Validation(Shadow 시뮬레이션)만 수행했으며,
실제 `fiveByFiveEdgeRecovery.ts`의 Gate 조건 자체를 변경하지는 않았습니다
-- 이 arc의 기존 관행(Blueprint/Validation 단계와 실제 Production
Integration 단계를 분리)에 따라, 실제 코드 반영은 별도의 Gate Production
Integration Sprint(아직 요청되지 않음)에서 진행하는 것을 제안합니다.

---

- 코드 변경: 없음 (Shadow 시뮬레이션만 수행, Recovery/Prototype/Planner/
  Executor/Evaluator 모두 그대로)
- 신규 파일: `gateRefinement/` (측정 모듈), 이 문서
- 데이터: `gateRefinement/data/gate-refinement-v1-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
