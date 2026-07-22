# Solver System Bottleneck Attribution Refinement

Status: written at Solver System Bottleneck Attribution Refinement Sprint
v1 (2026-07-22), **Decision A**. READ-ONLY analysis Sprint — zero
Production code changes. Full driver report:
`solverPrimitiveSystemBottleneckAttributionRefinement/data/solver-system-bottleneck-attribution-refinement-v1-report.txt`
(full 335-snapshot population for every STEP).

---

## 1. The question this Sprint answers

Solver System Bottleneck Attribution Sprint v1 narrowed the bottleneck to
two close candidates — ENDGAME (54.7%) and Planner (45.3%) — too close to
decide a Priority 1. This Sprint instruments both mechanisms directly to
disambiguate which one dominates.

## 2. A disclosed correction of the work order's own framing

Direct inspection of the real `planEdgeTasks()` shows ENDGAME is **not** a
task the Planner selectively "skips": whenever `wrongWingCount5(cubies) >
0` at plan time, **every** candidate strategy unconditionally gets
`[...goals, LAST_TWO, ENDGAME]` appended. An ENDGAME task is therefore
always queued whenever the cube isn't already solved. What actually varies
is whether the real top-level task loop's outer 1-second deadline fires
before the queue ever reaches that position — a scheduling/timing effect,
not a Planner decision. This Sprint measures that real mechanism precisely
under the work order's own "PlannerSkipped" label, while documenting what
it actually is.

## 3. STEP1 — Planner Reachability Analysis (full 335-snapshot population)

| Case | Count | % |
|---|---|---|
| **Reachable** | 255 | 76.1% |
| **PlannerSkipped** (deadline-starved before reaching ENDGAME) | 80 | 23.9% |
| AlreadySolvedBeforeEndgame (genuine success) | 0 | 0.0% |
| StructurallyImpossible (already solved at plan time) | 0 | 0.0% |

A clean 2-way split — every real snapshot either reaches ENDGAME or is
starved out by the deadline before getting there.

## 4. STEP2/4 — Endgame Capability Ceiling / Opportunity Saturation Curve

For every Reachable snapshot, the real pre-ENDGAME cube state was replayed
and ENDGAME's own improvement measured at 5 budgets on the identical
starting state:

| Budget (ms) | n | Avg improvement | Solved rate | Avg runtime (ms) |
|---|---|---|---|---|
| 120 | 255 | 0.259 | 0.0% | 177.1 |
| 250 | 255 | 0.545 | 0.0% | 314.6 |
| 500 | 255 | 0.694 | 0.0% | 562.4 |
| 1000 | 255 | 0.890 | 0.0% | 1057.7 |
| **5000 (unlimited proxy)** | 255 | **2.710** | 1.2% | 4956.5 |

**Headroom per Reachable case: 2.451** — a real, monotonically increasing
curve. ENDGAME's own capability is genuinely time-constrained: there is
substantial improvement still on the table beyond what production's
current budget allocation gives it.

## 5. STEP3/5 — Counterfactual Planner Simulation / Planner Benefit Ceiling

For every PlannerSkipped snapshot, the exact real task queue was resumed
from where the real deadline stopped it, with an extended deadline
guaranteeing it reaches and executes ENDGAME:

| | Value |
|---|---|
| n | 80 |
| Avg improvement | 1.163 |
| **Total improvement (Maximum Recoverable Capability)** | **93.00** |
| Solved rate | 0.0% |

## 6. STEP6 — Final Attribution Decision

Both headroom figures converted to population-level total potential gain
(same units — summed wrongWingCount improvement across the whole
population):

| Candidate | Total potential gain | Contribution |
|---|---|---|
| **ENDGAME** (2.451 headroom × 255 Reachable cases) | **625.00** | **87.0%** |
| Planner (STEP5's own total) | 93.00 | 13.0% |

**Priority 1: ENDGAME** — clears both decisiveness thresholds by a wide
margin (6.7× ratio vs the 1.5× requirement; 74pp difference vs the 15pp
requirement).

## 7. Level 1-3 Judgment

| Level | Criterion | Result |
|---|---|---|
| 1 | Planner Reachability quantified | **PASS** |
| 2 | ENDGAME Capability Ceiling computed | **PASS** |
| 3 | Priority 1 confirmed decisively | **PASS** — ENDGAME 87.0% vs Planner 13.0% |

## 8. Decision: A

ENDGAME is decisively confirmed as the dominant bottleneck. Its own
capability is genuinely time-limited — giving it more budget produces a
real, substantial, monotonically increasing improvement (0.259 → 2.710
across the tested range) — while fixing Planner's queue-ordering/deadline
issue alone recovers a comparatively small amount (93.00 total vs
ENDGAME's 625.00).

**Next Sprint recommendation**: **ENDGAME Optimization Blueprint Sprint
v1** — design how to give ENDGAME meaningfully more of the overall 1-second
plan budget (or otherwise improve its own efficiency), now that this
Sprint's own real measurement confirms the headroom is genuinely there to
capture.

## 9. Protected-file scope verification

`git diff` since this Sprint's start shows **zero** changes to any
Production file (`fiveByFiveEdges.ts`, Planner, Executor, Recovery, any
Primitive, any Prototype, the Budget Contract) — confirmed via direct diff
against every protected path. Only new files under
`solverPrimitiveSystemBottleneckAttributionRefinement/` and the new driver
script (which itself reuses the prior Sprint's own `StageInstrumentedMirror.ts`
read-only).
