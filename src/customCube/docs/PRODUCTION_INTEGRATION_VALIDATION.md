# Production Integration Validation Sprint v1

Status: **Complete. Final Decision: A (Production Release Candidate)**.
Differential-only Sprint per explicit user direction: Level 1/2/3 results
already established by **Production Integration Finalization Sprint v1**
(RELEASE, N=30-trial Primary mean=1.167, 95% CI=[0.634, 1.699] entirely
positive, Cohen's d=0.784, True Regression rate=3.56%) are cited, not
re-computed. This Sprint measures only what that prior Sprint's Directive
did not: an explicit Primitive Interaction Matrix, True-vs-False Regression
classification, and System Stability (Determinism/Retry/Primitive
Stability). Full report:
`productionIntegrationValidation/data/production-integration-validation-v1-report.txt`.

---

## 0. Why differential-only

Before building anything, this Sprint verified that the three Operating
Contracts the new Directive describes (ENDGAME 250ms, Incremental Recovery
140ms, CCR remainingTime+singleCycle, REPAIR) are still exactly as they
were when Production Integration Finalization Sprint v1 released them --
confirmed unchanged by direct source inspection
(`PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS = 250`, `FIXED_BUDGET_MS = 140`,
`runCCRPrototype(..., "singleCycle")`, `includeRepair = true`) and by `git
log` showing no commits to the relevant files since that Sprint's release
commit. Re-running the full N=30 x 335-snapshot validation from scratch
would duplicate already-released work; the user explicitly chose the
differential-only path.

## 1. Method

- **Fresh paired pass**: 75-snapshot stride-sample, one real
  `endToEndSolveProbe()` call per arm (Baseline=450ms reconstructed,
  Integrated=250ms real default) -- reuses the prior Sprint's own probe
  unmodified.
- **Primitive Interaction Matrix**: generalizes the prior Sprint's narrow
  pairwise analyses (CCR<->REPAIR, ENDGAME<->Recovery only) into an
  explicit 8x8 co-occurrence matrix across all Task-layer
  (PAIR/FLIP/PARITY/ENDGAME) and Recovery-layer (DISRUPT/SETUP/REPAIR/CCR)
  primitives.
- **True vs False Regression**: a single-pass "regression" flip could be
  genuine capability loss or pure single-draw noise (solve() is
  shuffle()-driven). For every single-pass flip case, this Sprint reruns
  both arms N=10 times on that exact snapshot and compares repeat-mean
  wrongWingAfter -- a >0.5 mean gap is classified TRUE_REGRESSION,
  otherwise FALSE_REGRESSION.
- **System Stability**: Determinism checked directly (5 snapshots x 5
  repeats); Retry Stability (solve/improve rate variance across N=10
  repeats, 20-snapshot sample) and Primitive Stability (per-primitive
  trigger-rate variance across the same repeats).

## 2. Primitive Interaction Matrix (75 cases, Integrated arm)

Task-layer co-occurrence is total: PAIR/PARITY/ENDGAME appear together in
75/75 cases (FLIP appears once). This matches production's own real
Planner behavior -- these three task types are queued together by design
whenever wing-pairing residuals remain.

**Recovery-layer co-occurrence is 0/75 across every DISRUPT/SETUP/REPAIR/
CCR pair.** This was investigated directly (not assumed) before writing
this document, since it initially looked like a parsing bug in the reused
`EndToEndSolveProbe.ts`. A dedicated check confirmed it is real:
**43/43 triggered-recovery attempts in this subsample hit the
`recovery-no-candidates` trace event** -- every single time Recovery's
precondition fires, all four candidate generators (`genDisrupt1/2`,
`genSetup`, `genRepair`, `genCCR`) return zero viable candidates.

This is not a new problem introduced by this Sprint or a contradiction of
the prior Sprint -- Production Integration Finalization Sprint v1's own
report already flagged "SETUP/REPAIR/CCR offered 건수가 0으로 관측됨" in its
single full-population pass, attributing it to pass-to-pass variance (that
Sprint's smoke test separately saw CCR=3/REPAIR=1). This Sprint's
43-case-confirmed, dedicated recheck shows that "variance" is overwhelmingly
in the direction of zero -- and it **triangulates exactly** with two
independent findings from the parallel research track:

| Sprint | Independent finding |
|---|---|
| This Sprint | 43/43 (100%) triggered-recovery attempts produce zero candidates |
| State Taxonomy Sprint v2 | 0/51 Parity-Gated Cycle cases are RECOVERY_RECOVERABLE |
| Planner Scheduling Investigation Sprint v1 | 0/28 Reachable-but-Unexploited cases resolved via RECOVERY in isolation |

Three separate measurements, three separate methods, same conclusion: for
the current failure population, the Recovery layer's candidate generators
are not the mechanism producing the statistically-validated capability
gain (Primary mean=1.167). That gain is coming from the main pipeline
(PAIR/PARITY/ENDGAME task scheduling under the wider 250ms reserve), not
from Recovery. This does not overturn the RELEASE decision -- the prior
Sprint's own task-attribution data already showed ENDGAME task completion
rate rising 0.90%->3.58% as the primary driver -- but it is a materially
important disclosure for anyone reasoning about *why* the Integration
works.

## 3. True vs False Regression

| | Count |
|---|---|
| Single-pass flips (75-snapshot sample) | 2 |
| **True Regression** (stable across N=10 repeats both arms) | **0** |
| **False Regression** (single-draw noise) | **2** |

Both single-pass flips resolve to noise once repeated: e.g. case
`15f93b0f` showed a worse single-pass draw (Integrated wrongWingAfter=14 vs
Baseline=12) but repeat-means converge (Integrated=12.70 vs
Baseline=12.80, Integrated actually very slightly *better* on average).
This directly reconfirms the prior Sprint's own reasoning (single-pass
census is one stochastic draw, not an estimate) with a dedicated
per-case repeat design rather than a population-level argument.

## 4. System Stability

- **Determinism**: 5/5 sampled snapshots showed *identical* wrongWingAfter
  across 5 repeats each in this run. This does NOT mean solve() has become
  deterministic -- the smoke test for this same driver (a different,
  smaller 3-snapshot sample) showed one snapshot vary (`[12,12,14,14,10]`),
  and this whole research arc has repeatedly and directly confirmed
  solve()'s `shuffle()`-driven stochasticity at much larger sample sizes
  elsewhere (e.g. Coverage Hole Discovery Sprint's 1,420/1,420 repeat-call
  zero-move-loop confirmation). This run's 5-sample check simply didn't
  happen to land on a snapshot with observable variance -- reported here
  exactly as observed, not smoothed over.
- **Retry Stability**: avg Solve-rate Bernoulli variance = 0.00% across 20
  snapshots (every sampled snapshot's solve-rate across repeats was either
  uniformly 0 or uniformly 1 -- no case flipped between solved/unsolved
  across repeats in this particular sample).
- **Primitive Stability**: 0.0pp stddev for every one of the 8 primitives
  across the 20-snapshot sample -- PAIR/PARITY/ENDGAME triggered at 100%
  uniformly, DISRUPT/SETUP/REPAIR/CCR at 0% uniformly (consistent with
  Section 2's finding).

## 5. Release Readiness Matrix

| Criterion | Status |
|---|---|
| Level 1 -- Integration wired correctly | PASS (cited) |
| Level 2 -- Regression within allowance | PASS (cited 3.56%; this Sprint's flip classification found 0 true regressions in fresh sample) |
| Level 3 -- Statistically significant capability gain | PASS (cited, 95% CI entirely positive) |
| Primitive Interaction -- Mutual Exclusion/Starvation | PASS (no CCR/REPAIR contention observed -- because neither ever produces a candidate in this population, see Section 2) |
| System Stability -- Determinism | PASS (informational -- non-determinism is a disclosed design property, not a defect, per this whole research arc's established finding) |
| System Stability -- Retry Stability | PASS (0.00% variance) |
| System Stability -- Primitive Stability | PASS (0.0pp max stddev) |

**Final Decision: A -- Production Release Candidate.**

## 6. File Scope Verification

`git diff --stat` against all protected Solver production files
(`fiveByFiveEdges.ts`, `fiveByFiveEdgeSolverEngine.ts`,
`fiveByFiveEdgePlanner.ts`, `fiveByFiveEdgeExecutor.ts`,
`fiveByFiveEdgeRecovery.ts`, `fiveByFiveCenters.ts`,
`fiveByFiveHumanCenters.ts`, `fiveByFiveHumanEdges.ts`,
`fiveByFiveReduction.ts`, `cubeState.ts`, `goalPlanner/GoalAnalyzer.ts`,
`productionIntegrationFinalization/`) confirms **0 diff**. This Sprint
added only `productionIntegrationValidation/` (new measurement modules)
and this document.

---

## Appendix: Recommendation for a future Sprint

Section 2's triangulated finding (Recovery layer produces zero candidates
across three independent measurements) suggests the Recovery layer's
candidate generators (`genDisrupt1/2`, `genSetup`, `genRepair`, `genCCR`)
may warrant their own dedicated investigation -- not because they cause
any regression (they don't; Level1-3 all PASS), but because a component
that is wired, triggered, and consistently produces nothing is arguably
dead weight in the current architecture for this failure population. This
is explicitly out of scope for this Sprint (Recovery Logic modification is
forbidden by this Sprint's own Directive) and is offered only as a
disclosed observation for a future Sprint to decide whether to pursue.
