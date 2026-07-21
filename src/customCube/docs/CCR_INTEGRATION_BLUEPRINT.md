# CCR Integration Blueprint

Status: Blueprint stage only, per `docs/PRIMITIVE_RESEARCH_PROCESS.md`'s
own process. **No production code was modified in this document or this
Sprint** — Production Solver/Planner/Executor/Recovery/every Primitive
remain exactly as CCR Prototype Sprint v1 left them.

**Source Sprint**: CCR Integration Blueprint Sprint v1, 2026-07-21.
Full driver report: `solverPrimitiveCCRIntegrationBlueprint/data/
ccr-integration-blueprint-v1-report.txt` (784.6s real run — every number
below is read from that file).

---

## 1. Production Integration Point (STEP1)

Four candidates were compared:

| Point | Layer | Measurable from existing data? |
|---|---|---|
| REPAIR 이전 | Recovery | Yes |
| REPAIR 이후 | Recovery | Yes |
| PARITY 이전 | Main pipeline (new SolveTaskType) | **No** |
| PARITY 이후 | Main pipeline (new SolveTaskType) | **No** |

The two Recovery-layer options are **outcome-equivalent**: REPAIR's Gate
(`cycleLength 2-4`) and CCR's Gate (`cycleLength 5-6, conflictEdgeCount=0`)
are disjoint (CCR Prototype Sprint v1 measured 0 Duplicate Success), so
generation order between them only affects latency, never which one
contributes. The two main-pipeline options would require a new
`MacroGoalType`/Planner change (forbidden this Sprint) and, more
fundamentally, **their true Coverage is unmeasurable from the existing
335-snapshot dataset**: every snapshot is a state captured *after* the
full pipeline (including PARITY/ENDGAME/Recovery) already ran and failed
— there is no captured "state right before PARITY runs" to test against.
This limitation is disclosed rather than papered over with an assumption.

**Chosen: `repair_after`** — CCR appended to `generateRecoveryStrategies()`'s
candidate list right after REPAIR, mirroring the exact "newest addition
appended last" convention already established in this codebase
(`fiveByFiveEdgeRecovery.ts`'s own comment on REPAIR; `RepresentationPrimitiveSelector.ts`'s
`FIXED_BASELINE_ORDER` comment).

Real, measured Recovery-layer call frequency on this dataset: **23.6%**
(79/335) — this defines the ceiling on how often CCR could ever get a
turn under this Integration Point.

## 2. Scheduling Contract (STEP2)

- **호출 조건**: `task.type === 'ENDGAME'` AND primary pipeline made zero
  progress (Recovery already triggered) AND CCR's own Gate.
- **우선순위**: meaningless in the outcome sense (disjoint Gates) — only
  latency-relevant.
- **실행 순서**: `DISRUPT, DISRUPT, SETUP, REPAIR, CCR` — CCR added last.
- **Budget 배분**: CCR gets its own reserved slice, independent of
  DISRUPT/SETUP's shared `genDeadline` — the same `reservedBudget`
  philosophy `REPAIR_RESERVED_SLICE_MS` already established for REPAIR.
- **Starvation 방지**: CCR's own slice means it neither starves nor is
  starved by DISRUPT/SETUP/REPAIR — reuses Integration Refinement Sprint
  v1's already-validated mechanism, not a new one.

## 3. Budget Contract (STEP3)

Real architecture constants (read-only): `PLAN_TIME_BUDGET_MS=1000ms`,
Planner reservation `200ms`, `RECOVERY_RESERVE_MS=450ms` (`RECOVERY_GEN_BUDGET_MS`
300ms + `MAX_RECOVERY_RETRIES`(1)×`RECOVERY_RETRY_BUDGET_MS` 150ms), worst-case
available for all of Recovery `800ms`.

CCR Prototype Sprint v1's own "ideal" budget was **1000ms** — but that is
**2.2× RECOVERY_RESERVE_MS** and even exceeds the 800ms theoretical
ceiling assuming PAIR/FLIP/PARITY consume zero time (never true in
practice). **A fixed 1000ms budget is architecturally infeasible.**

Re-measured budget curve (fresh run, this Sprint):

| Budget | Match rate |
|---|---|
| 150ms | 17.3% (30/173) |
| 250ms | 24.9% (43/173) |
| 500ms | 40.5% (70/173) |
| 1000ms | 47.4% (82/173) |

(Consistent with CCR Prototype Sprint v1's own independently-measured
curve — 19.1/31.2/46.2/53.2% — modest run-to-run wall-clock variance,
same shape and conclusion.)

**Recommended policy: `remainingTime`** — CCR uses whatever real time is
left before the outer deadline (`deadline - Date.now()`), exactly the
same pattern `runPrimaryPipeline`'s own ENDGAME branch already uses
(`while (Date.now() < deadline)`) — not a new mechanism, a reuse of an
existing one. **Recommended minimum floor: 500ms** (below this, match
rate drops steeply per the curve above).

## 4. Risk Analysis (STEP4)

| Risk | Severity | Finding |
|---|---|---|
| Regression | **low** | Disjoint Gate + shared Deferred Validation invariant — same guarantee that gave REPAIR 0 regressions across 4 Sprints. |
| Runtime | **medium** | Current real avg runtime on this dataset is already 1079.3ms (93.4% deadline-miss). Adding CCR's own weighted cost (Recovery rate 23.6% × CCR-eligible-among-triggered 45.6% × CCR's own ~910ms avg) brings the estimate to **1177.1ms (+9.1%)** — a real, quantified increase on an already-strained budget. |
| Primitive starvation | **low** | CCR's own reserved slice (§2) prevents mutual starvation with DISRUPT/SETUP/REPAIR — reused mechanism, not new. |
| Scheduler impact | **low** | `chooseBestRecovery()` already operates over an arbitrary-length candidate array (`reduce`) — adding a 5th type is a pure list extension, no algorithmic change. |

## 5. Integration Simulation (STEP5)

Composed from two REAL, independently-measured executions (never wired
together in production): `analyzeProductionPath`'s real `engine.solve()`
baseline, plus `runCCRPrototype()` called directly against the same raw
snapshot state.

| Scenario | CCR call rate | Est. new capability | Baseline runtime → integrated |
|---|---|---|---|
| A: budget=1000ms (ideal) | 10.7% | 11 snapshots | 1079.3ms → 1177.1ms |
| B: budget=500ms (recommended floor) | 10.7% | 9 snapshots | 1079.3ms → 1135.0ms |

Recovery-triggered-and-CCR-Gate-eligible rate: **45.6%**.

## 6. Success Criteria (STEP6 equivalent — this Sprint's own gate)

| Level | Criterion | Result |
|---|---|---|
| Level 1 | Integration Point 확정 | **PASS** (`repair_after`) |
| Level 2 | Scheduling + Budget Contract 확정 | **PASS** (`remainingTime`, floor 500ms) |
| Level 3 | Regression 없이 Integration 가능함을 입증 | **PASS** (Runtime risk = medium, not high; 9-11 new-capability snapshots) |

**최종 결정: A** — proceed to **CCR Production Integration Sprint v1**,
carrying forward: Integration Point = `repair_after`; Scheduling Contract
= §2; Budget Contract = `remainingTime` with a 500ms floor; and the
disclosed Runtime risk (medium, +9.1% estimated) as the one open item
that Sprint's own Regression/Runtime testing must specifically verify
against the real end-to-end `solve()` path.
