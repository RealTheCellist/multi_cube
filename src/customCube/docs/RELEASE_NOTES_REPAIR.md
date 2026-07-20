# Release Note: REPAIR Recovery Primitive (reservedBudget default)

**Shipped**: Integration Validation Sprint v1, 2026-07-20
**Where**: `fiveByFiveEdgeRecovery.ts` (Recovery layer), gated behind the
existing `attemptRecovery()` fallback that already only runs when the
ordinary BASE/FLIP/CASE/PARITY/ENDGAME pipeline finds no progress at all.

## What problem this solves

A share of ENDGAME-task failures are *structural*: the remaining wrong
wings form a multi-piece cycle that no single-piece pairing/flip/parity
move can resolve, but that a wider, multi-hop cycle-resolution search
(re-arranging several wings' relationships at once) can. Before this
change, the Recovery layer's only fallback options were DISRUPT
(deliberately unpair something to create an easier case) and SETUP (a
non-improving move followed by a cleanup pass) — neither targets this
specific structural cause directly.

## What was added

**REPAIR**, a third Recovery candidate type backed by `W2_widerHop`
(`runSuccessV2` in `solverPrimitivePrototypeRefinementV2/
SuccessOptimizationV2.ts`): a Gate-checked (cycle length 2~4 AND at least
one conflicting edge), Deferred-Validated (only ever proposes moves that
net-improve `wrongWingCount5`) structural cycle resolution. Because its
own validation already guarantees improvement, `attemptRecovery()` can
short-circuit straight to acceptance when REPAIR is chosen, skipping the
usual retry round-trip DISRUPT/SETUP still need.

## Why it's the production default now

REPAIR alone worked, but almost never got a *turn*: Recovery's four
candidates (DISRUPT, DISRUPT, SETUP, REPAIR) shared one 300ms generation
budget in a fixed order, and DISRUPT/SETUP routinely consumed all of it
before REPAIR's turn came up (Generation Skipped rate ~48-50% of the
time). Giving REPAIR a **reserved, unstarvable ~75ms window**
(`schedulingStrategy: "reservedBudget"`, now the default — override still
available via `"baseline"`/`"priorityGate"`) fixed this directly:

| | Before | After |
|---|---|---|
| REPAIR generation rate | ~0.2-0.4% | ~1.1-2.0% |
| Generation Skipped (never got a turn) | ~48-50% | **0%** |
| paired-diff 95% CI (GapRescue, vs prior default) | — | positive, excludes zero in **4 independent measurements** (N=15 x2, N=30 x1, plus this Sprint's own N=30 confirmation) |
| Regressions observed | — | **0**, across every measurement in this arc |

Full end-to-end validation (scripted press-loop through the real public
`SolverEngine` API) showed 0 exceptions and 0 genuine infinite loops
across the 150-replay dataset; runtime/deadline-miss/memory stayed
comparable to the prior default.

## What did NOT change

No new `SolveTaskType`. No Planner change. No change to
`fiveByFiveEdgeSolverEngine.ts`. No change to W2_widerHop's own search
algorithm or Gate. This is a scheduling fix only — REPAIR's underlying
mechanism was correct from Integration Prototype Sprint v1 onward; it
just needed a fair chance to run.
