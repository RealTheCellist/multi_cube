// --- RefinementComparison (Solver Primitive Prototype Refinement Sprint
// v1) -- STEP3/STEP4: runs every Strategy A (Gate Expansion) and Strategy
// B (Success Optimization) variant -- plus the v3 baseline itself
// (A0/B0, behaviorally identical, included as a built-in cross-check
// between the two independent reimplementations) -- on the SAME
// 150-replay Dataset and the SAME existing-Gap definition
// (testAllAllowedSingleShot, unmodified), producing one directly
// comparable metrics table. Also provides runCombinedVariant, used only
// when STEP4 finds real signal in BOTH strategies individually, to
// measure whether combining the winning Gate with the winning Search
// Options compounds or cancels out.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import { GATE_VARIANTS, runGateVariant, type GateVariant } from "./GateExpansionVariants";
import { SUCCESS_VARIANTS, runSuccessVariant, runParametrizedSearch, type SearchOptions } from "./SuccessOptimizationVariants";
import { evaluateVariant, computeGapClassification, type VariantMetrics } from "./VariantEvaluation";

export interface RefinementComparisonResult {
  gateMetrics: VariantMetrics[];
  successMetrics: VariantMetrics[];
  baselineSuccessHashes: ReadonlySet<string>;
  baselineVsSuccessB0Consistent: boolean; // sanity check: two independent reimplementations of the same behavior should agree
  gapClassification: ReadonlyMap<string, boolean>; // shared ground truth -- reused by the driver's STEP4 combined-variant evaluation too, never recomputed
}

export function runRefinementComparison(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number): RefinementComparisonResult {
  // Computed ONCE and shared by every variant below -- see
  // VariantEvaluation.ts's own disclosure on why calling this fresh per
  // variant would make GapRescue comparisons partly noise from BASE's own
  // Math.random()-seeded search rather than a real capability difference.
  const gapClassification = computeGapClassification(snapshots, libs);

  const a0 = GATE_VARIANTS[0];
  const { metrics: a0RawMetrics, successHashes: baselineSuccessHashes } = evaluateVariant(
    a0.name,
    snapshots,
    gapClassification,
    new Set(),
    (cubies, deadline) => {
      const r = runGateVariant(cubies, lib, deadline, a0);
      return { matched: r.matched, moves: r.moves };
    },
    deadlineMs,
  );
  // A0 compared against itself always has Recall=1.0 -- a sanity value, not a real comparison.
  const gateMetrics: VariantMetrics[] = [{ ...a0RawMetrics, recall: 1.0 }];

  for (const variant of GATE_VARIANTS.slice(1)) {
    const { metrics } = evaluateVariant(
      variant.name,
      snapshots,
      gapClassification,
      baselineSuccessHashes,
      (cubies, deadline) => {
        const r = runGateVariant(cubies, lib, deadline, variant);
        return { matched: r.matched, moves: r.moves };
      },
      deadlineMs,
    );
    gateMetrics.push({ ...metrics, isCoarseningBoundary: !!variant.isCoarseningBoundary });
  }

  const successMetrics: VariantMetrics[] = [];
  for (const variant of SUCCESS_VARIANTS) {
    const { metrics } = evaluateVariant(
      variant.name,
      snapshots,
      gapClassification,
      baselineSuccessHashes,
      (cubies, deadline) => {
        const r = runSuccessVariant(cubies, lib, deadline, variant);
        return { matched: r.matched, moves: r.moves };
      },
      deadlineMs,
    );
    successMetrics.push(metrics);
  }

  const b0 = successMetrics[0];
  const baselineVsSuccessB0Consistent = b0.matchedCount === gateMetrics[0].matchedCount && b0.successCount === gateMetrics[0].successCount && b0.regressionCount === gateMetrics[0].regressionCount;

  return { gateMetrics, successMetrics, baselineSuccessHashes, baselineVsSuccessB0Consistent, gapClassification };
}

export function runCombinedVariant(cubies: Cubie[], lib: WingLibrary, deadline: number, gate: GateVariant, options: SearchOptions): { matched: boolean; moves: ReturnType<typeof runParametrizedSearch>["moves"] } {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null };
  const conflictEdgeCount = countConflictEdges(cubies);
  if (!gate.matches(analysis.cycleLength, conflictEdgeCount)) return { matched: false, moves: null };

  const result = runParametrizedSearch(cubies, analysis.cycleNodes, lib, deadline, options);
  return { matched: true, moves: result.moves };
}

export { evaluateVariant };
export type { FailureSnapshot };
