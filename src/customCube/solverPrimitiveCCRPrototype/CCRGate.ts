// --- CCRGate (CCR Prototype Sprint v1) -------------------------------------
// STEP2. The Blueprint's own Gate, applied VERBATIM -- no relaxation, no
// coarsening this Sprint: `cycleLength(cubies) in [5,6] AND
// conflictEdgeCount(cubies) === 0`. Reuses analyzeMultiCycle (for the
// primary/longest cycle) and countConflictEdges (both EXISTING exports,
// unmodified) exactly like every Gate check in this research arc. Also
// exposes the FULL disjoint-cycle list (buildStateGraph's own `cycles`,
// unmodified) for STEP4's multi-cycle strategy, which needs every cycle,
// not just the longest.
import type { Cubie } from "../cubeState";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

export const CCR_MIN_CYCLE_LENGTH = 5;
export const CCR_MAX_CYCLE_LENGTH = 6;

export interface CCRGateAnalysis {
  eligible: boolean;
  primaryCycleLength: number;
  primaryCycleNodes: string[];
  conflictEdgeCount: number;
  allCycles: string[][]; // every disjoint cycle in the WANTS graph, longest first
}

export function analyzeCcrGate(cubies: Cubie[]): CCRGateAnalysis {
  const analysis = analyzeMultiCycle(cubies);
  const conflictEdgeCount = countConflictEdges(cubies);
  const primaryCycleLength = analysis?.cycleLength ?? 0;
  const primaryCycleNodes = analysis?.cycleNodes ?? [];
  const allCycles = [...buildStateGraph(cubies).cycles].sort((a, b) => b.length - a.length);

  const eligible = primaryCycleLength >= CCR_MIN_CYCLE_LENGTH && primaryCycleLength <= CCR_MAX_CYCLE_LENGTH && conflictEdgeCount === 0;

  return { eligible, primaryCycleLength, primaryCycleNodes, conflictEdgeCount, allCycles };
}

export function isCcrEligible(cubies: Cubie[]): boolean {
  return analyzeCcrGate(cubies).eligible;
}
