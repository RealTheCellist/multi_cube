// --- VariantEvaluation (Solver Primitive Prototype Refinement Sprint v1) -
// Shared metric computation for BOTH Strategy A (Gate Expansion) and
// Strategy B (Success Optimization) variants -- Coverage/Precision/
// Recall/Gap Rescue/Regression/Cost, all measured the same way
// PrototypeBenchmark.ts (Prototype Sprint v2) and RegressionAnalysis.ts
// (Prototype Sprint v3) already established for this series, so results
// stay directly comparable across Sprints.
//
// Recall is NOT the classifier-style "predicted success / all real
// successes" from Blueprint Sprint v2's CoveragePrecisionRecallAnalysis.ts
// -- that definition assumed a single FIXED underlying primitive being
// classified by different preconditions. Here each variant IS a
// different primitive (different gate width or different search
// behavior), so there is no single fixed ground truth to classify
// against. Instead: Recall = what fraction of the v3 BASELINE's own
// known successes (a fixed reference set, computed once) this variant
// still succeeds on. This directly answers what STEP3 needs: does a
// wider/optimized variant keep baseline's existing wins while gaining
// new ones, or does it trade them away?
import { cloneCubies } from "../cubeState";
import type { Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

export interface VariantRunOutput {
  matched: boolean;
  moves: Move[] | null;
}

function existingPrimitivesAllFail(cubies: ReturnType<typeof deserializeCube>, libs: ExecutorLibraries): boolean {
  const success = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
  return (Object.keys(success) as AllowedPrimitive[]).every((p) => !success[p]);
}

// testAllAllowedSingleShot calls BASE, whose own search is disclosed
// Math.random()-seeded (per this project's repeated prior findings --
// CapabilityMatrix.ts's own comment, HardGapReclassifier's 3-run
// averaging, ClusterStabilityReview's 5-run averaging). Calling
// existingPrimitivesAllFail freshly inside EACH variant's own evaluation
// loop would therefore classify "is this replay a Gap" independently --
// and inconsistently -- per variant, making GapRescue comparisons
// between variants partly noise from a shifting ground truth rather than
// a real capability difference. computeGapClassification runs this
// classification ONCE per Sprint run and the result is shared by every
// variant evaluated in that run, so GapRescue differences between
// variants reflect the variants themselves, not BASE's own randomness.
export function computeGapClassification(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): Map<string, boolean> {
  const classification = new Map<string, boolean>();
  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    classification.set(s.hash, existingPrimitivesAllFail(cubies, libs));
  }
  return classification;
}

export interface VariantMetrics {
  variantName: string;
  totalReplays: number;
  matchedCount: number;
  coverage: number; // matchedCount / totalReplays
  successCount: number; // matched AND net wrongWingCount improvement
  precision: number; // successCount / matchedCount
  recall: number; // |this variant's successes ∩ referenceSuccessHashes| / |referenceSuccessHashes|
  gapRescueCount: number; // successCount AND all 5 existing Primitives already failed
  gapTotal: number;
  regressionCount: number; // matched, accepted a move, but wrongWingCount increased (should never happen)
  avgTimeMs: number;
  // Set by the caller (RefinementComparison.ts), not computed here -- true
  // for a variant that gains Coverage/GapRescue only by DROPPING the
  // Blueprint's own validated precondition (a strict-superset widening,
  // see GateExpansionVariants.ts's own disclosure on A2). Reported like
  // any other variant, but RefinementDecision.ts excludes it from winning.
  isCoarseningBoundary: boolean;
}

export function evaluateVariant(
  variantName: string,
  snapshots: readonly FailureSnapshot[],
  gapClassification: ReadonlyMap<string, boolean>,
  referenceSuccessHashes: ReadonlySet<string>,
  runFn: (cubies: Cubie[], deadline: number) => VariantRunOutput,
  deadlineMs: number,
): { metrics: VariantMetrics; successHashes: Set<string> } {
  let matchedCount = 0;
  let successCount = 0;
  let regressionCount = 0;
  let gapRescueCount = 0;
  let gapTotal = 0;
  let totalTimeMs = 0;
  const successHashes = new Set<string>();

  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const wasExistingGap = gapClassification.get(s.hash) ?? false;
    if (wasExistingGap) gapTotal++;

    const start = Date.now();
    const output = runFn(cubies, Date.now() + deadlineMs);
    totalTimeMs += Date.now() - start;

    if (!output.matched) continue;
    matchedCount++;
    if (!output.moves) continue;

    const clone = cloneCubies(cubies);
    applySeq(clone, output.moves);
    const wrongWingAfter = wrongWingCount5(clone);

    if (wrongWingAfter > wrongWingBefore) {
      regressionCount++;
      continue;
    }
    if (wrongWingAfter < wrongWingBefore) {
      successCount++;
      successHashes.add(s.hash);
      if (wasExistingGap) gapRescueCount++;
    }
  }

  let intersect = 0;
  for (const h of referenceSuccessHashes) if (successHashes.has(h)) intersect++;

  return {
    metrics: {
      variantName,
      totalReplays: snapshots.length,
      matchedCount,
      coverage: snapshots.length ? matchedCount / snapshots.length : 0,
      successCount,
      precision: matchedCount ? successCount / matchedCount : 0,
      recall: referenceSuccessHashes.size ? intersect / referenceSuccessHashes.size : 0,
      gapRescueCount,
      gapTotal,
      regressionCount,
      avgTimeMs: snapshots.length ? totalTimeMs / snapshots.length : 0,
      isCoarseningBoundary: false, // default; RefinementComparison.ts overrides for flagged Gate variants
    },
    successHashes,
  };
}
