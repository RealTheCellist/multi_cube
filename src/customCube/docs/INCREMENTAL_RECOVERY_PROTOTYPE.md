# Incremental Recovery — Prototype Results

Status: written at Incremental Recovery Prototype Sprint v1 (2026-07-22),
**Decision B**. Implements Incremental Recovery Blueprint Sprint v1's
Blueprint as an actual, working Prototype — new directory
`solverPrimitiveIncrementalRecoveryPrototype/` only, zero Production Solver
/ Planner / Executor / Recovery / existing Primitive / existing Prototype
files touched. Full driver report:
`solverPrimitiveIncrementalRecoveryPrototype/data/incremental-recovery-prototype-v1-report.txt`.

---

## 0. What was built

- `IncrementalRecoveryPrototype.ts` (STEP1) — the Blueprint's `featureBased`
  Trigger, implemented exactly as specified: fires only when
  `analyzeCcrGate()` (existing, unmodified) reports CCR-Gate or REPAIR-Gate
  eligibility on a PAIR task's no-progress state. REPAIR is attempted
  first, then CCR, mirroring the Blueprint's Scheduling contract.
- `IncrementalBudget.ts` (STEP2) — the Blueprint's adopted `reservedSlice`
  policy only (`min(remainingTime, 40ms)`) — no other policy re-implemented.
- `IncrementalScheduler.ts` (STEP3) — a disclosed reimplementation of
  `FiveByFiveEdgeSolverEngine.solve()`'s own top-level task loop (same real
  `planEdgeTasks()`/`executeTask()` calls, same `allowRecovery=true`), with
  exactly one addition: a PAIR task's no-progress moment gets one
  Incremental Recovery attempt before the loop continues.
- `PrototypeBenchmark.ts` (STEP4/5) — Baseline (`FiveByFiveEdgeSolverEngine.solve()`,
  real and unmodified) vs Candidate (`IncrementalScheduler`) comparison;
  REPAIR/CCR interaction analysis.
- `PrototypeEvaluation.ts` (STEP6/7) — Safety Verification (Infinite Retry,
  Duplicate Invocation, Scheduler Loop, Budget Overrun, Regression) and the
  Standard Evaluation Protocol (paired-diff 95% CI, reusing `computeStats`
  from Evaluation Stabilization Sprint v1, unmodified).

## 1. STEP1 — Trigger reproduction (a methodology correction made mid-Sprint)

A first full run measured the Candidate's own raw Coverage at 76.1%
(625/821), noticeably below the Blueprint's reported 84.0%. Investigating
this directly (re-running the Blueprint's own unmodified
`analyzePairFailures()` on the same 335 snapshots, in the same process)
showed the *real* cause: **the Candidate arm actively applies successful
Incremental Recovery moves**, which changes the cube for every later task
in that same solve — an early success can prevent a later PAIR task from
ever reaching a no-progress state. On this run, the no-intervention
counterfactual population was 1393 records; the Candidate's own
already-partly-repaired population was only 821 (58.9% of it) — a real,
confirmed causal effect, not noise or a bug.

Once measured on the correct like-for-like basis (the same-run,
no-intervention counterfactual), Coverage came out to **85.4%** (1189/1393
Gate-eligible) — within 1.4 points of the Blueprint's own 84.0%.
**Level 1: PASS.**

## 2. STEP2/3 — Budget is a real, confirmed characteristic, not a bug

Average actual usage per REPAIR/CCR attempt was **140.0ms** against the
`reservedSlice` policy's nominal 40ms cap (3.5×) — 89.1% of attempts
overran the cap. This exactly reproduces the Blueprint's own STEP3 finding
(avg budget 31.3ms, avg time 140.7ms) and is explained the same way:
`runCCRPrototype`/`runSuccessV2` only check their deadline *between* DFS
hops, not inside a hop's own candidate-generation work, so a single slow
hop can blow well past a 40ms instruction. This is a genuine property of
the existing search primitives, confirmed independently in this Sprint,
not something this Sprint's new code introduced.

## 3. STEP4 — Capability Benchmark: a floor effect, not evidence of failure

Both Baseline and Candidate solved **0 of 75** subsample snapshots across
all 30 runs. This population (`failureAnalysis` snapshots) is curated
specifically from cases the production solver already struggled with;
within the strict real 1000ms budget, full completion is essentially never
reached by either arm on this particular subsample. The paired-diff
comparison on *whole-cube-solved count* is therefore floor-effect-degenerate
here — it cannot detect a real difference because neither arm ever
registers a "win" in that specific sense on this population. Precision
(2.2%) and Recall (1.7%) at the individual-PAIR-task level are non-zero,
confirming Incremental Recovery does occasionally fix an individual task —
just not enough, within this budget, to flip a whole-cube outcome on these
particular hardest cases. **Level 2: FAIL** (paired-diff 95% CI is exactly
[0.00, 0.00], not excluding zero).

## 4. STEP6 — Safety: zero Regression, but Deadline Miss rose sharply

- Infinite Retry violations: 0/30 runs.
- Duplicate Invocation (same cube state attempted via two different task
  slots): 2315 occurrences — non-zero, confirming the Blueprint's own §5.4
  concern (Infinite Retry risk from cross-task-slot duplicate attempts) is
  real and needs the global-visited-tracking mitigation it already named,
  not just the at-most-once-per-task cap this Prototype implements.
- Regression: 0 (across all 30 runs, 0 opportunities since Baseline never
  solved any of the 75 either — see §3).
- Budget Overrun: 3670/4057 attempts (90.5%) — directly caused by §2's
  finding.
- Deadline Miss rate rose from Baseline's 74.7% to Candidate's 100.0% (avg
  +24.0 percentage points across all 30 runs) — a direct consequence of the
  Budget Overrun finding: attempts routinely running ~3.5× their nominal
  slice push borderline solves past the 1000ms deadline. **Level 3: FAIL.**

## 5. Decision: B

Mechanism valid (Trigger reproduces, zero Regression, zero Scheduler-Loop
or Infinite-Retry violations, REPAIR/CCR dispatch cleanly exclusive as
predicted) — **but** Coverage/Capability is insufficient to clear Level 2
(floor effect on this hardest-case population) and Level 3 (Deadline Miss
rate increase, root-caused to the reservedSlice budget's cap not actually
being enforced by the underlying primitives' own coarse deadline-check
granularity).

## 6. What Prototype Refinement Sprint v1 should address

1. **Budget enforcement**: the `reservedSlice` cap is a target, not a
   guarantee — `runCCRPrototype`/`runSuccessV2`'s coarse deadline-check
   granularity (only between DFS hops) means the actual median attempt
   runs ~3.5× over. A tighter per-hop deadline check (inside the search
   itself) or a stricter external early-exit would be needed to make the
   Budget Contract's numbers real, without touching the primitives'
   production code this Sprint's scope forbids.
2. **Metric choice for Capability**: whole-cube-solved is floor-effected on
   this hardest-case population within 1000ms. A task-level or
   partial-progress metric (e.g. wrongWingCount reduction) would likely
   show real signal where the binary metric cannot — worth adopting
   alongside (not instead of) the binary metric for the next Sprint.
3. **Duplicate Invocation**: 2315 real occurrences confirm the Blueprint's
   own flagged risk — a cross-task global visited-set (not just the
   current per-task cap) should be added to the Safety Contract's actual
   implementation.
