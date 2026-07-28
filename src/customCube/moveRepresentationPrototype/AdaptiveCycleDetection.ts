// --- AdaptiveCycleDetection (Move Representation Prototype Sprint v1) ------
// "Adaptive Cycle 탐지, Cycle 길이 계산" -- reuses analyzeMultiCycle()
// (solverV2Prototype/MultiCycleAnalyzer.ts, existing/unmodified) directly.
// No cycle length is ever hardcoded: cycleNodes.length IS the detected
// length, used as-is by every downstream step.
import type { Cubie } from "../cubeState";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";

export interface AdaptiveCycle {
  cycleLength: number;
  cycleNodes: string[];
}

export function detectAdaptiveCycle(cubies: Cubie[]): AdaptiveCycle | null {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return null;
  return { cycleLength: analysis.cycleLength, cycleNodes: analysis.cycleNodes };
}
