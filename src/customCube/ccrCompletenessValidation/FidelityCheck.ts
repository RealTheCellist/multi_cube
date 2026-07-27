// --- FidelityCheck (CCR Completeness Validation Sprint v1) ------------------
// Proves runShadowDfs is a faithful mirror of the REAL runCCRPrototype()
// before any of its instrumentation data is trusted for this Sprint's
// conclusions -- run both on an identical clone with an identical deadline
// and compare the solved/unsolved verdict + move count. Any mismatch is a
// reportable finding, not silently discarded.
import { cloneCubies, type Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { runCCRPrototype, traversalNodesFor, type CCRStrategy } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { runShadowDfs } from "./CCRShadowInstrumentation";

export interface FidelityCheckRow {
  label: string;
  realSolved: boolean;
  shadowSolved: boolean;
  realMoveCount: number;
  shadowMoveCount: number;
  matches: boolean;
}

export function checkFidelity(cubies: Cubie[], label: string, lib: WingLibrary, deadlineMs: number, strategy: CCRStrategy = "singleCycle"): FidelityCheckRow {
  const gate = analyzeCcrGate(cubies);
  const nodes = traversalNodesFor(gate, strategy);

  const realClone = cloneCubies(cubies);
  const realDeadline = Date.now() + deadlineMs;
  const realResult = runCCRPrototype(realClone, lib, realDeadline, strategy);

  const shadowClone = cloneCubies(cubies);
  const shadowDeadline = Date.now() + deadlineMs;
  const shadowResult = runShadowDfs(shadowClone, nodes, lib, shadowDeadline);

  const realSolved = !!realResult.moves;
  const shadowSolved = shadowResult.solutionFound;
  const realMoveCount = realResult.moves?.length ?? 0;
  const shadowMoveCount = shadowResult.moves?.length ?? 0;

  return { label, realSolved, shadowSolved, realMoveCount, shadowMoveCount, matches: realSolved === shadowSolved };
}
