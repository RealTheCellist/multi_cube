// --- ExistingPrimitiveProjection (Solver Primitive Discovery Sprint #6
// -- Parity-Gated Cycle Blueprint Sprint v1, STEP3) --------------------------
// Directive: "실제 solve()는 호출하지 않는다. 구조만 비교한다." Reuses
// blueprintAttributionRefinementV1/BlueprintGateDefinitions.ts's own
// BLUEPRINT_GATES + evaluateFullPrecondition (unmodified) -- already a
// pure structural-predicate decomposition of each Primitive's real Gate,
// with no solve() call anywhere in that file either. Adds ONE additional
// spec for Mixed Commutator (not covered by the original 6-Blueprint
// roster, built later in this arc) here, disclosed as a direct citation of
// its own real Gate: moveRepresentationPrototype/AdaptiveCycleDetection.ts's
// detectAdaptiveCycle() is just analyzeMultiCycle() !== null -- i.e.
// cycleCount>0, no length/component/conflict restriction at all (its real
// differentiator is its search core, not its Gate).
import { BLUEPRINT_GATES, evaluateFullPrecondition, type BlueprintGateSpec } from "../blueprintAttributionRefinementV1/BlueprintGateDefinitions";
import type { StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { UnknownCase } from "./UnknownPopulationProfiling";

const MIXED_COMMUTATOR_GATE: BlueprintGateSpec = {
  name: "Mixed Commutator",
  conditions: [{ name: "cycleCount>0", test: (f: StructuralFeatureSetV4) => f.cycleCount > 0 }],
};

export const ALL_PRIMITIVE_GATES: BlueprintGateSpec[] = [...BLUEPRINT_GATES, MIXED_COMMUTATOR_GATE];

export interface ProjectionResult {
  primitiveName: string;
  structurallyEligibleCount: number; // how many of the Unknown population would even pass this Primitive's own declared Gate, structurally
  structurallyEligibleFraction: number;
  failingConditions: Record<string, number>; // per atomic condition, how many Unknown cases fail it
}

export function projectExistingPrimitives(unknownCases: readonly UnknownCase[]): ProjectionResult[] {
  return ALL_PRIMITIVE_GATES.map((gate) => {
    let eligible = 0;
    const failingConditions: Record<string, number> = {};
    for (const c of gate.conditions) failingConditions[c.name] = 0;

    for (const uc of unknownCases) {
      const f = uc.features;
      let allPass = true;
      for (const c of gate.conditions) {
        if (!c.test(f)) {
          failingConditions[c.name]++;
          allPass = false;
        }
      }
      if (allPass) eligible++;
    }

    return {
      primitiveName: gate.name,
      structurallyEligibleCount: eligible,
      structurallyEligibleFraction: unknownCases.length ? eligible / unknownCases.length : 0,
      failingConditions,
    };
  });
}
