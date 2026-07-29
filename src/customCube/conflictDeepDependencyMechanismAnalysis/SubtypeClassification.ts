// --- SubtypeClassification (CONFLICT_DEEP_DEPENDENCY Structural Mechanism
// Analysis Sprint v1, RQ-1/RQ-5, Deliverable #3) -----------------------------
// Disclosed, deterministic rule-based classification (no ML, no guessing --
// this arc's own established convention) over ConflictGraphFeatures' new
// dependencyComponentCount/dependencyBranching fields, applied in this
// fixed order (first match wins):
//   1. MULTI_COMPONENT_DEPENDENCY -- dependencyComponentCount > 1 (more than
//      one disjoint CONFLICT-only dependency chain coexists in the state).
//   2. BRANCHING_DEPENDENCY       -- dependencyComponentCount === 1 AND
//      dependencyBranching > 1 (a single connected dependency structure,
//      but at least one node has more than one outgoing CONFLICT edge --
//      a tree/DAG shape, not a simple chain).
//   3. LINEAR_CHAIN               -- dependencyComponentCount === 1 AND
//      dependencyBranching <= 1 (a single simple chain, at most 1 outgoing
//      CONFLICT edge per node).
import type { ConflictGraphFeatures } from "./ConflictGraphFeatures";

export type ConflictSubtype = "LINEAR_CHAIN" | "BRANCHING_DEPENDENCY" | "MULTI_COMPONENT_DEPENDENCY";

export function classifySubtype(features: ConflictGraphFeatures): ConflictSubtype {
  if (features.dependencyComponentCount > 1) return "MULTI_COMPONENT_DEPENDENCY";
  if (features.dependencyBranching > 1) return "BRANCHING_DEPENDENCY";
  return "LINEAR_CHAIN";
}

export interface SubtypeClassificationRow {
  label: string;
  subtype: ConflictSubtype;
  features: ConflictGraphFeatures;
}

export function classifyAllSubtypes(featuresList: readonly ConflictGraphFeatures[]): SubtypeClassificationRow[] {
  return featuresList.map((features) => ({ label: features.label, subtype: classifySubtype(features), features }));
}

export interface SubtypeSummary {
  subtype: ConflictSubtype;
  n: number;
  avgDependencyDepth: number;
  avgConflictEdgeCount: number;
  avgDependencyBranching: number;
  avgDependencyComponentCount: number;
  avgBridgeCount: number;
  avgSharedConflictCount: number;
  avgProtectedEdgeCount: number;
  avgWrongWingCount: number;
  labels: string[];
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeSubtypes(rows: readonly SubtypeClassificationRow[]): SubtypeSummary[] {
  const subtypes: ConflictSubtype[] = ["LINEAR_CHAIN", "BRANCHING_DEPENDENCY", "MULTI_COMPONENT_DEPENDENCY"];
  return subtypes
    .map((subtype) => {
      const members = rows.filter((r) => r.subtype === subtype);
      return {
        subtype,
        n: members.length,
        avgDependencyDepth: avg(members.map((m) => m.features.dependencyDepth)),
        avgConflictEdgeCount: avg(members.map((m) => m.features.conflictEdgeCount)),
        avgDependencyBranching: avg(members.map((m) => m.features.dependencyBranching)),
        avgDependencyComponentCount: avg(members.map((m) => m.features.dependencyComponentCount)),
        avgBridgeCount: avg(members.map((m) => m.features.bridgeCount)),
        avgSharedConflictCount: avg(members.map((m) => m.features.sharedConflictCount)),
        avgProtectedEdgeCount: avg(members.map((m) => m.features.protectedEdgeCount)),
        avgWrongWingCount: avg(members.map((m) => m.features.wrongWingCount)),
        labels: members.map((m) => m.label),
      };
    })
    .filter((s) => s.n > 0);
}

/** RQ-5: is there a clean separation (each Subtype non-trivial in size, and
 * together they partition the whole population) vs one Subtype swallowing
 * everything (effectively no real Subtype distinction)? Disclosed rule:
 * "clearly separated" iff at least 2 Subtypes have n>=2 members each. */
export function hasCleanSubtypeSeparation(summaries: readonly SubtypeSummary[]): boolean {
  return summaries.filter((s) => s.n >= 2).length >= 2;
}
