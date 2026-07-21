// --- StructuralRepresentation (Primitive Discovery Sprint #2) --------------
// The "Representation" the user asked failures to be clustered by, one
// level richer than failureAnalysis/failureCluster.ts's own wrongWing+
// parity-only key: adds the SAME structural features REPAIR's own Gate
// was built on (analyzeMultiCycle's cycleLength, countConflictEdges),
// plus distinct-cycle-count from the underlying WANTS graph -- all reused
// UNMODIFIED from Solver Primitive Research Closeout Sprint v1's own
// "KEEP" list (solverV2Prototype/MultiCycleAnalyzer.ts,
// solverPrimitivePrototype/MultiHopBridgePrototypeV3.ts,
// capabilityAnalysis/stateGraphBuilder.ts). No new structural analysis
// algorithm -- only a new combination of already-validated features.
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";

export interface StructuralFeatures {
  hash: string;
  wrongWingCount: number;
  parity: boolean;
  cycleLength: number; // longest WANTS-graph cycle; 0 if none found
  cycleCount: number; // distinct cycles in the WANTS graph
  conflictEdgeCount: number;
  gateEligible: boolean; // cycleLength 2~4 AND conflictEdgeCount>0 -- REPAIR's own Gate, reused verbatim as a reference column
}

export function computeStructuralFeatures(snapshot: FailureSnapshot): StructuralFeatures {
  const cubies = deserializeCube(snapshot.cubeState);
  const graph = buildStateGraph(cubies);
  const cycle = analyzeMultiCycle(cubies);
  const conflictEdgeCount = countConflictEdges(cubies);
  const cycleLength = cycle?.cycleLength ?? 0;
  return {
    hash: snapshot.hash,
    wrongWingCount: snapshot.wrongWingCount,
    parity: snapshot.parity,
    cycleLength,
    cycleCount: graph.cycles.length,
    conflictEdgeCount,
    gateEligible: cycleLength >= 2 && cycleLength <= 4 && conflictEdgeCount > 0,
  };
}

export function computeAllStructuralFeatures(snapshots: readonly FailureSnapshot[]): StructuralFeatures[] {
  return snapshots.map(computeStructuralFeatures);
}
