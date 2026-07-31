# Parity-Gated Cycle Integration Architecture Analysis Sprint v1

Read-only structural analysis. **No production file is modified in this
Sprint.** The goal is to independently prove (or disprove) whether
`PARITY_GATED_CYCLE`'s observed Capability absence in the real 142-case
Production Replay (`parityGatedCycleProductionIntegrationV1`'s own
`offered=0/142`) is caused by Gate design, Budget competition with CCR,
Scheduler position/ordering, or the Primitive itself -- so that the next
Sprint (a Production Integration Refinement) knows exactly which single
Operating Contract element to change.

Protected (never modified in this Sprint): `fiveByFiveEdgeRecovery.ts`,
`fiveByFiveEdgeSolverEngine.ts`, `fiveByFiveEdgePlanner.ts`,
`fiveByFiveEdgeExecutor.ts`, `fiveByFiveEdges.ts`,
`fiveByFiveSolverTypes.ts`, all Primitives, all Validation Framework code,
all prior Production Integration code. `git diff --stat` against these
paths must show zero changes for this Sprint.

## Modules (STEP1-6)

- **RecoveryTimelineCollector.ts** (STEP1) -- calls the real, unmodified
  `generateRecoveryStrategies()` / `chooseBestRecovery()` with the
  already-exported `SchedulingEvent` `onEvent` hook to record a full
  per-candidate timeline (start/finish/ownRuntime/remainingTimeBefore/
  remainingTimeAfter/offered/chosen) for one real call per case, covering
  all 6 `RecoveryType`s.
- **BudgetConsumptionAnalyzer.ts** (STEP2) -- aggregates the timelines into
  avg/p95 Runtime, avg Remaining Time After, and Budget Share(%) per
  candidate type.
- **CounterfactualSchedulerReplay.ts** (STEP3) -- keeps every candidate's
  real underlying search function and real per-candidate Budget Contract
  unchanged, and re-executes 3 relative orderings (Option A = today's real
  order REPAIR->CCR->PARITY_GATED_CYCLE, Option B =
  REPAIR->PARITY_GATED_CYCLE->CCR, Option C =
  PARITY_GATED_CYCLE->REPAIR->CCR) against the same real wall-clock
  1000ms outer deadline. This is genuine re-execution, not an estimate --
  Production itself is never touched since the real order is hardcoded in
  `fiveByFiveEdgeRecovery.ts` and can only be varied via a disclosed shadow
  reimplementation reusing the same real functions.
- **DedicatedBudgetSimulation.ts** (STEP4) -- holds the Scheduler position
  fixed at today's real order (REPAIR->CCR->PARITY_GATED_CYCLE) and varies
  only `PARITY_GATED_CYCLE`'s own budget policy (`"remainingTime"` i.e.
  CCR's own unclamped style, vs a fixed reserved slice of
  500/1000/1500/2000ms).
- **GateAudit.ts** (STEP5) -- a funnel over the real 142-case population:
  Gate PASS (`componentCount>1`) -> Offered (== "Primitive 성공" in this
  codebase's own contract, see the file's header disclosure) -> Budget
  부족 / Primitive 실패 (split by `remainingTimeBeforeMs` at the real
  production position) -> Chosen.
- **RootCauseMatrix.ts** (STEP6) -- classifies every one of the 142 real
  cases into exactly one of `GATE_MISS` / `RESOLVED` /
  `CANDIDATE_SELECTION` / `SCHEDULER_ORDERING` / `BUDGET_STARVATION` /
  `PRIMITIVE_FAILURE`, using only STEP1/STEP3/STEP4 data (see the file's
  own header for the exact precedence rule), then computes proportions and
  the dominant deficiency cause.

## Driver

`../runParityGatedCycleIntegrationArchitectureAnalysisV1.ts` runs STEP1-6
in sequence over the full real 142-case Hole Dataset
(`loadRawHoleDataset()`, unmodified) and writes
`data/parity-gated-cycle-integration-architecture-analysis-v1-{report.txt,result.json}`.

See `../../docs/PARITY_GATED_CYCLE_INTEGRATION_ARCHITECTURE_ANALYSIS.md`
for the full STEP1-6 narrative, real measured numbers, Level1-3 verdicts,
and the Decision A/B/C answer to this Sprint's two closing questions.
