// --- CoarseShapeSelector (Solver v3 Primitive Prototype Sprint v1 / BP-5) -
// STEP1: makes Research Kickoff's Coarse Structural Shape (STEP2 of that
// Sprint, `solverV3Research/StateRepresentationCandidates.ts`, existing/
// unmodified/read-only here) usable inside this Prototype. The exact Shape
// Key string is reused directly (imported, not reimplemented). That module
// does not separately export the individual bucketed fields the Sparse
// Wrongness Detector (STEP2) needs to threshold on, so this file
// reconstructs those fields using the SAME bucketing formulas (bucket3,
// capAt) already established and disclosed there -- a disclosed
// duplication of an existing, unmodified technique, not a new one.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";

export interface CoarseShapeProfile {
  shapeKey: string; // identical to solverV3Research's own computeCoarseShapeKey() output
  wrongWingCount: number;
  wrongWingBucket: number; // floor(wrongWingCount / 3)
  pairCount: number;
  pairBucket: number;
  parity: boolean;
  cycleCount: number;
  swapEdgeCount: number;
  cycleEdgeCount: number;
  conflictEdgeCount: number;
}

function bucket3(n: number): number {
  return Math.floor(n / 3);
}

export function analyzeCoarseShape(cubies: Cubie[]): CoarseShapeProfile {
  const graph = buildStateGraph(cubies);
  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }

  const wrongWingCount = wrongWingCount5(cubies);
  const pairCount = pairCountOf(cubies);

  return {
    shapeKey: computeCoarseShapeKey(cubies),
    wrongWingCount,
    wrongWingBucket: bucket3(wrongWingCount),
    pairCount,
    pairBucket: bucket3(pairCount),
    parity: hasParity(cubies),
    cycleCount: graph.cycles.length,
    swapEdgeCount,
    cycleEdgeCount,
    conflictEdgeCount,
  };
}
