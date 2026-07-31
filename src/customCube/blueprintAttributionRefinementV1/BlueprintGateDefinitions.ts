// --- BlueprintGateDefinitions (Solver Primitive Discovery Sprint #4 --
// Blueprint Attribution Refinement Sprint v1, STEP2/3 shared) ----------------
// Decomposes each existing Blueprint's combined precondition (originally
// defined as a single predicate in solverPrimitiveDiscovery4/
// BlueprintMappingV4.ts) into its NAMED ATOMIC conditions, so each gate can
// be individually ablated (STEP3's "Blueprint A의 Gate를 제거하면?").
// Every atomic condition here is a straight decomposition of that file's
// own BLUEPRINT_PRECONDITIONS -- same logic, same thresholds, cited not
// re-derived. BlueprintMappingV4.ts itself is not modified (Discovery
// Sprint #4's own code stays read-only).
import type { StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";

export interface AtomicCondition {
  name: string;
  test: (f: StructuralFeatureSetV4) => boolean;
}

export interface BlueprintGateSpec {
  name: string;
  conditions: AtomicCondition[];
}

export const BLUEPRINT_GATES: BlueprintGateSpec[] = [
  {
    name: "Deep Cycle (BP-1/REPAIR)",
    conditions: [
      { name: "cycleCount>0", test: (f) => f.cycleCount > 0 },
      { name: "cycleLength>=4", test: (f) => f.cycleLength >= 4 },
      { name: "componentCount===1", test: (f) => f.componentCount === 1 },
      { name: "conflictEdgeCount===0", test: (f) => f.conflictEdgeCount === 0 },
    ],
  },
  {
    name: "CCR",
    conditions: [
      { name: "componentCount===1", test: (f) => f.componentCount === 1 },
      { name: "conflictEdgeCount===0", test: (f) => f.conflictEdgeCount === 0 },
      { name: "cycleCount===1", test: (f) => f.cycleCount === 1 },
      { name: "cycleLength in [4,6]", test: (f) => f.cycleLength >= 4 && f.cycleLength <= 6 },
    ],
  },
  {
    name: "Multi-Hop Bridge",
    conditions: [
      { name: "componentCount===1", test: (f) => f.componentCount === 1 },
      { name: "conflictEdgeCount===0", test: (f) => f.conflictEdgeCount === 0 },
      { name: "deferredViolation", test: (f) => f.deferredViolation },
    ],
  },
  {
    name: "Bridge Injection",
    conditions: [{ name: "disconnectedGraph", test: (f) => f.disconnectedGraph }],
  },
  {
    name: "Conflict-Breaking Sacrifice",
    conditions: [
      { name: "conflictEdgeCount>0", test: (f) => f.conflictEdgeCount > 0 },
      { name: "cycleCount===0", test: (f) => f.cycleCount === 0 },
    ],
  },
  {
    name: "Parity-Cycle Specialist (BP-2)",
    conditions: [
      { name: "parityState", test: (f) => f.parityState },
      { name: "cycleCount>0", test: (f) => f.cycleCount > 0 },
    ],
  },
];

export function evaluateFullPrecondition(gate: BlueprintGateSpec, f: StructuralFeatureSetV4): boolean {
  return gate.conditions.every((c) => c.test(f));
}

// Precondition with ONE named condition removed (ablated -- treated as
// always-true), matching the Directive's own "Gate를 제거하면?" language.
export function evaluateAblatedPrecondition(gate: BlueprintGateSpec, ablatedConditionName: string, f: StructuralFeatureSetV4): boolean {
  return gate.conditions.every((c) => c.name === ablatedConditionName || c.test(f));
}
