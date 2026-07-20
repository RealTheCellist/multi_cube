# Solver Primitive Research Process

Status: written at Research Closeout Sprint v1 (2026-07-20), after REPAIR
became the first Primitive to complete the full cycle below and reach
production. This document exists so the *next* Primitive's research
doesn't have to re-derive its own process from scratch.

## 1. The six stages

| Stage | Question it answers | Typical output |
|---|---|---|
| **Blueprint** | What capability gap exists, and what would a Primitive that closes it need to do? | A written contract/precondition set for a candidate Primitive, derived from structural analysis of failure clusters (not yet any working code) |
| **Prototype** | Can a real implementation of that contract actually be built and made to fire on real snapshots? | A working, isolated implementation (its own file, imported by nothing in production) plus a benchmark on a real replay dataset |
| **Refinement** | Does tuning the Prototype's own parameters (gates, thresholds, search shape) improve it, and by how much? | 2+ named variants compared against the Prototype's own baseline |
| **Evaluation** | Is the *measurement itself* trustworthy — reproducible across runs, not an artifact of one lucky/unlucky sample? | A codified, reusable statistical protocol (this arc's answer: **Majority Vote Gap classification + paired-diff 95% CI, N>=15**) |
| **Integration** | Does wiring the Primitive into the real production pipeline (not just a standalone benchmark) preserve its benefit without regressing anything else? | Sub-stages of its own — Blueprint (where in the pipeline to wire it) → Prototype (wire it, measure) → Refinement (fix whatever the Prototype's own measurement flagged) |
| **Validation** | Does flipping the actual production default hold up under full-solver, large-sample, end-to-end, and performance testing? | A go/no-go production-default decision |

Each stage's own report should end with an explicit **Level 1/2/3 success
criteria table** and a **decision (proceed / iterate / abandon)** — every
Sprint in this arc did this, and it's the single most reusable habit: it
forces the "so what happens next" question to be answered in writing
before moving on, rather than leaving it implicit.

## 2. The REPAIR worked example (chronological, one line per Sprint)

1. **solverV2Research / solverV3Research / solverV3Review** — structural
   research establishing the capability-gap landscape (which failure
   clusters no existing Primitive touches, and why) that eventually
   motivated REPAIR's contract.
2. **solverPrimitiveBlueprint → solverPrimitiveBlueprintRefinement →
   solverPrimitivePrototype (v2) → solverPrimitiveBlueprintReanalysis →
   solverPrimitiveBlueprintV2** — the Blueprint stage, iterated multiple
   times as each round's own measurement disclosed a flaw in the
   previous round's contract (relaxed preconditions, expanded candidate
   generation, reanalyzed which features actually predicted success).
   `solverPrimitivePrototypeRefinementV2/GateExpansionV2.ts` and
   `SuccessOptimizationV2.ts` are the two files that survived this whole
   process — the Gate (`analyzeMultiCycle`, cycle length 2~4,
   `conflictEdgeCount>0`) and the Primitive itself (`W2_widerHop`,
   `runSuccessV2`).
3. **solverPrimitiveEvaluationStabilization (v1 → v2)** — this is where
   the **Standard Evaluation Protocol** was established: a shared Gap
   population fixed by Majority Vote across N repeated runs (since one of
   the existing research-framework Primitives, PARITY, has genuine
   run-to-run randomness via `shuffle()`), then a paired-diff 95% CI on
   the candidate's own GapRescue count against that fixed population,
   N>=15. Every later Sprint in this arc reused this protocol verbatim.
4. **Integration Blueprint Sprint v1** — chose *where* in the real
   production pipeline W2_widerHop should be wired (the Recovery layer,
   as a new `RecoveryType`, not a new `SolveTaskType`).
5. **Integration Prototype Sprint v1** — wired it in behind a flag,
   measured it on the real 150-replay dataset, and found the actual
   bottleneck: **Recovery candidate-generation budget starvation** — REPAIR
   almost never got a turn because DISRUPT/SETUP consumed the shared
   generation deadline first.
6. **Integration Refinement Sprint v1** — compared two Recovery Scheduling
   fixes (`priorityGate`, `reservedBudget`) against that specific
   bottleneck, reproduced the fix twice independently (N=15 each), and
   recommended `reservedBudget`.
7. **Integration Validation Sprint v1** — promoted `reservedBudget` to the
   actual production default, then validated it at N=30, end-to-end, and
   for performance/regression. **A test-harness bug was caught mid-Sprint**
   (an E2E press cap far smaller than real plan lengths, and a Level-1
   criterion relying on a single noisy pass) — both were fixed and the
   whole Sprint was re-run before any conclusion was reported. Decision:
   adopt as production default.

## 3. Durable lessons worth carrying into Primitive #2

- **Reuse the Standard Evaluation Protocol unmodified.** Don't re-derive
  Majority Vote / paired-diff CI / N-count logic per Sprint — import
  `StatsUtil.ts`'s `computeStats` and follow the same collect-once-per-run
  discipline `RawDataCollector`-style files established.
- **Separate "does the mechanism/scheduling work" from "is the effect
  real."** Integration Refinement/Validation Sprints both explicitly
  reported these two questions side by side rather than conflating them
  — a real, reproducible lesson from a Sprint where scheduling improved
  but the first pass mis-measured whether Capability did too.
- **When a single run produces an alarming result, check whether a
  counterfactual arm shows the identical alarming pattern before
  concluding regression.** Twice in this arc (Integration Refinement
  Sprint v1's Level 1 threshold, Integration Validation Sprint v1's E2E
  press cap) an apparent regression turned out to be a test-harness bug,
  caught specifically because baseline and the new variant showed
  *identical* failure signatures — a strong tell that the bug is in the
  harness, not the product.
- **Never report a number the driver script didn't actually produce.**
  Every Sprint's report file is generated by running real code against
  the real 150-replay dataset — no hand-authored or reconstructed
  figures ever made it into a "final" report without a fresh run backing
  them.
- **A production default change should be its own tiny, reversible diff**
  (a default-parameter flip with the override preserved), never bundled
  with the research code that produced the decision.
