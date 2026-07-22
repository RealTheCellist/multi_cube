# Incremental Recovery — Architecture Prototype Refinement

Status: written at Incremental Recovery Architecture Prototype Refinement
Sprint v1 (2026-07-22), **Decision A**. Zero Production code changes this
Sprint — reuses Architecture Prototype Sprint v1's own Traversal
Interruptibility mechanism (`bfsMoveWingToPosition`'s `deadline`/
`granularity`/`checkEveryNodes` parameters) exactly as committed, sweeping
only the budget **value** with `queuePop` granularity (that Sprint's own
winning choice). Full driver report:
`solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/data/incremental-recovery-architecture-prototype-refinement-v1-report.txt`
(335 real snapshots, 3801 real test cases, full population).

---

## 1. The question this Sprint answers

Architecture Prototype Sprint v1 showed the interruptibility mechanism
itself works (Level1/2 PASS) but the fixed 40ms budget cost real
capability (Level3 FAIL: -18.4pp success rate, 699 True Regressions). That
Sprint's own conclusion: this is a parameter problem, not a mechanism
problem, because the mechanism now makes ANY budget safe to enforce. This
Sprint sweeps 8 budgets — 40/60/80/100/120/140/160/200ms — to find where
capability recovers while Budget Compliance stays high.

## 2. STEP1 — Budget Sweep (full 3801-case population, every budget)

| Budget | avg Runtime | Overrun rate | Deadline Abort rate | Traversal Completion |
|---|---|---|---|---|
| ceiling (no deadline) | 75.84ms | — | — | — |
| 40ms | 19.89ms | 1.03% | 37.28% | 62.72% |
| 60ms | 28.06ms | 2.10% | 33.20% | 66.80% |
| 80ms | 33.98ms | 1.45% | 29.91% | 70.09% |
| 100ms | 39.05ms | 1.21% | 25.65% | 74.35% |
| 120ms | 43.54ms | 0.79% | 23.05% | 76.95% |
| **140ms** | **47.68ms** | **0.71%** | 21.07% | 78.93% |
| 160ms | 54.19ms | 1.45% | 20.63% | 79.37% |
| 200ms | 60.42ms | 1.16% | 19.68% | 80.32% |

**Key disclosed finding**: Overrun rate stays in a tight 0.7–2.1% band
across the ENTIRE sweep — the interruptibility mechanism enforces
whatever target it's given, so Budget Compliance does not meaningfully
discriminate between candidate budgets. The real cost of a larger budget
is average Runtime (which scales roughly linearly with the target), not
compliance risk.

## 3. STEP2 — Capability Recovery (vs 40ms baseline, vs unconstrained ceiling)

| Budget | Success rate | Recovery vs 40ms | % of ceiling gap closed |
|---|---|---|---|
| 40ms | 62.83% | 0.00pp | 0.0% |
| 80ms | 70.14% | +7.31pp | 41.2% |
| 100ms | 74.51% | +11.68pp | 65.9% |
| 120ms | 77.11% | +14.29pp | 80.6% |
| **140ms** | **79.03%** | **+16.21pp** | **91.4%** |
| 160ms | 79.37% | +16.55pp | 93.3% |
| 200ms | 80.32% | +17.50pp | 98.7% |

Recovery shows clear diminishing returns past 140ms — going from 140ms to
200ms (+60ms runtime cost) only recovers another 7.3% of the remaining gap.

## 4. STEP3 — Regression Curve

True Regression (real capability lost to the abort) falls monotonically
and steeply: 674 (17.73%) at 40ms → 58 (1.53%) at 140ms → 9 (0.24%) at
200ms. False Regression (739, cases that fail regardless of budget) is
constant across all budgets, as expected (these cases exceed the
`maxDepth=6` search space entirely, independent of time). Duplicate impact
remains not-applicable at this layer (Visited Registry untouched).

## 5. STEP4 — Pareto Frontier

X = Capability Loss vs ceiling, Y = Budget Compliance. **Pareto-optimal
budgets: 140ms and 200ms** (every budget below 140ms is dominated by
140ms on both axes; 160ms is dominated by 200ms). Compliance range across
the whole sweep: [97.90%, 99.29%] — confirmed budget-invariant per the
Sprint's own disclosed threshold (<5pp range).

## 6. STEP5 — Statistical Validation (n=3801, paired-diff vs 40ms)

Every budget from 60ms up shows a statistically significant improvement
over 40ms (95% CI lower bound > 0). At 140ms: mean diff = 0.162, 95% CI =
[0.150, 0.174], Cohen's d_z = 0.440 (small-to-medium, individually small
but reflects a huge population-level effect given n=3801).

## 7. STEP6 — Level 1-3 Judgment & Decision

| Level | Criterion | Result |
|---|---|---|
| 1 | Budget Sweep completed | **PASS** |
| 2 | Meaningful recovery (≥5pp) + Compliance maintained (≥90%) | **PASS** — 6/8 budgets qualify |
| 3 | Pareto-optimal budget confirmed | **PASS** — 140ms, 200ms |

**Decision: A** — Recommended Operating Contract: **Fixed Budget @
140ms**. It is the smallest Pareto-optimal, statistically-significant
budget: recovers 91.4% of the unconstrained ceiling's capability (79.03%
success rate vs 62.83% at 40ms and 80.56% ceiling), average runtime
47.68ms, Budget Compliance 99.29%, True Regression down to 1.53% (from
17.73% at 40ms). Since Budget Compliance is effectively budget-invariant
across the whole sweep, a Fixed Budget is sufficient — no Adaptive or
Remaining-Time policy complexity is needed to reach this operating point.

**Next Sprint**: Incremental Recovery Production Integration Sprint v1 —
wire the 140ms Fixed Budget Contract through `enumerateWingCandidates`/
`tryFixWing`'s real call sites (deferred from Architecture Prototype
Sprint v1's own minimal-footprint scope decision).

## 8. Protected-file scope verification

`git status --short` at commit time showed only new files under
`solverPrimitiveIncrementalRecoveryArchitecturePrototypeRefinement/` (code
+ data) and the new driver script — **zero diff** to
`fiveByFiveEdges.ts` or any other Production file this Sprint. The
Traversal Interruptibility mechanism itself is unchanged from Architecture
Prototype Sprint v1's own commit.
