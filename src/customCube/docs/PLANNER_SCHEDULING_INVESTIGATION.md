# Planner Scheduling Investigation Sprint v1

Status: **Complete**. Independent track from the Primitive research line (per
Coverage Hole Discovery Sprint v1's own explicit Coverage-Hole-vs-Planner
split). Investigated all 28 Reachable-but-Unexploited cases from the
regenerated 142-case Hole Dataset. Full report:
`plannerInvestigation/data/planner-investigation-v1-report.txt`.

## 1. Method

For each Reachable-but-Unexploited case (>=1 of BASE/FLIP/CASE/PARITY/
RECOVERY succeeds on an isolated scratch-clone test, but the real
production 50-iteration loop never converged), this Sprint used telemetry
already captured per case (`wingPairingRecoveryTriggeredCount`,
`wingPairingBudgetViolations`, added specifically for this Sprint) to
classify the failure mode without any new simulation:

- **TRIGGER_PROBLEM**: RECOVERY succeeds in isolation but was never
  invoked across all 50 real iterations.
- **BUDGET_PROBLEM**: RECOVERY succeeds in isolation, was triggered, but
  its own real per-call deadline was still missed.
- **MAIN_PIPELINE_PROBLEM**: a non-Recovery primitive (BASE/FLIP/CASE/
  PARITY) already covers it -- a task-ordering/scoring issue in the
  Planner's normal (non-Recovery) task selection.
- **UNEXPLAINED**: RECOVERY succeeds, triggered multiple times, no budget
  violation, still unresolved -- disclosed as open rather than force-
  explained.

## 2. Result

| Failure Mode | Count | Share |
|---|---|---|
| **MAIN_PIPELINE_PROBLEM** | **28/28** | **100%** |
| TRIGGER_PROBLEM | 0 | 0% |
| BUDGET_PROBLEM | 0 | 0% |
| UNEXPLAINED | 0 | 0% |

**Every single Reachable-but-Unexploited case has the same root cause.**
None involve RECOVERY at all -- the primitive that demonstrably resolves
each case in isolation is always BASE and/or PARITY (the main non-recovery
pipeline), never RECOVERY.

| Succeeded-primitive combination | Count |
|---|---|
| BASE only | 12 |
| PARITY only | 9 |
| BASE + PARITY | 7 |

## 3. A subtlety the telemetry surfaced

Recovery machinery was NOT idle during these 28 cases -- it was triggered
frequently (range 0-50 iterations, average **19.6/50**, only 1/28 cases with
zero triggers). Several cases show Recovery triggering on **every single**
of the 50 iterations (`50/50`). But this is a red herring for these
specific cases: RECOVERY never appears among the primitives that actually
resolve them in isolation, so however often Recovery fires, it is not the
mechanism that would fix these residuals. The real problem is entirely in
the Planner's **normal, non-Recovery task selection** -- across 50 real
iterations, it never assigned top priority to the exact BASE or PARITY task
that an isolated test finds immediately.

## 4. Recommendation

**Single, focused fix target**: the Evaluator's Weight Table (main pipeline
task scoring), not the Recovery trigger condition or Recovery's own budget.
Since 100% of this population is MAIN_PIPELINE_PROBLEM, there is no
competing hypothesis to weigh -- Recovery-side investigation
(`fiveByFiveEdgeRecovery.ts`'s trigger logic or budget) would not address
any of these 28 cases. A natural next step (out of this Sprint's
measurement-only scope) would be to trace the Evaluator's actual score for
the winning BASE/PARITY task across all 50 iterations on a few
representative cases, to see what score consistently beats it.

## 5. File Scope Verification

This Sprint read only the regenerated `raw-dataset-v1-holes.json` and wrote
only `plannerInvestigation/` + this document. Zero interaction with any
Solver production file (verified: `git diff --stat` against all protected
files is empty).
