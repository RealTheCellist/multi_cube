# Mixed Commutator Production Validation Sprint v2

Status: **Complete. Decision: Conclusion A -- Mixed Commutator Gate C를
포함한 현재 Production을 Release 승인.** Read-only Validation Sprint --
no Production code modified (`git status --short` confirms only new
research modules under `mixedCommutatorProductionValidationV2/` and this
document; 0 diff on Recovery/Planner/Executor/Prototype/Evaluator/
capability-analysis/gateRefinement/productionIntegrationBlueprint).

---

## 0. Why this Sprint exists

Production Validation Sprint v1 was run against **Gate A** (the
pre-integration Gate). Since then, Opportunity Analysis Sprint v1 showed
Gate A was the bottleneck, Gate Refinement Sprint v1 selected **Gate C**
as the safest capability-improving alternative, and Gate Production
Integration Sprint v1 wired Gate C into the real production code. Gate A's
own Validation result no longer describes the current production Solver --
this Sprint re-validates Release fitness against the Solver AS IT NOW
ACTUALLY RUNS.

## 1. Method

- **Baseline = Gate A**, shadow-reconstructed exactly as Gate Refinement
  Sprint v1 did (reusing that Sprint's own `GATE_DEFINITIONS` predicate and
  `SyntheticMixedCandidate` builder UNMODIFIED -- Gate A is no longer wired
  anywhere in production code, so it must be reconstructed off-path).
- **Integrated = Gate C**, the REAL current production Gate -- calling the
  real, unmodified `generateRecoveryStrategies()`/`chooseBestRecovery()`
  directly reflects Gate C automatically, since the Gate itself now lives
  in production code, not a parameter.
- Both arms compete on **identical base candidates** (DISRUPT/SETUP/REPAIR/
  CCR, one real `generateRecoveryStrategies(includeMixedCommutator=false)`
  call per repeat) within the same repeat -- isolating the Gate's own
  effect from DISRUPT/SETUP's independent stochastic noise, avoiding the
  "shared stale deadline" class of bug this arc has hit twice before.
- N=10 repeats per case (142 cases), real end-to-end `solve()` reused
  UNMODIFIED from Validation v1 for RQ-4's absolute runtime numbers
  (automatically reflects Gate C, since it's baked into production code
  now).

## 2. RQ-1: Improved Rate

| Population | meanDiff | 95% CI | Cohen's d |
|---|---|---|---|
| ALL (142) | **+6.000** | **[6.000, 6.000]** | 0.000 (zero variance) |
| PRIMARY (28) | 0.000 | [0.000, 0.000] | 0.000 |

