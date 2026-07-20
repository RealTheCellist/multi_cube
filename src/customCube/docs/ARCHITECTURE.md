# 5x5 Edge Solver — Production Architecture

Status: current as of Solver Primitive Research Closeout Sprint v1 (2026-07-20).
This is the first committed architecture document for this system — prior
Sprints referred to an uncommitted external "spec," so this file exists to
give the codebase its own persistent source of truth.

## 1. Pipeline overview

```
FiveByFiveEdgeSolverEngine.solve(cubies)
        │
        ▼
  planEdgeTasks()               (fiveByFiveEdgePlanner.ts — "Planner")
        │  produces SolveTask[], each one of:
        │    PAIR | FLIP | PARITY | ENDGAME
        ▼
  executeTask() per task        (fiveByFiveEdgeExecutor.ts — "Executor")
        │  runs the primary pipeline for that task's type first
        ▼
  runPrimaryPipeline()          (existing wing-pairing libraries:
        │                        tryPairWing / tryFlipTrick / caseLib /
        │                        tryEndgameSearch, etc. — untouched by
        │                        this whole research arc)
        │
        │  if the primary pipeline finds NO progress at all AND the task
        │  is ENDGAME-typed:
        ▼
  attemptRecovery()              (fiveByFiveEdgeRecovery.ts — "Recovery")
        │  generateRecoveryStrategies() builds >=3 candidates:
        │    DISRUPT, DISRUPT, SETUP, REPAIR
        │  chooseBestRecovery() picks the highest-scoring one
        │  applies it, then retries the original task
        ▼
  (REPAIR candidates specifically come from runSuccessV2/W2_widerHop,
   solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts)
```

## 2. The two type-level "registries"

There is no separate "Primitive Registry" file or runtime lookup table in
this codebase — the type system itself is the registry, and both levels
already include everything shipped so far:

- **`SolveTaskType`** (`fiveByFiveEdgeSolverTypes.ts`): `"PAIR" | "FLIP" |
  "PARITY" | "ENDGAME"` — the four task types the Planner ever produces.
  This has NOT changed and REPAIR is not a member of it — REPAIR never
  becomes its own top-level task type; it only ever fires as a fallback
  *within* an ENDGAME task's Recovery attempt.
- **`RecoveryType`** (`fiveByFiveEdgeSolverTypes.ts`): `"DISRUPT" | "SETUP" |
  "REPAIR"` — the three Recovery candidate-generation strategies. **REPAIR
  has been a formal member of this union since Integration Blueprint/
  Prototype Sprint v1** — there was never a moment where it existed as an
  unregistered/ad-hoc string. This Sprint's own "should REPAIR be
  registered as a Primitive" review concludes: yes, and it already is,
  structurally, at the only level that has ever existed for this
  distinction. No new registry file was created — one isn't needed.

(A separate, older classification — `AllowedPrimitive = "BASE" | "FLIP" |
"CASE" | "PARITY" | "BP1"` in `solverRepresentationPrototype/
RepresentationPrimitiveSelector.ts` — is unrelated to either of the above.
It is a *research-only* label set from the original solver-v2 capability
research (pre-dating the Planner/Executor/Recovery architecture) used
purely to classify snapshots for the "Gap" concept in benchmark code. It
is not part of the production dispatch and is not being extended for
REPAIR.)

## 3. Recovery Scheduling (production default as of this Sprint)

`generateRecoveryStrategies()` (`fiveByFiveEdgeRecovery.ts`) takes an
optional `schedulingStrategy` parameter controlling the order/budget rule
its four candidates share:

- `"baseline"` — DISRUPT, DISRUPT, SETUP, REPAIR in that order, all four
  sharing one 300ms `genDeadline` sequentially. This was production
  behavior through Integration Prototype Sprint v1, and remains available
  as an explicit override.
- `"priorityGate"` (Strategy A) — REPAIR tried first, same shared-budget
  mechanism otherwise.
- `"reservedBudget"` (Strategy B) — **the production default since
  Integration Validation Sprint v1.** Order stays DISRUPT, DISRUPT, SETUP,
  REPAIR, but REPAIR's own turn is never gated by whether the other three
  already exhausted the shared `genDeadline` — it gets a dedicated
  `REPAIR_RESERVED_SLICE_MS` (75ms) window regardless.

`attemptRecovery()`/`executeTask()` both default to `"reservedBudget"` too
(threaded straight through); passing `"baseline"`/`"priorityGate"`
explicitly reconstructs prior behavior for comparison — this override was
deliberately never removed.

## 4. REPAIR's own contract

`runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP)` (in
`solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts` — the one
research file production code imports) does its own Gate check
(`analyzeMultiCycle` + `conflictEdgeCount>0`, cycle length 2~4) and its own
Deferred Validation (only returns moves when they net-improve
`wrongWingCount5`) before Recovery ever sees a candidate — so a REPAIR
candidate reaching `chooseBestRecovery` is already known to be a genuine
improvement, which is why `attemptRecovery()` is allowed to short-circuit
(skip the retry round-trip) when a REPAIR candidate is chosen.

## 5. What's NOT part of this architecture

`GoalPlanner`/`GoalIntegration` (an earlier, separate research line) is
**not** wired into `FiveByFiveEdgeSolverEngine.solve()` — that entry
point's own imports are limited to `cubeState`, `fiveByFiveEdges`,
`fiveByFiveEdgeStateHash`, `fiveByFiveEdgePlanner`, `fiveByFiveEdgeExecutor`,
`fiveByFiveEdgeSolverTypes`, `fiveByFiveEdgeEvaluator` — confirmed by
direct inspection while writing this document. Any code suggesting
otherwise elsewhere is historical/exploratory, not live.
