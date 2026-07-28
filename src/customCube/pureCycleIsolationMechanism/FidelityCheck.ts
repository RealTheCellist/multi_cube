// --- FidelityCheck (PURE_CYCLE_ISOLATION Structural Mechanism Analysis
// Sprint v1) ------------------------------------------------------------
// Verifies CycleSearchShadow (maxCandidatesPerHop=2) is a faithful mirror
// of the REAL, exported resolveBoundedMultiCycle() before trusting its
// diagnostics -- same discipline CCR Completeness Validation Sprint v1
// established for CCR's own private runBoundedDfs.
import { cloneCubies, type Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { resolveBoundedMultiCycle, MAX_CANDIDATES_PER_HOP as BP1_MAX_CANDIDATES_PER_HOP } from "../solverV2Prototype/BoundedResolver";
import { runCycleSearchShadow } from "./CycleSearchShadow";

export interface Bp1FidelityRow {
  label: string;
  realSolved: boolean;
  shadowSolved: boolean;
  realMoveCount: number;
  shadowMoveCount: number;
  matches: boolean;
}

export function checkBp1Fidelity(cubies: Cubie[], label: string, lib: WingLibrary, deadlineMs: number): Bp1FidelityRow {
  const analysis = analyzeMultiCycle(cubies);
  const cycleNodes = analysis?.cycleNodes ?? [];

  const realClone = cloneCubies(cubies);
  const realDeadline = Date.now() + deadlineMs;
  const realResult = resolveBoundedMultiCycle(realClone, cycleNodes, lib, realDeadline);

  const shadowClone = cloneCubies(cubies);
  const shadowDeadline = Date.now() + deadlineMs;
  const shadowResult = runCycleSearchShadow(shadowClone, cycleNodes, lib, shadowDeadline, BP1_MAX_CANDIDATES_PER_HOP);

  const realSolved = !!realResult.moves;
  const shadowSolved = !!shadowResult.moves;

  return {
    label,
    realSolved,
    shadowSolved,
    realMoveCount: realResult.moves?.length ?? 0,
    shadowMoveCount: shadowResult.moves?.length ?? 0,
    matches: realSolved === shadowSolved,
  };
}
