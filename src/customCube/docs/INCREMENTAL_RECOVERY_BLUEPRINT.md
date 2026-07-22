# Incremental Recovery — Blueprint Specification

Status: written at Incremental Recovery Blueprint Sprint v1 (2026-07-22),
**Decision A**. Architecture Blueprint stage only — zero Production Solver /
Planner / Executor / Recovery / Primitive (CCR/REPAIR) files were touched.
All new code lives under `solverPrimitiveIncrementalRecoveryBlueprint/`, and
every number below comes from `runIncrementalRecoveryBlueprintSprintV1.ts`
running the real, unmodified `planEdgeTasks()` / `executeTask()` /
`runCCRPrototype()` / `runSuccessV2()` over all 335 real failure snapshots.
Full driver report:
`solverPrimitiveIncrementalRecoveryBlueprint/data/incremental-recovery-blueprint-v1-report.txt`.

---

## 0. Why this Sprint

Recovery Architecture Review Sprint v1 established that Recovery is
ENDGAME-only, triggers after ~95.7% of the whole-plan budget is already
spent, and that PAIR tasks — not ENDGAME — are both the dominant runtime
consumer (66.7% of a solve() call) and the largest no-progress population
(1436/1797 real attempts, 79.9%), dwarfing ENDGAME's own 51 attempts. This
Sprint designs a Blueprint for extending Recovery-style intervention
("Incremental Recovery") down into the PAIR phase itself.

## 1. Trigger

**featureBased**: fire immediately after a PAIR task returns empty `moves`
(no progress), but *only* if `analyzeCcrGate()` on the resulting state shows
CCR-Gate eligibility (cycleLength 5–6, conflictEdgeCount 0) or REPAIR-Gate
eligibility (cycleLength 2–4) — i.e. only when one of the two existing,
unmodified primitives already has a real shot at this exact state.

Four triggers were compared on the real 1421-record PAIR-no-progress
population (335 snapshots):

| Trigger | Coverage | Gate-eligible overlap |
|---|---|---|
| allNoProgress | 1421/1421 (100.0%) | 1193/1421 (84.0%) |
| consecutiveNoProgress | 1086/1421 (76.4%) | 904/1086 (83.2%) |
| thresholdBased (wrongWingCount≤15) | 1351/1421 (95.1%) | 1133/1351 (83.9%) |
| **featureBased** | **1193/1421 (84.0%)** | **1193/1193 (100.0%)** |

`allNoProgress` has the largest raw coverage but only 84.0% of those calls
would ever have a chance of succeeding (no Gate match) — calling on every
no-progress event wastes ~16% of calls on states neither primitive can
touch, plus fires far more often than necessary. `featureBased` is the only
trigger whose matched population is **exactly** the population with a real
shot (100.0% overlap) — it restricts calls to exactly the 1193 states worth
attempting.

## 2. Preconditions

1. `task.type === "PAIR"`.
2. `executeTask()` already returned an empty `moves` array for this task
   (no-progress already established through the existing, unmodified
   PAIR search path — Incremental Recovery is a *second* attempt, never a
   replacement for the first).
3. `analyzeCcrGate()` (existing, unmodified) reports CCR-Gate or
   REPAIR-Gate eligibility for the state as it stands after the failed PAIR
   attempt.
4. This exact PAIR task slot has not already had an Incremental Recovery
   attempt during this `solve()` call (task-scoped, at-most-once — see
   Safety Contract §5.4).

## 3. Budget Contract

Four allocation policies were probed directly against the real captured
cube states (`IncrementalBudgetContract.ts`, calling `runCCRPrototype()` /
`runSuccessV2()` unmodified) over the 1193 Gate-eligible records:

| Policy | n | avg budget | success rate | avg time/probe |
|---|---|---|---|---|
| fixed (50ms) | 1193 | 50.0ms | 3.8% | 187.8ms |
| **remainingTime** | 1193 | 270.7ms | **15.7%** | 335.8ms |
| reservedSlice (min(remaining, 40ms)) | 1193 | 31.3ms | 2.8% | 140.7ms |
| adaptiveSlice (remaining / tasksLeft+1) | 1193 | 35.3ms | 2.3% | 155.7ms |

