// --- ResidualFeatureSetV2 (Solver Primitive Set Completeness Validation
// Sprint v2, Measurement requirement: "wrongWingCount, pairCount, cycleCount,
// cycleLength, componentCount, conflictEdgeCount, swapEdgeCount,
// cycleEdgeCount, solvedByRecovery, recoveryType, recoveryAttempts") --------
// Extends Deep Cycle Resolver Validation Sprint v1's own
// computeDeepCycleStructuralProfile (reused UNMODIFIED -- read-only import,
// not touched by this Sprint) with exactly the 2 extra structural fields
// the new Directive requires that profile doesn't already carry
// (pairCount, cycleEdgeCount). Both are cheap derived reads off existing,
// unmodified production/research functions -- no new structural analysis
// logic, no Production file touched:
//   - pairCount: reuses goalPlanner/GoalAnalyzer.ts's own pairCountOf(),
//     already used throughout this arc's Goal/Policy Planner Sprints.
//   - cycleEdgeCount: counts StateGraph edges of type "CYCLE", the exact
//     same pattern StructuralProfile.ts itself already uses one line away
//     for its own swapEdgeCount (`edges.filter(e => e.type === "SWAP")`).
// The Recovery-side 3 fields (solvedByRecovery/recoveryType/recoveryAttempts)
// are NOT computed here -- they come from RecoveryAttemptProbe.ts, since
// they require an actual repeated Recovery-layer invocation, not a static
// structural read.
import type { Cubie } from "../cubeState";
import { computeDeepCycleStructuralProfile, type DeepCycleStructuralProfile } from "../deepCycleResolverValidation/StructuralProfile";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import type { WingLibrary } from "../fiveByFiveEdges";

export interface ResidualFeatureSetV2 extends DeepCycleStructuralProfile {
  pairCount: number;
  cycleEdgeCount: number;
}

export function computeResidualFeatureSetV2(cubies: Cubie[], label: string, lib: WingLibrary): ResidualFeatureSetV2 {
  const profile = computeDeepCycleStructuralProfile(cubies, label, lib);
  const graph = buildStateGraph(cubies);
  const cycleEdgeCount = graph.edges.filter((e) => e.type === "CYCLE").length;
  const pairCount = pairCountOf(cubies);
  return { ...profile, pairCount, cycleEdgeCount };
}
