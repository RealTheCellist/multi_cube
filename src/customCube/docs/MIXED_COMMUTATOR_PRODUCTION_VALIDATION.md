# Mixed Commutator Production Validation Sprint v1

Status: **Complete. Decision: Conclusion B -- Additional Refinement 권장 (Production
Release는 이번 Sprint에서는 승인하지 않음).** This is a **read-only Validation
Sprint** -- no Production code was modified (confirmed below via `git diff
--stat`, 0 diff on every tracked file).

---

## 0. Methodology correction disclosure (read this first)

The first two full measurement passes in this Sprint used flawed metrics
that were caught and fixed **before** any conclusion was drawn from them --
disclosed here in full rather than silently discarded, per this whole
research arc's own "실측 데이터만 사용, 추측 금지" convention:

1. **"Solve Rate" bug**: originally defined as "does a single Recovery
   candidate's own moves alone drive `wrongWingCount` to exactly 0?" A
   single Recovery candidate is one incremental step, not a full re-solve,
   so this was almost never true regardless of arm (informational
   `fullySolvedRateEvaluation` below still shows this: meanDiff=0.000).
   Fixed by redefining the metric as **Improved Rate** -- does Recovery's
   own chosen candidate make genuine progress (`wrongWingAfter <
   wrongWingBefore`)? -- which is what "did Recovery succeed" actually means
   at this layer.
