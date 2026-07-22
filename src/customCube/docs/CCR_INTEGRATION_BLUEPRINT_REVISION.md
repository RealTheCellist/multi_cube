# CCR Integration Blueprint — Revision Notes

Status: written at CCR Production Integration Sprint v1 (2026-07-21), Decision
**C** ("Blueprint와 실제 Production 결과가 크게 다르다"). Originally recorded
as forward-looking notes for the next Sprint; **Section 6 below adds that
Sprint's own actual, quantified findings** (CCR Integration Blueprint
Revision Sprint v1, same date), which confirm and sharpen the diagnosis
below rather than overturning it.

**CCR itself is live in production as of this Sprint** — `fiveByFiveEdgeRecovery.ts`
now includes a `"CCR"` `RecoveryType`, generated last (after REPAIR),
using `runCCRPrototype()` unmodified from CCR Prototype Sprint v1, with a
`remainingTime` budget (no fixed reservation). Two production files
changed: `fiveByFiveEdgeSolverTypes.ts` (added `"CCR"` to the
`RecoveryType` union) and `fiveByFiveEdgeRecovery.ts` (`genCCR()` +
`includeCCR` parameter, defaulting to `true` so the unmodified Executor
automatically includes it). Full driver report:
`solverPrimitiveCCRProductionIntegration/data/ccr-production-integration-v1-report.txt`.

---

## 1. The core finding

Two measurements were taken, and they disagree sharply:

| | Isolated Recovery-level (STEP3-5) | Real end-to-end `solve()` (STEP1-2) |
|---|---|---|
| CCR Gate eligible / called | 51.6% | **0.0%** (0/335) |
| CCR-only new capability | 82 snapshots | **0** |
| Regression | 0 | 0 |
| Avg Runtime | +93.1% (vs isolated baseline) | +3.3% (vs Integration V2's own prior real 1041.0ms → this Sprint's 1075.7ms) |

The isolated comparison gives `attemptRecovery()` a **fresh** `Date.now()+1000ms`
deadline on every call — it correctly demonstrates the CCR *mechanism*
works (same conclusion as CCR Prototype Sprint v1). It does **not**
represent what happens in the real system, where Recovery only ever gets
whatever time is left after the entire primary pipeline already ran.

## 2. Root cause, verified directly (not inferred)

`RecoveryTimingDiagnostic.ts` (permanent, committed — not a throwaway
script) ran the real, unmodified `FiveByFiveEdgeSolverEngine.solve()`
over all 335 snapshots and read its own trace timestamps:

- Recovery triggered on 81/335 calls (24.2%).
- **Of those 81, zero (0.0%) produced any candidate at all** — not just
  CCR: DISRUPT, SETUP, and REPAIR too.
- Recovery triggers, on average, at **814.9ms** of the 1000ms budget —
  leaving an average of **185.1ms**, and evidently that's not enough in
  practice for even one candidate's own generation search to complete.

**This is not a CCR defect.** It is a pre-existing characteristic of the
Recovery layer's own invocation timing on this specific dataset (the
hardest residual failures — states where the *entire* primary pipeline,
PAIR/FLIP/PARITY/ENDGAME's own `bestFixOverall`/`tryEndgameMultiPly`
loop, already spent nearly the whole budget failing before Recovery is
ever reached). It is the same root cause that has always made REPAIR's
own real "채택률" tiny (0.3–1.8% across every prior Integration Sprint)
despite REPAIR's own isolated capability evaluations showing strong,
statistically significant gains — CCR simply inherits the identical
constraint, compounded by being scheduled *after* REPAIR (last in line
for whatever time is left).

## 3. Why this wasn't caught at the Blueprint stage

CCR Integration Blueprint Sprint v1's own STEP5 "Integration Simulation"
estimated a 10.7% CCR call rate by multiplying the real Recovery-trigger
rate (23.6%) by the CCR-Gate-eligible-among-triggered rate (45.6%). That
arithmetic implicitly assumed "if Recovery triggers, CCR gets a
meaningful slice of remainingTime" — it never checked the actual
remaining-time distribution *at the moment Recovery triggers*, which
turns out to be far too thin, essentially always, on this population.
That is the one estimation gap worth fixing in the next Blueprint.

## 4. What the next Sprint (Blueprint Revision) needs to address

This Sprint's own allowed scope (Executor/Planner/Production Solver Core
frozen) cannot fix the root cause — the fix requires changing **when**
budget is reserved for Recovery, which lives in
`fiveByFiveEdgeExecutor.ts`'s own `RECOVERY_RESERVE_MS` mechanism and/or
`fiveByFiveEdgeSolverEngine.ts`'s own per-task budget allocation, both
out of this Sprint's scope. Candidate directions for the revision:

- Reserve Recovery's budget **earlier**, off the whole-plan deadline,
  rather than only right before the final ENDGAME task (today's
  `RECOVERY_RESERVE_MS` reservation already does this in principle, but
  the diagnostic shows it isn't preventing late triggering in practice —
  worth re-measuring whether `RECOVERY_RESERVE_MS` itself needs
  enlarging, or whether the primary pipeline's own per-task budgets
  before ENDGAME need tightening).
- Accept that CCR's real-world contribution, like REPAIR's, may simply be
  rare-but-real (zero regression, occasional rescue) rather than
  expecting it to fire at the 10.7% rate the Blueprint predicted — in
  which case Decision B (refine, not revise) might be the more accurate
  framing once the estimation methodology itself is corrected.
