# Incremental Recovery — Production Integration

Status: written at Incremental Recovery Production Integration Sprint v1
(2026-07-22), **Decision B**. Full driver report:
`solverPrimitiveIncrementalRecoveryProductionIntegration/data/incremental-recovery-production-integration-v1-report.txt`
(335 real snapshots for the per-call probe; 75-snapshot stride-sample x
30 real end-to-end trials for the whole-solve benchmark).

---

## 1. The Production wiring (STEP1)

For the first time in this whole research arc, Architecture Prototype
Refinement Sprint v1's own confirmed **140ms Fixed Budget Operating
Contract** was connected to a real production call site:

- `fiveByFiveEdges.ts`'s `tryFixWing()` gained an optional
  `perCallBudgetMs?: number` parameter, threaded into its 3 internal
  `bfsMoveWingToPosition()` calls as
  `Math.min(outerDeadline, Date.now() + perCallBudgetMs)` with
  `queuePop` granularity / 50-node checks (Architecture Prototype Sprint
  v1's own winning choice). Omitting the parameter (every other real
  caller, 21+ Prototype/benchmark files) preserves pre-Sprint behavior
  exactly.
- `fiveByFiveEdgeExecutor.ts`'s `runPrimaryPipeline()`/`executeTask()`
  thread `FIXED_BUDGET_MS=140` through as the **new real production
  default** — the real PAIR-task call site
  (`tryFixWing(cubies, w, lib, localDeadline, pairBudgetMs)`) now uses
  this Contract by default; the Integration Benchmark explicitly passes
  `undefined` to reconstruct the pre-Sprint counterfactual.
- Deliberately **not** wired: `bestFixOverall`'s own internal `tryFixWing`
  call or `tryEndgameMultiPly`'s `enumerateWingCandidates` call (both
  ENDGAME-context, a different call pattern this Contract wasn't
  separately validated against).

**Verified safe**: `git stash`/full-project `npx tsc -b --noEmit`
comparison — 192 errors both before and after (zero new).

## 2. Two self-caught methodology corrections

**Correction 1**: An initial end-to-end smoke test measured "Budget
Compliance" as the whole-`solve()`-level Deadline Miss rate (did the
entire 1-second plan budget get exhausted). This came out **identical**
between baseline and candidate (40.89% both) — because other unwired
ENDGAME-phase calls can still exhaust the whole plan budget regardless of
whether the PAIR branch is individually bounded. Comparing that number
against the Prototype's 99.29% figure would have been an apples-to-oranges
error.

**Correction 2**: A follow-up direct per-call probe (calling the real
`tryFixWing()` with a generous 5000ms outer deadline) found a real effect
but wasn't production-realistic either: the real PAIR-task call site's
outer deadline is `TASK_LOCAL_BUDGET_MS=120ms` — **tighter** than this
Sprint's own 140ms per-call cap. Since
`perCallDeadline(d) = Math.min(d, now+140)` and `d` is already ≤120ms out
in production, the 140ms cap numerically reduces to the pre-existing
outer deadline itself. The real, meaningful effect isn't "a tighter
independent sub-budget" — it's that the **existing** outer deadline
finally gets enforced *inside* a single `bfsMoveWingToPosition` call
(which had zero internal time awareness before this Sprint), instead of
only being checked *between* library entries.

Both corrections are implemented in `RealTryFixWingProbe.ts`, which
measures Budget Compliance with `outerDeadlineMs=120` — matching real
production exactly.

## 3. STEP1/2 (corrected) — Real per-call Budget Compliance

Full 335-snapshot population, n=3801 real wrong wings (deterministic —
`tryFixWing` has no `shuffle()`, single pass suffices):

| | avg Runtime | Overrun rate | Compliance |
|---|---|---|---|
| Baseline (no budget) | 163.9ms | 55.12% | 44.88% |
| **Candidate (140ms budget)** | **89.8ms** | **2.10%** | **97.90%** |

This is a dramatic, clean confirmation of the whole research arc's thesis
at the real production call site — closely matching Architecture
Prototype Sprint v1's own isolated-layer finding (37%→1.1% overrun).

## 4. STEP2-3 — End-to-End Runtime + Capability (30 real trials, 75 snapshots each)

| | Baseline | Candidate |
|---|---|---|
| avg whole-cube-improved | 52.83/75 | 52.60/75 |
| avg whole-cube-solved | 0.00/75 | 0.00/75 |
| avg Runtime | 1080.4ms | 1081.4ms |
| avg Deadline Miss rate | 39.47% | 39.38% |
| avg task-active rate | 70.44% | 70.13% |

The whole-solve-level numbers are nearly identical between arms — expected
given Correction 1's finding that this metric is dominated by unwired
ENDGAME-phase behavior, not the PAIR-task improvement this Sprint made.

## 5. STEP4 — Regression Analysis (avg across 30 trials)

| Metric | Rate |
|---|---|
| True Regression | 4.22% |
| Duplicate Success | 62.04% |
| Incremental-Recovery-Only Success | 5.11% |
| Abort Regression (aliased to True Regression) | 4.22% |

Gains (5.11%) slightly outweigh losses (4.22%) but the margin is well
within noise (see STEP5's own CI).

## 6. STEP5 — Standard Evaluation (paired-diff, N=30 real trials)

| Metric | Mean | 95% CI |
|---|---|---|
| Primary (whole-cube-improved diff) | -0.233 | [-0.691, 0.224] |
| Secondary (whole-cube-solved diff) | 0.000 | [0.000, 0.000] |
| Integration Runtime (ms diff) | +1.02 | [-6.47, 8.50] |
| Integration Deadline Miss (pp diff) | -0.09 | [-0.90, 0.72] |

Every CI straddles zero — no statistically distinguishable whole-solve
effect, positive or negative.

## 7. STEP6 — Level 1-3 Judgment

| Level | Criterion | Result |
|---|---|---|
| 1 | Production Integration works | **PASS** |
| 2 | Per-call Budget Compliance ≥95% (production-realistic 120ms) | **PASS** — 97.90% |
| 3 | Net capability gain, no Regression increase | **FAIL** — CI straddles zero |

## 8. Decision: B

The Budget Contract mechanism itself works exactly as designed at the
real production call site — Level1/2 PASS decisively, with a per-call
Budget Compliance improvement (44.88%→97.90%) matching every prior
Sprint's isolated-layer prediction almost exactly. But this real,
substantial per-call improvement does **not** translate into a
measurable whole-`solve()`-level capability gain (Level3 FAIL, every CI
straddling zero) — most likely because saved PAIR-task time gets absorbed
into other unwired phases (ENDGAME's `bestFixOverall`/`tryEndgameMultiPly`)
or Recovery-layer triggering dynamics that the isolated
`bfsMoveWingToPosition`-level Prototype measurement structurally could not
capture.

**Next Sprint recommendation**: Incremental Recovery Production
Integration Refinement Sprint v1 — tune the Contract (or extend wiring to
`bestFixOverall`/`tryEndgameMultiPly`) against real `solve()`-level data,
since the Prototype-level prediction alone was insufficient to guarantee
a whole-solve capability improvement.

## 9. Protected-file scope verification

`git diff` since the prior Sprint's commit shows changes **only** in
`fiveByFiveEdges.ts` and `fiveByFiveEdgeExecutor.ts` (both this Sprint's
sanctioned targets). No diff to Planner/Recovery/Primitive Gate/Primitive
Logic/Solver algorithm, and no existing Primitive or Prototype directory
was touched.
