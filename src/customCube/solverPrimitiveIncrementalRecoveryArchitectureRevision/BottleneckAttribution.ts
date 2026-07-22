// --- BottleneckAttribution (Incremental Recovery Architecture Blueprint
// Revision Sprint v1) -----------------------------------------------------
// STEP1. Classifies every bottleneck Prototype Sprint v1 and Prototype
// Refinement Sprint v1 actually MEASURED (not hypothesized) into the layer
// that would need to change to fix it. Analysis only -- no new code runs
// against the cube; every number here is a citation of an already-real,
// already-committed measurement from those two Sprints' own report files.
export type ArchitectureLayer = "Wrapper" | "Primitive" | "Production";

export interface BottleneckRecord {
  name: string;
  layer: ArchitectureLayer; // the layer that must change to actually fix this bottleneck
  location: string; // the real file/function where the bottleneck lives
  evidence: string; // the real, cited measurement establishing this bottleneck exists
  expectedImpactScope: string; // what changing this layer would affect, beyond just this one bottleneck
}

export const BOTTLENECKS: BottleneckRecord[] = [
  {
    name: "Budget Overrun, layer 1 of 2 -- Primitive's own coarse per-hop deadline check",
    layer: "Primitive",
    location:
      "solverPrimitiveCCRPrototype/CCRPrototype.ts's runBoundedDfs() and solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts's runParametrizedSearchV2() (both 기존 Primitive, protected) -- each only checks `Date.now() > deadline` ONCE PER HOP (at dfs() entry, and once more before each candidate in that hop's own for-loop), never inside a single enumerateWingCandidates() call.",
    evidence:
      "Both Primitive files' own source (read directly, unmodified): identical `if (Date.now() > deadline || leavesExplored >= MAX_LEAVES_EXPLORED)` checks at exactly 2 points per hop, structurally incapable of interrupting a single enumerateWingCandidates() call already in progress.",
    expectedImpactScope:
      "Confined to REPAIR/CCR's own search behavior -- fixing the Primitive's OWN check frequency (e.g. checking between candidates within enumerateWingCandidates, not just between hops) would require editing the Primitive files themselves (protected this Sprint, and every Prototype Sprint since CCR Prototype Sprint v1). Would not by itself fix layer 2 below.",
  },
  {
    name: "Budget Overrun, layer 2 of 2 -- Production's enumerateWingCandidates/bfsMoveWingToPosition have NO time check at all",
    layer: "Production",
    location:
      "fiveByFiveEdges.ts's enumerateWingCandidates() (protected this Sprint, called out separately from '기존 Primitive' in the work order's own protected-file list) calls bfsMoveWingToPosition() once per matching candidate wing inside its `for (const match of matches)` loop -- that inner loop has NO deadline check whatsoever (only `results.length >= maxResults`), and bfsMoveWingToPosition()'s own BFS loop (maxDepth<=6, MAX_TRACK_NODES=8000) checks ONLY a node-count bound (`nodesExplored > MAX_TRACK_NODES`), zero `Date.now()` calls anywhere in the function.",
    evidence:
      "Prototype Refinement Sprint v1 STEP2 (full 200-record probe): avg time between deadline checks (= one enumerateWingCandidates call, which may itself invoke multiple uninterruptible bfsMoveWingToPosition calls) 113.3ms, max single-hop time 1003.0ms, against a 40ms nominal budget -- consistent with an 8000-node BFS taking most of a second when per-node cost is ~0.1-0.15ms. Blueprint Sprint v1 STEP3 independently found the same pattern (reservedSlice: avg budget 31.3ms, avg actual 140.7ms) on a separately-drawn population, ruling out a one-off sampling fluke.",
    expectedImpactScope:
      "enumerateWingCandidates/bfsMoveWingToPosition are shared by the ENTIRE PAIR/FLIP primary pipeline (fiveByFiveEdgeExecutor.ts's own tryFixWing path), not just Incremental Recovery -- any fix here changes real production solve() timing behavior broadly, which is exactly why it is out of scope for every Sprint below the Production layer and needs its own dedicated risk analysis (see ArchitectureImpactAnalysis.ts, STEP5).",
  },
  {
    name: "Wrapper-level Budget policies cannot fully compensate for either layer above (only 31.9% overrun reduction, below the 50% target)",
    layer: "Wrapper",
    location: "solverPrimitiveIncrementalRecoveryPrototypeRefinement/BudgetRefinement.ts's allocateBudget() -- reservedSlice/strictDeadline/softDeadline/budgetAwareTraversal, all Wrapper-level deadline/node-list choices made BEFORE calling the Primitive.",
    evidence:
      "Prototype Refinement Sprint v1 STEP1 (full 200-record probe): best policy (budgetAwareTraversal, node-list truncation) reduced overrun from 80.0% to 54.5% -- a real, measured, but insufficient improvement, precisely because truncating the node list still hands each remaining hop's enumerateWingCandidates() call to a search with no internal time check.",
    expectedImpactScope: "Confined to Incremental Recovery's own call sites -- genuinely a Wrapper-only concern, but its own ceiling is capped by the two Primitive/Production-layer bottlenecks above, which is why it could not be resolved from the Wrapper alone.",
  },
  {
    name: "Visited Registry Regression (6 real regressions when skipping duplicate-state re-attempts)",
    layer: "Wrapper",
    location: "solverPrimitiveIncrementalRecoveryPrototypeRefinement/TaskLevelEvaluation.ts's runCandidateMirror() -- the useVisitedRegistry flag's binary skip rule.",
    evidence:
      "Prototype Refinement Sprint v1 STEP4 (75-snapshot subsample): Duplicate Invocation eliminated 129->0 (100%), but 6 snapshots showed a WORSE final wrongWingCount with the registry active than without -- an attempt on an 'already-seen' state still has a real, non-zero chance of independently succeeding due to the underlying search's own run-to-run timing variance (a Primitive-layer characteristic: the DFS is not deterministic run-to-run even on identical input, because its own internal deadline checks are wall-clock-based).",
    expectedImpactScope:
      "The registry POLICY itself (binary skip vs. some softer rule) is purely a Wrapper-level design choice, fully fixable without touching Production or Primitive code -- see RegistryPolicyBlueprint.ts (STEP3) for softer alternatives. Listed here because its ROOT CAUSE (why re-attempts sometimes succeed at all) traces back to the same Primitive-layer timing non-determinism as the Budget Overrun bottleneck above.",
  },
  {
    name: "Whole-Cube Floor Effect (0/75 solved, both arms, all 30 runs -- the binary metric cannot detect any real difference)",
    layer: "Wrapper",
    location: "The EVALUATION framework itself (Prototype Sprint v1's STEP4 Capability Benchmark), not the solver -- this is a measurement-methodology bottleneck, not a cube-solving one.",
    evidence:
      "Prototype Sprint v1 STEP4/7: Baseline Solved and Candidate Solved both averaged 0.00 across all 30 runs on the 75-snapshot standard subsample; paired-diff CI exactly [0.00, 0.00]. Prototype Refinement Sprint v1's own task-level metric (whole-cube-improved COUNT, not solved-COUNT) detected a real, statistically robust difference (paired-diff CI [2.51, 3.95]) on the SAME population and SAME underlying mechanism -- proving the floor effect was a metric-choice artifact, not evidence the mechanism does nothing.",
    expectedImpactScope: "Purely an Evaluation Framework concern -- fixable entirely within analysis/benchmark code, zero Production or Primitive involvement. See EvaluationBlueprintRevision.ts (STEP4).",
  },
];

export function summarizeByLayer(records: readonly BottleneckRecord[]): Record<ArchitectureLayer, number> {
  return {
    Wrapper: records.filter((r) => r.layer === "Wrapper").length,
    Primitive: records.filter((r) => r.layer === "Primitive").length,
    Production: records.filter((r) => r.layer === "Production").length,
  };
}
