// --- ExistingPrimitiveComparison (Parity-Gated Cycle Prototype Sprint v1,
// STEP5) --------------------------------------------------------------------
// Directive: "기존 Primitive(BP-1, CCR, Mixed Commutator, Multi-Hop
// Bridge)와 비교." Reuses unresolvedMechanismValidationV1/
// PrimitiveRegistry.ts's PRIMITIVE_REGISTRY (unmodified) -- the same 6-real-
// Primitive wrapper this whole arc's Discovery Sprint #5 already built and
// validated. Only 4 of its 6 entries are named by this Sprint's own
// Directive; ConflictBreakingSacrifice and ParityCycleSpecialist(BP-2) are
// deliberately excluded from this specific comparison set, matching the
// Directive's own explicit roster.
//
// Disclosed measurement note: PRIMITIVE_REGISTRY's wrapper functions return
// only `Move[] | null` -- they do not expose their own internal Gate-match
// flag the way this Sprint's own tryCrossComponentBridgeCycleResolver does.
// `gateMatched` below is therefore approximated as `moves !== null` (a
// Primitive that internally decided "not applicable" and one that matched
// its Gate but then failed Deferred Validation both collapse to the same
// observable `null` from outside) -- disclosed, not silently assumed.
import type { WingLibrary } from "../fiveByFiveEdges";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { PRIMITIVE_REGISTRY, type PrimitiveName } from "../unresolvedMechanismValidationV1/PrimitiveRegistry";
import { evaluatePopulation, summarizeOutcomes, type CaseOutcome, type EvaluationSummary } from "./CapabilityMeasurement";

export const COMPARISON_PRIMITIVES: PrimitiveName[] = ["DeepCycle(BP-1)", "CCR", "MixedCommutator", "MultiHopBridge"];

export interface ExistingPrimitiveComparisonResult {
  name: PrimitiveName;
  outcomes: CaseOutcome[];
  summary: EvaluationSummary;
}

export function runExistingPrimitiveComparison(cases: readonly UnknownCase[], lib: WingLibrary, deadlineMs: number): ExistingPrimitiveComparisonResult[] {
  return COMPARISON_PRIMITIVES.map((name) => {
    const fn = PRIMITIVE_REGISTRY[name];
    const outcomes = evaluatePopulation(cases, lib, deadlineMs, (cubies, l, deadline) => {
      const moves = fn(cubies, l, deadline);
      return { gateMatched: moves !== null, moves, leavesExplored: 0 };
    });
    const summary = summarizeOutcomes(name, outcomes);
    return { name, outcomes, summary };
  });
}
