# Recovery Necessity Validation Sprint v1

Status: **Complete. Verdict: closest to Conclusion C**, with an important
practical caveat (Section 6). This Sprint asked whether Recovery Capability
is genuinely needed for the current Failure Population, before any
Recovery Logic redesign is considered -- per explicit user direction, no
Recovery Logic, Planner, Primitive, or Solver search algorithm was
modified. Full report:
`recoveryNecessity/data/recovery-necessity-validation-v1-report.txt`.

---

## 1. Method

Ground truth was established uniformly across the full 142-case Hole
Dataset (not merging the partial, inconsistently-gated extended-budget
data collected across prior Sprints): for every case where the main
pipeline (BASE/FLIP/CASE/PARITY) fails at the capability tester's baseline
budget (400ms), a fresh extended-budget (5000ms, 12.5x) retest was run
against **all 5 primitives including RECOVERY** via the existing,
unmodified `capabilityAnalysis/primitiveCapabilityTester.ts`. This closed a
real coverage gap: Conflict Dominant's 34 cases had never been
extended-budget-tested in any prior Sprint (State Taxonomy v2's STEP2 was
cause-vs-effect analysis, not a capability retest).

The Recovery Necessity Funnel (Need -> Triggered -> Candidate Generated ->
Solved) was measured with one fresh, real
`FiveByFiveEdgeSolverEngine.solve()` call per case, reading its trace
directly for `recovery-triggered`/`recovery-no-candidates` -- the same
technique used to investigate Production Integration Validation Sprint's
own surprising finding.

## 2. Ground Truth (RQ-1, RQ-2)

| | Count | Share |
|---|---|---|
| Total cases | 142 | -- |
| **Reachable WITHOUT Recovery** (main pipeline, baseline+extended budget) | **92** | **64.8%** |
| **Requires Recovery** (Recovery is the ONLY path found) | **3** | **2.1%** |
| Recovery Optional (Recovery succeeds, but so does something else) | 5 | 3.5% |
| Recovery Unnecessary (neither credited) | 134 | 94.4% |

**This is the single most important number in this Sprint, and it revises
an earlier finding from this research arc.** Coverage Hole Discovery
Sprint v1 measured "True Coverage Hole" at 80.3% using only the
capability tester's 400ms baseline. Once extended search budget (5000ms)
is allowed for the main pipeline primitives alone -- with **no Recovery
involvement at all** -- 64.8% of the entire population becomes reachable.
Most of what looked like a missing-capability gap is, at this budget,
better described as a **search-budget problem in the main pipeline**, not
evidence that new Primitive capability is required. This does not
contradict State Taxonomy Sprint v2 (which already found BUDGET_RECOVERABLE
subtypes in Cycle Isolation and Parity-Gated Cycle) -- it completes that
finding by adding the previously-untested Conflict Dominant population and
stating the number as a single population-wide figure for the first time.

## 3. Recovery Necessity Funnel

| Stage | Count (of the 3 truly-necessary cases) |
|---|---|
| Need Recovery | 3 |
| Triggered | **3/3 (100%)** |
| Candidate Generated | **0/3 (0%)** |
| Solved (single fresh call) | 0/3 |

**The trigger condition correctly fires on every single genuinely-necessary
case** (Recall, Section 4). But even when correctly triggered, candidate
generation fails 100% of the time on exactly these cases -- consistent
with, and now precisely localized against, Production Integration
Validation Sprint's population-wide 43/43 candidate-generation failure
rate. The failure is not in *whether* Recovery gets a chance to run; it is
entirely in what its generators (`genDisrupt1/2`, `genSetup`, `genRepair`,
`genCCR`) do once given that chance.

## 4. Precision / Recall / F1 (RQ-4)

| | Value |
|---|---|
| TP / FP / FN / TN | 3 / 89 / 0 / 50 |
| **Precision** (of triggers, how many were truly necessary) | **3.26%** |
| **Recall** (of necessary cases, how many were triggered) | **100.00%** |
| F1 | 6.32% |
| Recovery Opportunity Loss (needed but not even triggered) | **0 cases** |

Two distinct, simultaneously-true findings: the trigger condition never
*misses* a genuinely necessary case (perfect recall, zero opportunity
loss) -- but it is extremely promiscuous, firing on 92/142 cases overall
when only 3 are ever truly necessary (3.26% precision). Both facts matter
for different reasons: the first says the trigger's *sensitivity* is not
the problem; the second says its *specificity* is poor, though this has no
practical cost today since candidate generation fails regardless of why it
was triggered.

## 5. Population Classification + Structural Profile (RQ-3)

| Class | n | avg cycle length | avg wrongWing | avg conflict edges | avg components | parity rate |
|---|---|---|---|---|---|---|
| **RECOVERY_REQUIRED** | 3 | **6.00** | 7.33 | 0.00 | 1.33 | 33.3% |
| RECOVERY_OPTIONAL | 5 | 5.40 | 11.00 | 0.00 | 1.80 | 80.0% |
| RECOVERY_UNNECESSARY | 134 | 3.49 | 7.85 | 2.43 | 1.40 | 43.3% |

The Required class has a distinct shape: the **longest** cycles of any
class (avg 6.00 vs 3.49 population-wide), **zero** conflict edges, and
mostly single-component (1.33) -- structurally almost identical to State
Taxonomy Sprint v2's "Cycle Isolation / Pure Structural Isolation" subtype
(24 cases, also long-cycle/no-conflict/single-component), which was
already the target of Primitive Opportunity Map's "Primitive-Candidate-A:
Deep Cycle Resolver." The 3 labels
(`worstCase:b714481`, `worstCase:1e928fb1`, `scrambleDepth10:8`) are listed
directly in the report for inspection.

## 6. Verdict

**Closest to Conclusion C** ("Recovery Layer는 특정 Failure Class에서만
필요하다") -- necessity is not zero (ruling out Conclusion A outright) and
is concentrated in a specific, structurally distinct shape (long,
single-component, conflict-free cycles), not spread evenly across the
population.

**Important practical caveat**: the necessary population is very small (3
of 142, 2.1%) and its structural profile overlaps almost completely with
Primitive-Candidate-A (Deep Cycle Resolver) from State Taxonomy Sprint v2's
own Primitive Opportunity Map -- a Primitive research track already queued,
targeting the same shape via a different mechanism (new search strategy,
not Recovery's disruption/setup approach). **Recommendation: do not open a
separate dedicated Recovery Blueprint Sprint.** Fold this Sprint's 3
RECOVERY_REQUIRED cases into Primitive-Candidate-A's benchmark population
when that research proceeds, and treat Recovery's Generator-level failure
(Section 3) as a disclosed, deprioritized fact rather than a fix target --
the population it would help is both tiny and already addressed by a
differently-shaped Primitive under active consideration.

## 7. File Scope Verification

`git diff --stat` against all protected files listed in this Sprint's own
Directive (`fiveByFiveEdges.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdgeRecovery.ts`,
`primitivePrototype/CycleChasePrototype.ts`, plus this whole research
arc's standard protected-file list) confirms **0 diff**. This Sprint added
only `recoveryNecessity/` (new measurement modules) and this document. No
new Primitive was added; no Recovery Logic was modified; all conclusions
are grounded in freshly and directly measured data, disclosed with exact
counts rather than estimated.