2. **Shared-deadline bug**: `measureCounterfactual` originally computed ONE
   `deadline` value outside the function and passed it to BOTH the
   `withMixed` and `withoutMixed` `generateRecoveryStrategies()` calls. Since
   `withMixed` runs first and its own reserved slices (REPAIR/CCR/
   MIXED_COMMUTATOR are each measured **additively** off the outer deadline,
   not sharing DISRUPT/SETUP's own budget), the first call could itself
   consume real wall-clock time, silently squeezing the second call's
   window against the same fixed absolute deadline -- systematically
   handicapping whichever arm ran second, with nothing to do with
   MIXED_COMMUTATOR itself. This is the exact same class of bug already
   found and fixed once before in this research arc (Production Integration
   Blueprint Sprint v1's `measureInteraction`). Fixed by computing a fresh
   `Date.now() + budgetMs` deadline independently for each of the two calls.
3. A related **timing-attribution bug**: MIXED_COMMUTATOR's "added cost" was
   originally estimated as a whole-call before/after diff
   (`withMixedGenMs - withoutMixedGenMs`), which is confounded by DISRUPT/
   SETUP's own independent stochastic search timing varying between the two
   separate calls. Fixed by measuring MIXED_COMMUTATOR's own isolated wall
   time directly via its own `onEvent` "start" -> "generated"/"empty"/
   "skipped" timestamps.

The first pass (pre-fix) showed a spurious `C_ROLLBACK` (driven by the
solve-rate bug plus an over-broad runtime gate); the second pass (metric #1
fixed, bug #2/#3 still present) showed a spurious, statistically
"significant" `A_PRODUCTION_RELEASE` (meanDiff=+7.1/142, entirely an
artifact of the shared-deadline bug systematically favoring whichever arm
ran first). Neither is reported as a finding -- only the third, fully
corrected pass below is.

---

## 1. Population

n(all)=142, n(PRIMARY)=28, repeats=10 (same population/tagging convention as
every prior Sprint in this arc: PRIMARY/SECONDARY_ONLY/REGRESSION derived
from `primitiveSetCompleteness`'s own classified residual set).

## 2. RQ-1: Solve Rate (== Recovery Improved Rate, corrected metric)

| Population | meanDiff | 95% CI | Cohen's d |
|---|---|---|---|
| ALL (142) | -0.100 | [-1.421, 1.221] | -0.047 (negligible) |
| PRIMARY (28) | +0.500 | [-0.230, 1.230] | 0.424 (small) |

wrongWingCount mean gap (Integrated-Baseline, ALL): -0.0007 (95% CI=[-0.0207,
0.0193]) -- effectively zero.

**Both CIs include zero.** At the ALL-population level the direction is
even slightly negative (pure noise, magnitude negligible). At the PRIMARY
population there's a small positive trend, but it does not exclude zero
either. Honest reading: **no statistically distinguishable Solve Rate
increase at this sample size.**

(Informational only, not used for the Release Assessment: fully-solved-to-
zero rate diff = 0.000 -- confirms metric #1's own diagnosis that this
criterion is structurally near-zero regardless of Mixed Commutator.)

## 3. RQ-2: Primitive Contribution Matrix

| Primitive | Solved | Unique | Shared | (case-repeats out of 1420) |
|---|---|---|---|---|
| BASE (DISRUPT+SETUP+REPAIR) | 10 | 10 | 0 | |
| PARITY | N/A | N/A | N/A | 해당 RecoveryType 없음 -- PARITY는 Recovery Type이 아니라 Task Type이므로 추측 없이 N/A로 보고 |
| CCR | 71 | 71 | 0 | |
| **MIXED_COMMUTATOR** | **4** | **4** | **0** | |
| DISRUPT | 4 | 4 | 0 | |
| SETUP | 6 | 6 | 0 | |
| REPAIR | 0 | 0 | 0 | |

CCR dominates (71/1420 case-repeats), consistent with its own, earlier,
independently-validated Integration Sprint. MIXED_COMMUTATOR contributes a
small, real, always-unique 4/1420 (~0.3%) -- never overlapping with another
type's own improving candidate in the same case-repeat (shared=0 across the
board -- these Gates are structurally disjoint, matching the Blueprint
Sprint's own design).

## 4. RQ-3: Regression (True vs False)

n(cases)=142, casesWithSinglePassFlip=0, **trueRegressionCount=0**,
falseRegressionCount=0. Zero regressions of any kind, at any repeat, for
any case -- MIXED_COMMUTATOR's presence never makes any case's outcome
worse.

## 5. RQ-4: Runtime

- Real end-to-end `solve()` (Integrated arm, current production, n=1420):
  meanMs=1054.6, p95Ms=1255.0, maxMs=1663.0, **timeoutRate=43.1%**.
  This is a **pre-existing characteristic of these "worstCase" snapshots**
  (this whole research arc has repeatedly measured hard snapshots timing
  out under the ordinary pipeline regardless of Recovery/CCR/Mixed
  Commutator) -- not something this Sprint's change caused, and not used
  as a Release gate here.
- **MIXED_COMMUTATOR's own isolated generation cost** (onEvent start->end,
  corrected measurement): mean=29.9ms, stddev=87.9ms, n=1420, well within
  its own 300ms reserved-slice budget. Negligible overhead.

## 6. RQ-5: Capability Delta Classification

n=142: **ONLY_EXISTING=17**, **ONLY_MIXED=1**, **BOTH=0**, **NONE=124**.

One case exists where only MIXED_COMMUTATOR (not DISRUPT/SETUP/REPAIR/CCR)
ever finds an improving candidate across all 10 repeats -- a small, real,
reproducible, unique capability. 17 cases are already covered by existing
Recovery types with no help needed from Mixed Commutator. The overwhelming
majority (124/142, ~87%) are reached by neither -- consistent with this
whole research arc's own repeated finding that the Recovery layer's
candidate generators produce nothing for most of this specific hard
"worstCase" population (see Production Integration Validation Sprint v1's
own Section 2 finding).

## 7. Release Assessment (Deliverable #6)

**Conclusion B -- 향상이 이 표본에서 확인되지 않음 (meanDiff<=0), 추가
Refinement 권장.**

- `solveRateIncreased=false` (ALL population meanDiff=-0.100, not >0)
- `noTrueRegression=true` (trueRegressionCount=0)
- `runtimeAcceptable=true` (Mixed's own isolated cost well within budget)

Regression and Runtime both PASS cleanly -- there is no safety concern with
what was integrated. But Success Criteria A explicitly requires "Solve Rate
증가," and at the full population level this Sprint's real, corrected
measurement does not show a statistically distinguishable increase (both
CIs include zero; the ALL-population point estimate is even slightly
negative, though negligible in magnitude). The real, small, positive
capability MIXED_COMMUTATOR does provide (RQ-2's 4/1420 unique contribution,
RQ-5's 1 ONLY_MIXED case) is real but too rare relative to this population
size to register as a population-level Solve Rate increase.

---

## 핵심 발견 요약

1. **No regression, no runtime cost of concern** -- the integration is safe.
2. **Real but rare unique capability**: MIXED_COMMUTATOR uniquely helps in
   roughly 1/142 cases (and ~4/1420 case-repeats), never overlapping with
   another Recovery type's own contribution.
3. That rate is too small, relative to a 142-case population, to produce a
   statistically distinguishable Solve Rate increase -- Conclusion A's own
   bar ("Solve Rate 증가") is not met at this sample size, even though
   nothing about the integration is unsafe.
4. Two real methodology bugs were caught and fixed mid-Sprint (see Section
   0) before any conclusion was drawn -- both would have produced a
   materially wrong Release decision (C then A) had they gone unnoticed.

## 결론 및 다음 단계

Per this Sprint's own Success Criteria, Conclusion B recommends **추가
Refinement** rather than immediate Production Release or Rollback. Two
honest options for a future Sprint (neither requested yet):

- A much larger sample (beyond these 142 specific hard "worstCase"
  snapshots) to determine whether the real, small, unique capability
  MIXED_COMMUTATOR provides would register as statistically significant at
  scale, given its low but nonzero hit rate.
- Revisit the Gate (`cycleCount===1 AND conflictEdgeCount===0 AND
  componentCount===1`) to see whether a broader, still-safe Gate could
  raise MIXED_COMMUTATOR's hit rate without introducing regression risk.

No code change is recommended based on this Sprint alone; the current
integration (already shipped in Mixed Commutator Production Integration
Sprint v1, commit `9c0c4df`) remains in place, since it carries zero
measured regression risk even though it does not yet clear the bar for an
affirmatively confirmed Production Release under this Sprint's Success
Criteria A.

---

- 코드 변경: **없음** (Validation Sprint, 실행/측정/통계분석/로그분석만 수행)
- 신규 파일: `mixedCommutatorProductionValidation/` (측정 모듈), 이 문서
- 데이터: `mixedCommutatorProductionValidation/data/mixed-commutator-production-validation-v1-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