- Re-run this Sprint's own Standard Evaluation (STEP3-5) using a
  budget model that reflects the REAL remaining-time distribution at
  Recovery-trigger time (measured here: avg ~185ms, likely with a heavy
  left tail near zero) instead of a fresh 1000ms per call, to get an
  honest estimate of CCR's real achievable capability contribution.

## 5. What did NOT go wrong

- **Zero regressions**, in both the isolated and real end-to-end
  measurements — the Gate/Deferred Validation invariant held exactly as
  designed.
- **Integration Point and Scheduling** are exactly as specified
  (`repair_after`, `DISRUPT,DISRUPT,SETUP,REPAIR,CCR` — verified directly
  from the code, not inferred).
- **Real Runtime impact is small** (+3.3%, not the alarming +93.1% the
  isolated comparison suggested) — because CCR essentially never runs on
  this population, it also essentially never costs anything extra in the
  real system.
- The CCR Prototype's own mechanism (bounded DFS + Deferred Validation)
  remains fully validated — this Sprint found an *integration-timing*
  problem, not a mechanism problem.

## 6. CCR Integration Blueprint Revision Sprint v1 — actual findings (2026-07-21)

Full driver report: `solverPrimitiveCCRBlueprintRevision/data/ccr-blueprint-revision-v1-report.txt`.
Zero production files touched this Sprint — `generateRecoveryStrategies()`
was called directly (read-only reuse of its own pre-existing `onEvent`
instrumentation hook, added back in Integration Refinement Sprint v1) to
measure real per-candidate budgets, using each snapshot's own **real**
remaining-time-at-trigger (from `RecoveryTimingDiagnostic.ts`, itself
unmodified) as the deadline — never a fresh, idealized budget.

**STEP1 (Recovery Trigger Timing, full re-run)**: Recovery triggered on
49/335 snapshots this run (a different count than the 81/335 measured in
the prior Sprint's own diagnostic pass — expected run-to-run variance,
since production runtimes on this dataset cluster right at the 1000ms
boundary, per Integration Sprint v2's own Deadline Miss findings, so
small wall-clock jitter flips a real fraction of calls across the
threshold each run). Remaining-time distribution among the 49 triggered:
mean 198.0ms, median 178.0ms, P90 426.0ms, P95 436.0ms — consistent in
order of magnitude with the prior Sprint's own 185.1ms average.

**STEP2 (Per-primitive budget, quantified for the first time)**:

| Type | Got a turn | Skipped | Generated | Avg observed budget |
|---|---|---|---|---|
| DISRUPT | 98.0% | 2.0% | **0.0%** | 90.8ms |
| SETUP | 61.2% | 38.8% | **0.0%** | 82.9ms |
| REPAIR | 100.0% | 0.0% | **0.0%** | 30.4ms |
| CCR | 100.0% | 0.0% | **0.0%** | 17.9ms |

This confirms the cascading-starvation dynamic precisely: REPAIR and CCR
always get a nominal "turn" (their reservedBudget/remainingTime patterns
bypass the shared `genDeadline` skip-check), but by the time their turn
arrives — after DISRUPT×2 and SETUP have already run — the REAL budget
left is tiny (30ms for REPAIR, only 18ms for CCR, positioned last). All
four types show **0.0% generated rate** under real conditions — this is
not a CCR-specific shortfall.

**STEP3 (Counterfactual earlier-trigger)**: even a generous +300ms
assumption only lifts CCR's generated rate to **4.1%** (2/49), any-candidate
to 4.1%, REPAIR staying at 0%. A modest timing shift does not meaningfully
fix this — the available windows (tens of ms) are simply too small for
any of these real, non-trivial searches (BFS-based disruption/setup
searches, or CCR's own bounded DFS) to complete, regardless of a
+100-300ms nudge.

**STEP4 (Architecture Dependency, quantified)**: CCR Primitive — **none**
(mechanism already proven at adequate budget; DISRUPT/REPAIR show the
identical 0% pattern, so CCR isn't uniquely broken). Recovery Scheduling
— **low** (DISRUPT, scheduled *first*, still shows 0% generated — order
within Recovery isn't the dominant lever). Executor Timing — **dominant**
(the trigger-timing distribution itself, and the counterfactual's own
weak response to a +300ms shift, point squarely at *when* Recovery is
reached being the binding constraint). Production Budget — **moderate**
(the whole-plan 1000ms budget is already insufficient for the primary
pipeline alone on this hardest-failure population; enlarging Recovery's
own reservation trades directly against it).

**STEP5 (Integration Feasibility)**: Strategy A (keep current structure)
sustains ~0% real CCR contribution indefinitely. Strategy B (enlarge
`RECOVERY_RESERVE_MS`) is directionally correct (matches the dominant
Executor Timing finding) but the counterfactual data itself shows even a
substantial nudge (+300ms) only reaches 4.1% — a budget-reservation tweak
alone is unlikely to be sufficient, and implementing it requires
`fiveByFiveEdgeExecutor.ts` changes regardless (out of every Sprint's
scope so far). Strategy C (redesign when/how Recovery is reached) has the
largest theoretical upside but requires touching both
`fiveByFiveEdgeExecutor.ts` and `fiveByFiveEdgeSolverEngine.ts`
(Production Solver Core) — a genuine architecture-level change.

**Decision: C** — Recovery Architecture Review Sprint v1. The evidence
here (0% generated across ALL candidate types under real conditions, and
only a weak 4.1% response to a generous +300ms counterfactual) argues
against a quick budget-reservation patch (Strategy B) being sufficient on
its own; a proper review of when/how Recovery is invoked relative to the
whole-plan budget is warranted before any further CCR-specific work.
