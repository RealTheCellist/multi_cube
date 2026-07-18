// --- CycleShapeHasher (Solver v2 Primitive Prototype Sprint v4) ----------
// STEP 1: turns a cube state into a deterministic Shape Signature/Key.
// Reuses buildStateGraph (capabilityAnalysis/, existing/unmodified) for the
// WANTS-graph edges, exactly like BP-3's StructuralProfile.ts, but keeps
// the FULL cycle-length distribution (every detected cycle's length, not
// just the longest) since spec STEP1 explicitly asks for "Cycle 길이
// 분포" (a distribution), not a single number.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

export interface CycleShapeSignature {
  wrongWingCount: number;
  pairCount: number;
  hasParity: boolean;
  cycleCount: number;
  cycleLengths: number[]; // sorted ascending -- the "distribution"
  swapEdgeCount: number;
  cycleEdgeCount: number;
  conflictEdgeCount: number;
  shapeKey: string; // deterministic string key, safe for exact-match grouping
}

export function computeCycleShape(cubies: Cubie[]): CycleShapeSignature {
  const graph = buildStateGraph(cubies);
  const cycleLengths = graph.cycles.map((c) => c.length).sort((a, b) => a - b);

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
  const parity = hasParity(cubies);

  const shapeKey = [
    `WW${wrongWingCount}`,
    `P${pairCount}`,
    `par${parity}`,
    `cyc[${cycleLengths.join(",")}]`,
    `swap${swapEdgeCount}`,
    `cycE${cycleEdgeCount}`,
    `conf${conflictEdgeCount}`,
  ].join("|");

  return {
    wrongWingCount,
    pairCount,
    hasParity: parity,
    cycleCount: cycleLengths.length,
    cycleLengths,
    swapEdgeCount,
    cycleEdgeCount,
    conflictEdgeCount,
    shapeKey,
  };
}
