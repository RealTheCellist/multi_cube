# Incremental Recovery — Architecture Prototype

Status: written at Incremental Recovery Architecture Prototype Sprint v1
(2026-07-22), **Decision B**. This is the FIRST Sprint in the whole
Incremental Recovery research arc that includes a real Production code
change. Full driver report:
`solverPrimitiveIncrementalRecoveryArchitecturePrototype/data/incremental-recovery-architecture-prototype-v1-report.txt`
(335 real snapshots, 3801 real test cases, full population — no
subsampling was needed since each case is a single deterministic
measurement, not a repeated-trial average).

---

## 1. The Production change (STEP1)

`fiveByFiveEdges.ts`'s `bfsMoveWingToPosition()` — the exact root-cause
function identified across the prior two Sprints (a node-bounded BFS with
zero `Date.now()` calls, called by both `tryFixWing`, the real production
PAIR-task path, and `enumerateWingCandidates`, 22 project-wide callers) —
gained an **optional** `deadline?`/`granularity`/`checkEveryNodes`
parameter set, guarded so it is byte-identical to its pre-Sprint form when
unused:

- `deadline` defaults to `undefined`; every added check is gated by
  `deadline !== undefined`.
- No existing caller (`tryFixWing`, `enumerateWingCandidates`, or any other
  of the 6 internal call sites) was changed to pass one.
- Minimal footprint: only `bfsMoveWingToPosition`, `toLiteEdges`, and the
  `LiteEdge5` interface were exported (was private). `posKey`, `round`,
  `candidatesForWing`, `LibraryEntry`, and the other lite-state helpers
  remain private — deliberately not touched.

**Verified safe** two ways:
- `git stash` / full-project `npx tsc -b --noEmit` / `git stash pop`
  comparison: with the change reverted vs applied, the ONLY diff is 6
  errors in this Sprint's own new file (unexported-symbol errors, since it
  imports what this edit exports) — zero errors changed anywhere else.
- Regression-safety smoke check: calling the modified function with no
  deadline vs a deadline 60s in the future (never fires) on all 3801 real
  test cases produced **byte-identical results in every case** (0
  mismatches).

## 2. STEP1 — Traversal Interruptibility, granularity comparison

Three check placements compared on all 3801 real cases with a
deliberately-expired deadline (forces abort at the very first check):

| Granularity | avg overshoot | max overshoot | aborted |
|---|---|---|---|
| nodeCount (every 50 nodes) | 1.26ms | 10ms | 3801/3801 |
| **queuePop** (every node dequeue) | **0.84ms** | **3ms** | 3801/3801 |
| levelTransition (every BFS depth) | 1.75ms | 7ms | 3801/3801 |

`queuePop` was selected for STEP2-6 — lowest average AND lowest worst-case
overshoot.

## 3. STEP2 — Budget Compliance

Real 40ms deadline (`RESERVED_SLICE_TARGET_MS` from Refinement Sprint v1,
+5ms tolerance, same definition), `queuePop` granularity, full 3801-case
population:

| Arm | avg runtime | Overrun rate |
|---|---|---|
| Baseline (no deadline) | 77.73ms | 37.02% (1407/3801) |
| **Budgeted (40ms deadline)** | **20.50ms** | **1.10% (42/3801)** |

Refinement Sprint v1's own comparable figure was 54.5%. This Sprint's own
no-deadline baseline at the `bfsMoveWingToPosition` layer is 37.0% (a
different, deeper layer than Refinement Sprint's whole-attempt
measurement — disclosed for transparency); either way, the budgeted arm's
1.10% is far below the 40% Level2 target.

## 4. STEP3-4 — Capability Preservation & Regression Analysis

Because both arms traverse the identical deterministic BFS order over the
identical `maxDepth=6` bound, the budgeted arm can only fail to find a
path the baseline found for one reason: the deadline fired mid-search.
This makes True/False Regression classification exact, not estimated:

| Metric | Value |
|---|---|
| Baseline success rate (no deadline) | 80.56% |
| Budgeted success rate (40ms deadline) | 62.17% |
| Success rate delta | **-18.39pp** |
| True Regression (baseline succeeded, budget aborted it) | 699/3801 (18.39%) |
| False Regression (both arms failed regardless) | 739/3801 |
| Duplicate impact | not applicable at this layer (Visited Registry untouched) |

## 5. STEP5 — Standard Evaluation (5-metric framework, N=3801 >> 30)

| Metric | Result |
|---|---|
| Primary (Budget Overrun reduction, paired) | mean=0.359, 95% CI=[0.344, 0.375], Cohen's d_z=0.741 (medium) |
| Secondary (native success rate, both arms) | 80.56% → 62.17% |
| Regression (candidate-strictly-worse) | 699 (18.39%) |
| Capability (task-level proxy delta) | -18.39pp |
| Integration (Runtime delta AND Overrun delta together) | -57.23ms, -35.91pp |

## 6. STEP6 — Level 1-3 Judgment

| Level | Criterion | Result |
|---|---|---|
| 1 | Traversal Interruptibility correctly implemented | **PASS** — all 3 granularities interrupt every case; 3801/3801 regression-safety match; zero new type errors |
| 2 | Budget Overrun reduced to ≤40% | **PASS** — 1.10% actual, far below target |
| 3 | Capability maintained, no Regression increase | **FAIL** — -18.4pp success rate, 699 True Regressions |

## 7. Decision: B

Level1/2 pass decisively; Level3 fails on real data. The failure is
**not** a mechanism defect — the interruptibility check itself works
exactly as designed (Level1) and bounds worst-case cost far below target
(Level2). The failure is that the **fixed 40ms budget value** is often
too tight: many real searches genuinely need more than 40ms of wall time
to find a path at all, so cutting them off there loses real capability —
this is a parameter-tuning problem, not a validity problem.

Crucially, **this Sprint's own mechanism changes what's tunable**: before
it existed, no budget above ~40ms could be used safely, since an
uncontrolled BFS could run to 428–1003ms (Refinement Sprint v1's own
measured worst case) with no way to bound it. Now that Traversal
Interruptibility physically bounds worst-case cost at ANY target value,
a larger budget (e.g. 80/100/140ms) becomes safe to try for the first
time.

**Next Sprint recommendation**: Incremental Recovery Architecture
Prototype Refinement Sprint v1 — sweep budget values now that they can be
enforced safely, to find an operating point that keeps Budget compliance
near this Sprint's own ~1% overrun class while recovering more of the
80.6% baseline capability.

## 8. Protected-file scope verification

`git status --short` at commit time showed exactly:
- `modified: src/customCube/fiveByFiveEdges.ts` (this Sprint's sole
  sanctioned Production change)
- New files under `solverPrimitiveIncrementalRecoveryArchitecturePrototype/`
  and the new driver script

No diff to Planner/Executor/Recovery/Primitive Gate/Primitive Logic/Solver
algorithm proper, and no existing Primitive or Prototype directory was
touched.