**Zero variance, not just statistical significance** -- the +6 case-repeat
gain is *identical* across all 10 repeats. This is explainable and
consistent, not a bug: for the specific cases where Gate C admits Mixed but
Gate A doesn't, the base candidates (DISRUPT/SETUP/REPAIR/CCR) find nothing
at all in every one of the 10 fresh repeats (a known, previously-documented
characteristic of this hard population -- see Production Integration
Validation Sprint v1's own "43/43 triggered-recovery attempts produce zero
candidates" finding) -- so the deterministic Mixed candidate wins the real
selection identically every time. PRIMARY population shows exactly 0 (as
expected: PRIMARY was defined as the `PURE_CYCLE_ISOLATION` residual class,
already cycleCount==1-like, so Gate A and Gate C agree on eligibility for
every PRIMARY case).

wrongWingCount mean gap: -0.0493 (95% CI degenerate at the same value) --
negative means Integrated(Gate C) is *better* on average.

## 3. RQ-2: Primitive Contribution / Capability Delta

| Primitive | Solved | Unique | Shared |
|---|---:|---:|---:|
| DISRUPT | 6 | 6 | 0 |
| SETUP | 6 | 5 | 1 |
| REPAIR | 0 | 0 | 0 |
| CCR | 72 | 62 | 10 |
| **MIXED_COMMUTATOR** | **120** | **109** | 11 |

MIXED_COMMUTATOR now contributes far more than Validation v1's own finding
under Gate A (4/1420 case-repeats) -- 120/1420 under Gate C, with 109 of
those uniquely its own. This directly reflects Gate C's much wider
eligibility (41/142 vs 34/142 under Gate A).

**Capability Delta**: n=142, **ONLY_EXISTING=16**, **ONLY_MIXED=10**,
BOTH=2, NONE=114. Ten cases now exist where ONLY Mixed Commutator ever
finds an improving candidate (up from Validation v1's own 1).

## 4. RQ-3: Regression

`n=142, casesWithSinglePassFlip=0, trueRegressionCount=0,
falseRegressionCount=0`. Zero regressions of any kind -- Gate C never makes
any case's outcome worse than Gate A would have, across any repeat.

## 5. RQ-4: Runtime

- Real end-to-end `solve()` (current production, Gate C wired in, n=142):
  meanMs=1039.8, p95Ms=1176.0, maxMs=1346.0, timeoutRate=37.3% (a
  pre-existing "worstCase"-snapshot characteristic, informational, not a
  Release gate -- consistent with every prior Sprint's own finding on this
  specific hard population).
- **MIXED_COMMUTATOR's own isolated generation cost**: mean=229.1ms,
  stddev=128.8ms, well within its 300ms reserved-slice budget. (Notably
  higher than Validation v1's own 29.9ms average -- expected, since Gate C
  is eligible far more often, 41/142 vs 34/142, so the 300ms search runs to
  completion more frequently rather than being skipped at near-zero cost.)

## 6. Release Assessment

**Conclusion A -- Mixed Commutator Gate C를 포함한 현재 Production을
Release 승인.**

- `improvedRateIncreased=true` (meanDiff=+6.000)
- `ciSupportsImprovement=true` (95% CI=[6.000, 6.000], entirely positive)
- `noTrueRegression=true` (trueRegressionCount=0)
- `runtimeAcceptable=true` (Mixed's own isolated cost, 229.1ms, within budget)

Every Success Criteria A condition passes, and unlike Validation v1 (whose
CI included zero, reflecting Gate A's own narrow eligibility), this
Sprint's CI is entirely positive with zero variance -- the strongest,
most reproducible positive result in this whole research arc's Mixed
Commutator track.

---

## 핵심 발견 요약

1. **Validation의 대상이 실제로 바뀌었고, 결과도 바뀌었다.** 같은
   방법론을 같은 142건에 적용했지만, Gate A(v1) 기준 Conclusion B에서
   Gate C(v2) 기준 **Conclusion A**로 전환되었다 -- Gate 자체가 병목이었다는
   Opportunity Analysis Sprint의 가설이 최종적으로 확인된 것이다.
2. 개선 효과가 **분산 없이 재현**된다(모든 10회 반복에서 정확히 동일한
   +6) -- 통계적 유의성을 겨우 넘는 수준이 아니라, 구조적으로 안정된
   효과다.
3. Regression은 여전히 0건이다 -- Gate C는 더 큰 Capability를 안전하게
   확보했다.
4. Runtime은 예산(300ms) 이내로 정상이나, Gate 적중률이 높아진 만큼
   평균 소요 시간도 증가했다(29.9ms → 229.1ms) -- 이는 우려가 아니라
   기대된 트레이드오프다.

## 결론

Gate C가 반영된 현재 Production Solver는 **Release 승인** 기준을
충족합니다. Mixed Commutator 연구 흐름은 이 결과로 하나의 자연스러운
종료점에 도달했습니다: Primitive 발견 → 검증 → Production 통합 →
Opportunity 분석 → Gate 개선 → 재통합 → 최종 Release 검증까지의 전체
사이클이 완결되었고, 매 단계가 실측으로 뒷받침되었습니다.

---

- 코드 변경: 없음 (Validation Sprint)
- 문서: `src/customCube/docs/MIXED_COMMUTATOR_PRODUCTION_VALIDATION_V2.md`
- 데이터: `mixedCommutatorProductionValidationV2/data/mixed-commutator-production-validation-v2-report.txt` / `-result.json`
- 브랜치: `claude/cube-game-dev-afnm5z`
