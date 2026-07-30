// --- StructuralFeatureExtractionV4 (Solver Primitive Discovery Sprint #4
// -- State Taxonomy Sprint v1, STEP3) -----------------------------------------
// Extracts the Directive's own feature list for each Completely-Unknown
// Hole. Reuses two existing, unmodified building blocks rather than
// recomputing the underlying WANTS-graph analysis from scratch:
//   recoveryNecessity/StructuralFeatures.ts's computeStructuralFeatures()
//     -> cycleCount, cycleLength, pairCount, wrongWingCount, swapEdgeCount,
//        conflictEdgeCount, componentCount, hasParity
//   mechanismAnalysis/CaseTaxonomyClassifier.ts's classifyCaseFeatures()
//     -> taxonomyClass (Manual Taxonomy axis for STEP4), mutualLockCount
//
// New features this Sprint adds (Directive's own "새로운 Feature가
// 발견되면 추가한다" invitation), each a disclosed, explicit formula --
// not silently invented:
//   bridgeCount        = max(0, componentCount - 1) -- number of WANTS-graph
//                        components beyond the first; the precedent
//                        (CycleIsolationSubtypes.ts's "BRIDGE_MISSING") only
//                        ever used a boolean (componentCount>1), this
//                        generalizes it to a count.
//   disconnectedGraph  = componentCount > 1 (exact reuse of the existing
//                        "Bridge Missing" boolean precedent, named to match
//                        the Directive's own term).
//   deferredViolation  = cycleCount > 0 AND cycleLength < MIN_CYCLE_LENGTH(4)
//                        -- a cycle shape that exists but falls below BP-1's
//                        own MIN_CYCLE_LENGTH gate (solverV2Prototype/
//                        BoundedResolver.ts), i.e. a structure only a
//                        deferred (end-of-path) validation style search
//                        could resolve, since BP-1's own gate structurally
//                        excludes it from ever being attempted.
import type { HoleCaseV4 } from "./HoleCollectionV4";
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { classifyCaseFeatures } from "../mechanismAnalysis/CaseTaxonomyClassifier";
import type { TaxonomyClass } from "../stateTaxonomy/TaxonomyMapper";

export const MIN_CYCLE_LENGTH = 4; // BP-1's own gate (solverV2Prototype/BoundedResolver.ts), cited not redefined

export interface StructuralFeatureSetV4 {
  label: string;
  wrongWingCount: number;
  pairCount: number;
  cycleCount: number;
  cycleLength: number;
  componentCount: number;
  conflictEdgeCount: number;
  swapEdgeCount: number;
  mutualLockCount: number;
  bridgeCount: number;
  disconnectedGraph: boolean;
  parityState: boolean;
  deferredViolation: boolean;
  taxonomyClass: TaxonomyClass; // Manual Taxonomy axis, reused unmodified for STEP4's 3-way clustering comparison
}

export function extractFeatures(hole: HoleCaseV4): StructuralFeatureSetV4 {
  const base = computeStructuralFeatures(hole.cubies, hole.label);
  const caseFeatures = classifyCaseFeatures(hole.cubies, hole.label);
  const bridgeCount = Math.max(0, base.componentCount - 1);
  const disconnectedGraph = base.componentCount > 1;
  const deferredViolation = base.cycleCount > 0 && base.cycleLength < MIN_CYCLE_LENGTH;

  return {
    label: hole.label,
    wrongWingCount: base.wrongWingCount,
    pairCount: base.pairCount,
    cycleCount: base.cycleCount,
    cycleLength: base.cycleLength,
    componentCount: base.componentCount,
    conflictEdgeCount: base.conflictEdgeCount,
    swapEdgeCount: base.swapEdgeCount,
    mutualLockCount: caseFeatures.mutualLockCount,
    bridgeCount,
    disconnectedGraph,
    parityState: base.hasParity,
    deferredViolation,
    taxonomyClass: caseFeatures.taxonomyClass,
  };
}

export function extractAllFeatures(holes: readonly HoleCaseV4[]): StructuralFeatureSetV4[] {
  return holes.map(extractFeatures);
}
