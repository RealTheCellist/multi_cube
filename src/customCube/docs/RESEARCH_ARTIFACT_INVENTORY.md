# Research Artifact Inventory (Research Closeout Sprint v1)

This documents the technical-debt classification pass over the ~35
research directories (~220 files) and ~60 top-level `run*.ts` driver
scripts this project's Solver Primitive research history produced, and
what was actually done about it in this Sprint vs left for later.

Methodology: a full cross-directory import graph was built (an Explore
agent's pass, independently spot-checked by hand for every directory
actually deleted below — `grep`-verified zero external importers before
any deletion, not taken on trust).

## What was removed in this Sprint

13 directories confirmed to have **zero** files imported by anything
outside themselves, plus their owning driver scripts (which would
otherwise dangle):

- `contractAnalysis/` (+ `runContractAnalysis.ts`)
- `policyAnalysis/` + `policyPlanner/` (+ `runPolicyGeneralization.ts`) —
  their only external reference was `primitiveResearch/ClusterSelector.ts`,
  itself in the removed set
- `primitiveResearch/` (its driver, `runPrimitivePrototype.ts`, also drove
  `primitivePrototype/` and `primitiveReplay/` — those two directories'
  own reused files are untouched; only the `primitiveResearch`-specific
  parts of that sprint are gone)
- `solverDatasetExpansion/` (+ `runDatasetExpansion.ts`)
- `solverPrimitiveBlueprintReanalysis/` (+ `runPrimitiveBlueprintReanalysis.ts`)
- `solverPrimitiveBlueprintRefinement/` (+ `runPrimitiveBlueprintRefinement.ts`)
- `solverPrimitiveBlueprintV2/` (+ `runPrimitiveBlueprintV2.ts`)
- `solverPrimitiveIntegrationBlueprint/` (+ `runIntegrationBlueprint.ts`)
- `solverPrimitiveIntegrationRefinement/` (+ `runIntegrationRefinement.ts`)
- `solverRepresentationReview/` (+ `runRepresentationReview.ts`)
- `solverV3PrototypeBP5/` (+ `runSolverV3PrototypeBP5.ts`)
- `solverV3Review/` (+ `runSolverV3Review.ts`)

`npx tsc -b --noEmit` was re-run after every deletion and produced no new
errors (only the same pre-existing, unrelated baseline noise this whole
project already had before this Sprint).

## What was confirmed KEEP (core reusable infrastructure — genuinely
imported across a sprint boundary, verified by the same import-graph pass)

- `solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts` —
  **ships in production** (`fiveByFiveEdgeRecovery.ts`).
- `failureAnalysis/` (dataset types, loader, serialization) — imported by
  60+ files across virtually every sprint and driver.
- `capabilityAnalysis/stateGraphBuilder.ts`, `primitiveCapabilityTester.ts`
- `goalPlanner/GoalAnalyzer.ts`, `GoalDatabase.ts`, `GoalState.ts`
- `coverageExpansion/cycleUtil.ts`, `CycleChaseSimulator.ts`,
  `InactivityClassifier.ts`
- `firstHopAnalysis/FailureModeClassifier.ts`, `FirstHopTraceDB.ts`
- `primitiveDiscovery/clusterAnalyzer.ts`, `discoveryTypes.ts`,
  `PrimitiveEvaluator.ts`, `PrimitiveSearch.ts`
- `primitivePrototype/CycleChasePrototype.ts`
- `primitiveReplay/PrototypeReplay.ts`
- `solverDatasetResearch/DatasetBiasReport.ts`, `ReplayDiversityAnalysis.ts`
- `solverPrimitiveBlueprint/GapStructuralAnalysis.ts`,
  `PrimitiveCandidates.ts`, `PrimitiveCoverageMatrix.ts`
- `solverPrimitiveEvaluationStabilization/StatsUtil.ts` — the CI/effect-size
  math every later Sprint's Standard Evaluation Protocol reused
- `solverPrimitiveIntegrationPrototype/RecoveryBenchmark.ts`,
  `TimeBudgetAnalysis.ts` — `loadDataset`/`buildLibs` are what
  `runIntegrationValidation.ts` (current production QA driver) itself uses
- `solverPrimitivePrototype/MultiHopBridgePrototypeV3.ts`,
  `PrototypeBenchmark.ts`, `ConflictDominantSacrificePrototype.ts`,
  `MultiHopBridgePrototype.ts`
- `solverPrimitivePrototypeRefinement/GateExpansionVariants.ts`
- `solverPrimitiveResearch/PrimitiveCapabilityMatrix.ts`
- `solverRepresentationBlueprint/RepresentationCandidates.ts`
- `solverRepresentationPrototype/RepresentationPrimitiveSelector.ts` —
  also used directly by `runIntegrationValidation.ts`
- `solverV2Prototype/BoundedResolver.ts`, `DeferredValidator.ts`,
  `MultiCycleAnalyzer.ts`
- `solverV2PrototypeBP2/ParityAwareResolver.ts`, `ParityStructureAnalyzer.ts`
- `solverV2PrototypeBP3/NonParityStructuralFix.ts`, `ReplayBenchmark.ts`
- `solverV2PrototypeBP4/CycleShapeHasher.ts`, `ReplayBenchmark.ts`
- `solverV2Research/GapDetector.ts`
- `solverV3Research/StateRepresentationCandidates.ts`

**`runIntegrationValidation.ts`** (the most recent driver) is active
production-QA tooling, not a terminal sprint artifact — kept as-is.

## Left as a documented follow-up (not executed this Sprint)

The directories above were kept in full, but each contains a mix of a
small reused "core" (listed above) plus a larger set of single-sprint
terminal analysis files (their own STEPn/decision/report modules, used
only by their own now-obsolete driver). Pruning those file-by-file
without touching the reused core was judged too large a surface to
verify by hand with full confidence in this Sprint (dozens of individual
files across 24 directories) — a future cleanup pass can use the same
import-graph method to do this safely. Their owning drivers (all of
`run*.ts` except `runIntegrationValidation.ts` and the unrelated,
out-of-scope `runBfsMoBenchmark.ts`) are similarly left in place for now,
even though, by this Sprint's own reasoning (a driver's value is
reproducing its own sprint's report, which is done), most of them are
themselves reasonable future-removal candidates.
