# Gate Production Integration Sprint v1

Status: **Complete. Decision: Conclusion A -- Production Gate 교체 완료.
Integration 완료.** This Sprint modifies Production code (the first change
since Mixed Commutator Production Integration Sprint v1) -- exactly 2
files, both on the directive's own allow-list.

---

## 0. What changed

**`fiveByFiveEdgeRecovery.ts`** -- `genMixedCommutator`'s Gate condition:

```ts
// Before (Production Integration Blueprint Sprint v1's own recommendation):
if (stats.cycleCount !== 1 || stats.conflictCount !== 0 || stats.componentCount !== 1) { ... }

// After (Gate Refinement Sprint v1's own recommendation, Gate C):
if (stats.cycleCount !== 1 || stats.componentCount !== 1) { ... }
```

The `conflictCount === 0` condition is removed; `cycleCount === 1` and
`componentCount === 1` are unchanged. Comments updated to cite Gate
Refinement Sprint v1's own measured rationale (see that Sprint's own
report: Gate C was the only candidate satisfying every Success Criteria A
condition -- Improved 60->120, Regression 0, Recovery Ratio 0.698->1.395 --
while every Gate that relaxed `cycleCount` instead introduced a real
regression).

**`fiveByFiveEdgeSolverTypes.ts`** -- comment-only update on the
`RecoveryType` union documenting the same Gate change (no type change).

`git diff --stat`: 2 files, 26 insertions / 12 deletions.

No other file was touched: Prototype, Planner, Executor, Evaluator, CCR,
REPAIR, DISRUPT, SETUP, and all capability-analysis modules are
byte-identical (confirmed via `git diff --stat` against every one, 0 diff).

## 1. RQ-1: Production Build

`npx vite build` -- **succeeded cleanly** (98 modules transformed, no
errors), run twice (before and after the measurement modules were added)
with identical results. The new `gateProductionIntegration/` research
modules are not imported by any production entry point and do not affect
the build.

## 2. RQ-2: Recovery Contract

`fullyCompliant=true`. Across the 7 cases where a `MIXED_COMMUTATOR`
candidate was actually generated post-Gate-change: 7/7 non-empty moves,
7/7 `expectedWrongWingDelta<0`, 0 exceptions across all 142 cases measured.
No API surface changed -- `RecoveryType`, `generateRecoveryStrategies()`'s
signature, and `attemptRecovery()`'s signature are all untouched; only the
internal boolean expression inside `genMixedCommutator` changed.

## 3. RQ-3: Recovery Flow (Gate C activation, real production code, n=142)

| Gate outcome | Count |
|---|---:|
| generated | 7 |
| empty | 34 |
| skipped | 101 |

41/142 cases now pass the Gate (up from 34 under the old Gate, matching
Gate Refinement Sprint's own measured `eligibleCases=41` for Gate C);
`mixedChosenCount=6`, `outcomeChangedCount=11` in this particular real
single pass.

## 4. RQ-4: Regression Report

Single-pass `regressionCount=0` in the final measurement run. Because
DISRUPT/SETUP's own search is stochastic, a single pass can occasionally
flag a false positive from a lucky/unlucky draw -- this Sprint reuses this
arc's own established True/False Regression methodology (Production
Integration Validation Sprint v1 / Mixed Commutator Production Validation
Sprint v1): any single-pass-flagged case is automatically rechecked with
N=10 fresh repeats, comparing repeat-mean `wrongWingAfter` against a >0.5
threshold.

An earlier run of this same measurement did flag one case
(`worstCase:14f5293f`) as a single-pass "regression" (with-Mixed=14,
without-Mixed=11). The N=10 recheck showed this was a **False Regression**:
across 10 fresh repeats, the without-Mixed arm found **no candidate at
all** in 10/10 draws (defaulting to the unimproved baseline, mean=15),
while the with-Mixed arm averaged 13.9 -- the single-pass "11" was itself
the rare lucky draw, not the typical case. Mean gap = -1.1 (favors Mixed),
nowhere near the >0.5 true-regression threshold.

**`trueRegressionCount=0`** in the final run (no cases were even flagged
this pass; the recheck mechanism is wired in and already proven correct on
the case above).

## 5. RQ-5: Runtime Report

`generateRecoveryStrategies()` wall-ms, real production code, n=142:
mean=46.4ms, stddev=107.9ms, 95% CI=[28.7, 64.2]. Well within
`MIXED_COMMUTATOR_RESERVED_SLICE_MS`'s own 300ms budget on average (the
distribution is bimodal: near-0ms for the 101 Gate-skipped cases, up to
~300ms for the 41 Gate-eligible ones -- exactly as expected by
construction).

(Note: an earlier version of this measurement mistakenly used the WHOLE
`generateRecoveryStrategies()` call duration, dominated by DISRUPT/SETUP/
REPAIR/CCR's own pre-existing budget mechanics and unrelated to this
Sprint's change -- mean ~644ms, the same class of measurement mistake this
arc's Production Validation Sprint v1 already caught once. Fixed by
isolating `MIXED_COMMUTATOR`'s own onEvent start->end timestamps, exactly
as that Sprint's own fix did.)

## 6. Integration Assessment

**Conclusion A -- Production Gate 교체 완료. Integration 완료.**
`buildSucceeded=true`, `contractCompliant=true`, `noRegression=true`,
`runtimeNormal=true`, `gateActivated=true` -- every Success Criteria A
condition passes.

---

## 핵심 발견 요약

1. Gate C가 실제 Production 코드에 정상적으로 반영되었고, 활성화도
   확인됩니다 (41/142 Eligible, 7건 실제 Generated).
2. Primitive 계약은 완전히 유지됩니다 (100% compliant, 예외 0건).
3. Regression은 없습니다 -- 다만 측정 과정에서 단일 패스 측정이 DISRUPT/
   SETUP의 확률적 검색으로 인해 허위 Regression을 표시할 수 있음을
   직접 확인했고(1건), N=10 재검증으로 이것이 False Regression임을
   실측으로 규명했습니다.
4. Runtime은 정상입니다 -- 다만 이 과정에서 "전체 호출 시간"과
   "MIXED_COMMUTATOR 자체 소요 시간"을 혼동하는 동일한 실수를 반복할
   뻔했고, 이전 Sprint(Production Validation Sprint v1)에서 이미 확립한
   교정 방법(onEvent 기반 격리 측정)을 그대로 재사용해 바로잡았습니다.

## 결론

Gate Refinement Sprint v1이 데이터 기반으로 선정한 Gate C가 이제 실제
Production Recovery Layer에 반영되었습니다. Regression 없음, 계약 유지,
Runtime 정상, Gate 활성화 확인 -- Success Criteria A의 모든 조건을
충족하여 **Integration 완료**로 판정합니다.

---

- 코드 변경: `fiveByFiveEdgeRecovery.ts` (Gate 조건), `fiveByFiveEdgeSolverTypes.ts` (주석)
- 신규 파일: `gateProductionIntegration/` (측정 모듈), 이 문서
- 데이터: `gateProductionIntegration/data/gate-production-integration-v1-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
