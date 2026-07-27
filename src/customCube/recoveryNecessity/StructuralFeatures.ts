// --- StructuralFeatures (Recovery Necessity Validation Sprint v1, STEP2)
// -------------------------------------------------------------------------
// Maps the Directive's requested feature list onto this codebase's
// existing, unmodified structural analysis (buildStateGraph/
// analyzeConstraints, already reused across State Taxonomy Sprint v2).
// Mapping disclosed explicitly rather than assumed:
//   cycleCount           <- ConstraintStats.cycleCount
//   cycleLength           <- ConstraintStats.longestCycleLength (exact, not bucketed)
//   pairCount             <- count of "SolvedPair" WingNodes (already-paired slots)
//   wrongWingCount        <- wrongWingCount5(cubies) (production's own ground-truth wrong-wing count)
//   swapEdgeCount         <- count of StateGraph edges with type "SWAP" (2-cycle mutual locks)
//   conflictEdgeCount     <- ConstraintStats.conflictCount
//   remainingWrongEdges   <- same value as wrongWingCount (this codebase's "wing"/"edge" terminology
//                            is used interchangeably throughout -- e.g. "wing-pairing" IS "edge-pairing";
//                            no separate edge-level count exists distinct from wrongWingCount5)
import type { Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { wrongWingCount5 } from "../fiveByFiveEdges";

export interface RecoveryNecessityFeatures {
  label: string;
  hasParity: boolean;
  cycleCount: number;
  cycleLength: number;
  pairCount: number;
  wrongWingCount: number;
  swapEdgeCount: number;
  conflictEdgeCount: number;
  remainingWrongEdges: number;
  componentCount: number; // carried over from State Taxonomy v2's Bridge Missing check, kept for cross-reference
}

export function computeStructuralFeatures(cubies: Cubie[], label: string): RecoveryNecessityFeatures {
  const graph = buildStateGraph(cubies);
  const stats = analyzeConstraints(graph);
  const pairCount = graph.nodes.filter((n) => n.type === "SolvedPair").length;
  const swapEdgeCount = graph.edges.filter((e) => e.type === "SWAP").length;
  const wrongWingCount = wrongWingCount5(cubies);

  return {
    label,
    hasParity: hasParity(cubies),
    cycleCount: stats.cycleCount,
    cycleLength: stats.longestCycleLength,
    pairCount,
    wrongWingCount,
    swapEdgeCount,
    conflictEdgeCount: stats.conflictCount,
    remainingWrongEdges: wrongWingCount,
    componentCount: stats.componentCount,
  };
}