`remainingTime` gives the best real success rate (15.7%) by a wide margin,
but it is unsafe as a per-PAIR-task policy because it can consume the
*entire* remaining plan budget on a single task, starving every subsequent
PAIR/FLIP/PARITY/ENDGAME task. **Adopted policy: `reservedSlice`**
(`min(remainingTimeAtCapture, 40ms)`) — it trades some of `remainingTime`'s
raw success rate for a hard per-attempt cap that fits inside the existing
`TASK_LOCAL_BUDGET_MS = 120ms` PAIR/FLIP task budget without needing to
touch that constant. The Prototype Sprint should re-validate whether a
larger reserved cap (e.g. 60–80ms, still inside the 120ms window) recovers
more of `remainingTime`'s success rate without over-consuming a single
task's own budget.

## 4. Scheduling

Incremental Recovery is wired **only** into the real top-level execution
loop (`SolverEngine.solve()`'s own task-iteration loop), gated by the same
`allowRecovery` flag that already restricts ENDGAME Recovery today.
`fiveByFiveEdgePlanner.ts`'s `simulateStrategy()` preview path (used to pick
between the 5 candidate strategies) must remain `allowRecovery=false` —
identical to how ENDGAME Recovery is already excluded from it. Task order
itself is unchanged: the existing PAIR search (`tryFixWing` etc.) always
runs first; Incremental Recovery is a second attempt on the *same* task
slot only after that first attempt already returned no progress.

## 5. Safety Contract

Derived from `SafetyAnalysis.ts` (STEP5), grounded in this whole session's
established architecture:

1. **Primitive duplication** (low) — CCR/REPAIR's own Gate/search code is
   reused unmodified; only the call-site decision logic is new. A PAIR-phase
   success naturally prevents the same state from ever reaching ENDGAME, so
   no state is worked on twice.
2. **Scheduler conflict** (high, requires explicit handling) — Recovery's
   timing-sensitive search must never leak into Planner's `simulateStrategy()`
   preview path, or it breaks the Planner's "same cube → same strategy"
   determinism guarantee (a bug class already seen once, pre-session). The
   Blueprint's Scheduling contract (§4) exists specifically to prevent this
   recurring at the PAIR level.
3. **Budget conflict** (medium) — resolved by choosing `reservedSlice`
   (§3) precisely because it fits inside the existing 120ms PAIR/FLIP task
   budget rather than requiring a redesign of that budget structure.
4. **Regression risk** (low) — both primitives already gate their own
   output through Deferred Validation (net-improvement-only), so
   Incremental Recovery inherits the same zero-regression invariant REPAIR
   has held across 4 prior Sprints.
5. **Infinite retry** (medium, requires explicit handling) — the existing
   `attemptRecovery()` visited-hash mechanism does not span independent
   per-task calls. The Blueprint requires either a `solve()`-call-scoped
   global visited set shared across all Incremental Recovery attempts, or
   (simpler, adopted) an explicit **at-most-one Incremental Recovery
   attempt per PAIR task slot** cap (Precondition §2.4).

## 6. Expected Capability

- **Population**: 1421 real PAIR no-progress records across 335 snapshots;
  1193 are Gate-eligible (CCR 655 + REPAIR 538) — **27.9× ENDGAME's own
  51-attempt population**.
- **Coverage** (Gate-eligible population, best-policy success rate measured
  directly): 15.7% (`remainingTime`); the adopted `reservedSlice` policy
  measured 2.8% on the same population — the gap between them is the
  concrete question the Prototype Sprint must resolve (larger reserved cap,
  or a different budget shape entirely).
- **Runtime**: at most one attempt per PAIR task slot, capped at
  `reservedSlice`'s ≤40ms, across at most 12 PAIR tasks per solve() call —
  bounded, unlike `remainingTime`'s unbounded worst case.

## 7. Open question for the next Sprint

The trigger and population case is strong (Level 1/2 both PASS cleanly),
but the adopted safe budget policy (`reservedSlice`, 2.8%) captures far
less of the raw achievable success rate than the unsafe one
(`remainingTime`, 15.7%) shows is possible. Incremental Recovery Prototype
Sprint v1 should treat closing this gap — via a larger-but-still-bounded
reserved cap, or a smarter per-task time-sharing scheme — as its primary
technical question, not merely wiring the Blueprint's baseline policy
as-is.
