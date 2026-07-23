# ENDGAME Optimization Blueprint

Status: written at ENDGAME Optimization Blueprint Sprint v1 (2026-07-22),
**Decision A**. Architecture Blueprint (design only) — zero Production code
changes. No new benchmark run was needed — every number below is cited
verbatim from Solver System Bottleneck Attribution Refinement Sprint v1's
own real report (n=255 real Reachable snapshots, full 335-snapshot
population), plus one new real architecture fact confirmed by direct
source inspection this Sprint. Full driver report:
`solverPrimitiveEndgameOptimizationBlueprint/data/endgame-optimization-blueprint-v1-report.txt`.

---

## 1. Background

The prior Sprint decisively confirmed ENDGAME as Priority 1 (87.0% of
total potential gain vs Planner's 13.0%), with a real, monotonically
increasing Saturation Curve (0.259 → 2.710 avg improvement as budget grows
120ms → 5000ms). This Sprint designs the lowest-risk operating structure to
actually capture that headroom in Production.

**New real architecture fact** (confirmed by direct source inspection of
`fiveByFiveEdgeExecutor.ts`): `RECOVERY_RESERVE_MS = 450ms`
(`RECOVERY_GEN_BUDGET_MS(300) + MAX_RECOVERY_RETRIES(1) *
RECOVERY_RETRY_BUDGET_MS(150)`) is **already** reserved off ENDGAME's own
`primaryDeadline` today, before Recovery even triggers. ENDGAME's real
production budget is squeezed by both its late queue position (always
last) and this existing reservation.

## 2. STEP1 — Budget Allocation Blueprint

| Strategy | Expected improvement | Risk |
|---|---|---|
| A. Fixed Budget (500ms) | 0.694 | Wastes budget on easy cases; could starve earlier tasks if oversized |
| B. Remaining-Time (**today's status quo**) | 0.259 | Confirmed the WORST-performing real operating point |
| C. Adaptive Budget | 0.545 | Best theoretical tradeoff, highest complexity/regression risk |
| **D. Reserved Slice** | **0.694** | Reuses the EXISTING `RECOVERY_RESERVE_MS` pattern — lowest new-concept risk of any candidate that beats the status quo |

**Selected: D. Reserved Slice.** Today's actual behavior (B) is the
measurably worst point on the real Saturation Curve — real snapshots
cluster at the low end precisely because of it.

## 3. STEP2 — Capability Gain Model (Marginal Gain per 100ms)

| Segment | ΔImprovement | Gain/100ms |
|---|---|---|
| 120→250ms | 0.286 | 0.220 |
| 250→500ms | 0.149 | 0.060 |
| 500→1000ms | 0.196 | 0.039 |
| 1000→5000ms | 1.820 | 0.045 |

Diminishing returns are **not** monotonic across the whole range (the
1000→5000ms segment re-accelerates) — but within the realistic
Production-sized range (≤1000ms), the biggest marginal win per ms is at
the low end (120→250ms), reinforcing that even a modest reserved floor
captures most of the readily-available gain.

## 4. STEP3 — Runtime Impact Model

| Strategy | Runtime | Deadline Miss Risk | Overall Risk |
|---|---|---|---|
| Fixed (500ms) | 562.4ms | medium | medium |
| Remaining-Time (status quo) | 177.1ms | low | low |
| Adaptive | 314.6ms | medium | **high** (timing-jitter class of bug this whole arc has fixed before) |
| **Reserved Slice (500ms)** | 562.4ms | medium | medium |

## 5. STEP4 — ENDGAME Efficiency Opportunity (non-Budget candidates, design only)

| Candidate | Risk | Verdict |
|---|---|---|
| Candidate Ordering (replace `shuffle()`) | medium | Real gap — genuinely random order today; unmeasured magnitude |
| Early Exit | low | **Already implemented** — no gap found |
| Branch Pruning | high | Already pruned where checked; a new heuristic doesn't exist yet |
| Duplicate Skip | low | **Premise doesn't match real code** — no duplication found within one ENDGAME invocation |
| Search Reordering (try multi-ply earlier) | medium | Real gap — multi-ply is always a fallback, never tried first |

None implemented this Sprint (design only); Candidate Ordering and Search
Reordering are the two real, disclosed gaps worth a future Prototype's
attention alongside the Budget fix.

## 6. STEP5 — Integration Architecture

| Integration Point | Risk | Verdict |
|---|---|---|
| **Executor / solve() task-loop boundary** | **low** | Smallest change, directly mirrors the existing `RECOVERY_RESERVE_MS` pattern |
| Recovery (shrink `RECOVERY_RESERVE_MS`) | medium | Risks reopening Generation Starvation (a real regression 3 prior Sprints already fixed) |
| Task Layer (reorder queue) | high | Changes a fundamental contract this whole arc has treated as fixed; no data on the PAIR/FLIP tradeoff |
| Primitive Layer (`fiveByFiveEdges.ts` internals) | high | Widest blast radius (22+ callers); contradicts the established minimal-footprint discipline |

**Selected: Executor / solve() task-loop boundary.**

## 7. STEP6 — Final Operating Contract

| Element | Value |
|---|---|
| Budget Policy | D. Reserved Slice @ **500ms** |
| Integration Point | Executor / solve() task-loop boundary |
| Mechanism | Reserve `ENDGAME_RESERVE_MS` off the outer solve() loop so ENDGAME's own primary attempt gets a guaranteed floor — exact mechanics (which function computes it) deliberately left to the Prototype Sprint |
| Runtime Contract | Max 562.4ms, Budget Compliance ≥95%, zero True Regression increase |
| Success Metrics | Primary: whole-cube-improved paired-diff (N≥30) · Secondary: whole-cube-solved · Regression: candidate-strictly-worse count · Runtime: wall-time delta AND Deadline Miss delta together |

## 8. Level 1-3 Judgment

| Level | Criterion | Result |
|---|---|---|
| 1 | Budget Blueprint confirmed | **PASS** |
| 2 | Integration Blueprint confirmed | **PASS** |
| 3 | Prototype-ready specification complete | **PASS** |

## 9. Decision: A

Blueprint complete. **Next Sprint: ENDGAME Optimization Prototype Sprint
v1** — implement `ENDGAME_RESERVE_MS = 500ms` at the Executor/solve()
task-loop boundary, resolving the explicit stack-vs-absorb question
against `RECOVERY_RESERVE_MS` (this Blueprint recommends investigating
absorption given the 87%/13% Bottleneck Attribution finding, but leaves
the final call to the Prototype Sprint's own real A/B measurement), and
validating against the Runtime Contract and Success Metrics specified
above.

## 10. Protected-file scope verification

`git diff` since this Sprint's start shows **zero** changes to any
Production file — confirmed via direct diff against every protected path.
Only new files under `solverPrimitiveEndgameOptimizationBlueprint/` and
the new driver script, none of which touch Production code.
