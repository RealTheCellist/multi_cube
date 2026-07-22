# Incremental Recovery — Prototype Refinement Results

Status: written at Incremental Recovery Prototype Refinement Sprint v1
(2026-07-22), **Decision C**. Zero Production Solver / Planner / Executor
/ Recovery / existing Primitive / existing Prototype files touched — new
directory `solverPrimitiveIncrementalRecoveryPrototypeRefinement/` only.
Full driver report:
`solverPrimitiveIncrementalRecoveryPrototypeRefinement/data/incremental-recovery-refinement-v1-report.txt`.

---

## 0. What was built

- `InstrumentedSearch.ts` — a disclosed, independent reimplementation of
  `runCCRPrototype()`/`runSuccessV2()`'s own bounded-DFS structure (same
  real `enumerateWingCandidates`/`applySeq`/`wrongWingCount5`/`pairCountOf`/
  `validateDeferred` calls), instrumented to capture per-hop timing and
  the pre-Deferred-Validation "best leaf" the black-box originals discard.
- `BudgetRefinement.ts` (STEP1) — 4 Budget policies (`reservedSlice`
  baseline, `strictDeadline`, `softDeadline`, `budgetAwareTraversal`), all
  Prototype-Wrapper-level choices of deadline/node-list, never a change to
  the search's own internals.
- `DeadlineGranularityAnalysis.ts` (STEP2) — measures where the real time
  goes (single-hop cost vs. cumulative traversal cost) to classify Budget
  Overrun as a design problem, a granularity problem, or both.
- `TaskLevelEvaluation.ts` (STEP3) — Baseline/Candidate solve mirrors with
  task-level metrics (PAIR progress, wrongWing reduction, deferred
  improvement, net-improvement) and a point-biserial correlation against
  whole-cube improvement.
- `VisitedRegistry.ts` (STEP4) — a solve-scoped global visited-state set
  that skips re-invoking the search on a cube state already attempted
  earlier in the same solve, addressing the Blueprint's own flagged
  Duplicate Invocation risk.
- `CapabilityBenchmark.ts` (STEP5) — 3-arm comparison (Baseline /
  Prototype v1's exact configuration / this Sprint's Refinement
  configuration), all measured through the same instrumented core for a
  consistent, controlled comparison.
- `RefinementReport.ts` (STEP6) — paired-diff 95% CI + Cohen's d_z, reusing
  `computeStats`/`analyzeEffectSize` from Evaluation Stabilization Sprint
  v1/v2 (unmodified).

## 1. A methodology correction made mid-Sprint

A first smoke test (15 snapshots) showed Level 1 and Level 2 both PASS.
Investigating further revealed the "Refinement" arm silently wasn't
applying the chosen Budget policy's own mechanism — `runCandidateMirror`
only passed a flat millisecond value through, never `budgetAwareTraversal`'s
node-list truncation, so the Refinement arm was really just "reservedSlice
with a smaller number." This was fixed by adding `dispatchWithPolicy()`
(`BudgetRefinement.ts`), which routes every call through `allocateBudget()`
so the actual policy mechanism (including truncation) is genuinely
exercised in STEP3–5, not just its numeric budget value. Re-running the
smoke test after the fix showed materially different — and more
plausible — Refinement-arm behavior (non-zero Precision/Recall) before
the full run was launched.

## 2. Real results (335-snapshot population; 200-record probe stride-sample
for STEP1/2's cost; 75-snapshot standard subsample × N=30 for STEP3–6, per
this project's established cost-driven precedent)

**STEP1/2 — Budget & Granularity**: `reservedSlice`'s nominal 40ms cap
overruns to an average of 128.8ms actual usage (4.02×), confirmed as
*both* a granularity problem (a single `enumerateWingCandidates()` call
alone reached 1003ms) and a design problem (avg 11.2 hops × 114.9ms/hop
sums well past budget). The best-performing alternative,
`budgetAwareTraversal` (truncates the node list to what the measured
avg-hop-cost can actually afford within budget), only reduced overrun from
80.0% to 54.5% — a **31.9% reduction**, well short of the 50% bar. The
15-snapshot smoke test had shown 54.3% reduction; the full-scale,
200-record measurement is the trustworthy number.

**STEP4 — Visited Registry**: eliminated Duplicate Invocation entirely
(129 → 0, 100%), but caused **6 real regressions** — cases where skipping
a "duplicate" search attempt cost a success that a repeated attempt would
have found. This happens because the underlying DFS isn't perfectly
deterministic run-to-run (real wall-clock deadline checks introduce
timing variance even on an identical input state) — an attempt on an
"already-seen" state still has *some* independent chance of succeeding,
and a blanket skip forecloses that chance. Zero-regression was Level 2's
own requirement.

**STEP3/5/6 — Task-Level Capability**: this is the Sprint's clearest
positive finding. Comparing the whole-cube-improved count (Candidate's
final wrongWingCount lower than Baseline's) across N=30 runs, Refinement
beat Prototype v1's raw configuration with a **large, statistically
robust effect** — paired-diff mean +3.23, 95% CI [2.51, 3.95] (excludes
zero), Cohen's d_z = 1.607. This directly validates Level 3: task-level
Capability *is* a reproducible metric that escapes Prototype Sprint v1's
whole-cube-solved floor effect, and by this metric Refinement's
configuration is genuinely better than Prototype v1's.

## 3. Success criteria

| Level | Result | Basis |
|---|---|---|
| 1 (Budget Overrun significantly reduced) | **FAIL** | 80.0% → 54.5% (31.9% reduction, <50% bar) |
| 2 (Duplicate Invocation reduced, Regression 0) | **FAIL** | 100% reduction, but 6 regressions (bar requires 0) |
| 3 (Task-level Capability is a reproducible metric) | **PASS** | paired-diff CI excludes zero, large effect size |

## 4. Decision: C

Two of three Levels fail on real, full-scale data — Budget Overrun cannot
be brought down far enough with a Prototype-Wrapper-level fix alone (the
underlying search's coarse per-hop deadline granularity is the root
cause, and fixing it properly would require changing
`enumerateWingCandidates()`'s own internal deadline-check frequency,
which lives in the protected `fiveByFiveEdges.ts`, out of scope for any
Prototype-level Sprint), and the Visited Registry's binary skip rule
trades away real capability (6 regressions) for its Duplicate reduction.
Per the work order's own Decision framework, this is a structural
limitation, not a tunable parameter — **Architecture Blueprint Revision**
is the appropriate next step rather than another round of Prototype-level
parameter refinement.

## 5. What the next Sprint should address

1. **Budget Overrun is architecturally, not just parametrically,
   unresolved at the Prototype layer.** A real fix needs either (a) a
   coarser-grained but production-safe change to how deeply
   `enumerateWingCandidates()` itself checks its deadline (production
   code, out of this whole Sprint-tier's scope), or (b) accepting overrun
   as an inherent cost and re-deriving the Budget Contract's numbers
   around the REAL ~130-200ms typical cost rather than a 40ms aspiration.
2. **Visited Registry needs a softer rule.** A strict "attempt once ever"
   ban costs real capability given the search's own run-to-run variance;
   a bounded retry cap (e.g., at most 2 attempts per state) is worth
   testing instead of the current binary registry.
3. **Task-level Capability is validated and should become the standard
   metric** for any future Incremental Recovery evaluation on this
   dataset — whole-cube-solved should be retained as a secondary check
   but not the primary Capability signal, given its demonstrated floor
   effect on this specific hardest-failure population.
