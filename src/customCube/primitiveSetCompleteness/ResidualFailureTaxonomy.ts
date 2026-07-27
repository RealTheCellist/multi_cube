// --- ResidualFailureTaxonomy (Solver Primitive Set Completeness Validation
// Sprint v1, RQ-3, Required Analysis #3) -------------------------------------
// Clusters the cases where NO primitive in the current Set (BASE/FLIP/
// CASE/PARITY/CCR) succeeds even at extended budget, using only measured
// structural features (DeepCycleStructuralProfile, reused unmodified from
// Deep Cycle Resolver Validation Sprint v1) -- never a guessed label. The
// category names the Directive itself lists (Pure Cycle Isolation /
// Disconnected Components / Deep Dependency / Bridge Missing / Unknown)
// are used as bucket NAMES, but the assignment rule for each bucket is a
// disclosed, deterministic function of the measured fields below -- no
// case is placed by inspection or guess.
import type { DeepCycleStructuralProfile } from "../deepCycleResolverValidation/StructuralProfile";

export type ResidualFailureClass = "BRIDGE_MISSING" | "PURE_CYCLE_ISOLATION" | "CONFLICT_DEEP_DEPENDENCY" | "LOCKED_PAIR_NO_CYCLE" | "UNKNOWN";

export interface ResidualClassification {
  label: string;
  failureClass: ResidualFailureClass;
  profile: DeepCycleStructuralProfile;
}

// Disclosed rule, applied in this fixed order (first match wins):
//   1. BRIDGE_MISSING       -- componentCount > 1 (multiple disjoint WANTS
//      components; no single existing primitive's traversal crosses a
//      component boundary, per stateGraphBuilder.ts's own component
//      definition).
//   2. PURE_CYCLE_ISOLATION -- componentCount === 1 AND cycleCount >= 1
//      AND conflictEdgeCount === 0 (an isolated cycle, no conflicts --
//      the exact shape CCR's own Gate targets, yet still unsolved here
//      even with CCR included).
//   3. CONFLICT_DEEP_DEPENDENCY -- conflictEdgeCount > 0 (a one-sided
//      WANTS dependency chain; dependencyDepth already measures its
//      longest chain length via StructuralProfile.ts's own
//      longestConflictDagPath for exactly this case).
//   4. LOCKED_PAIR_NO_CYCLE -- swapEdgeCount > 0 AND cycleCount === 0 AND
//      conflictEdgeCount === 0 (a bare mutual-lock/2-cycle with nothing
//      else structurally going on).
//   5. UNKNOWN -- none of the above measured conditions hold.
export function classifyResidual(profile: DeepCycleStructuralProfile): ResidualFailureClass {
  if (profile.componentCount > 1) return "BRIDGE_MISSING";
  if (profile.cycleCount >= 1 && profile.conflictEdgeCount === 0) return "PURE_CYCLE_ISOLATION";
  if (profile.conflictEdgeCount > 0) return "CONFLICT_DEEP_DEPENDENCY";
  if (profile.swapEdgeCount > 0 && profile.cycleCount === 0) return "LOCKED_PAIR_NO_CYCLE";
  return "UNKNOWN";
}

export function classifyAllResiduals(residualProfiles: DeepCycleStructuralProfile[]): ResidualClassification[] {
  return residualProfiles.map((profile) => ({ label: profile.label, failureClass: classifyResidual(profile), profile }));
}

export interface ResidualClassSummary {
  failureClass: ResidualFailureClass;
  n: number;
  avgCycleLength: number;
  avgComponentCount: number;
  avgConflictEdgeCount: number;
  avgDependencyDepth: number;
  avgBranchingFactor: number;
  parityRate: number;
  labels: string[];
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeResidualClasses(classified: ResidualClassification[]): ResidualClassSummary[] {
  const classes: ResidualFailureClass[] = ["BRIDGE_MISSING", "PURE_CYCLE_ISOLATION", "CONFLICT_DEEP_DEPENDENCY", "LOCKED_PAIR_NO_CYCLE", "UNKNOWN"];
  return classes
    .map((failureClass) => {
      const members = classified.filter((c) => c.failureClass === failureClass);
      return {
        failureClass,
        n: members.length,
        avgCycleLength: avg(members.map((m) => m.profile.cycleLength)),
        avgComponentCount: avg(members.map((m) => m.profile.componentCount)),
        avgConflictEdgeCount: avg(members.map((m) => m.profile.conflictEdgeCount)),
        avgDependencyDepth: avg(members.map((m) => m.profile.dependencyDepth)),
        avgBranchingFactor: avg(members.map((m) => m.profile.branchingFactor)),
        parityRate: members.length ? members.filter((m) => m.profile.hasParity).length / members.length : 0,
        labels: members.map((m) => m.label),
      };
    })
    .filter((s) => s.n > 0);
}
