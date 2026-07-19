// --- CostAnalysis (Solver Primitive Prototype Sprint v3) -----------------
// STEP5: execution cost of the deployed v3 Primitive on the replays where
// its gate actually matches -- average wall-clock time, average search
// depth (= cycleLength, the DFS's own recursion bound), and average
// branching (candidatesGenerated / nodesVisited, a per-node fan-out
// proxy), plus the raw leaves/nodes averages behind it.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import { tryMultiHopBridgeV3 } from "./MultiHopBridgePrototypeV3";

export interface CostSummary {
  matchedCount: number;
  avgTimeMs: number;
  avgSearchDepth: number; // = cycleLength
  avgBranchingFactor: number; // candidatesGenerated / nodesVisited
  avgLeavesExplored: number;
  avgNodesVisited: number;
}

function avg(nums: readonly number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function analyzeCost(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): CostSummary {
  const matched = snapshots
    .map((s) => {
      const cubies = deserializeCube(s.cubeState);
      return tryMultiHopBridgeV3(cubies, lib, Date.now() + deadlineMs);
    })
    .filter((r) => r.gateOutcome === "gate_matched" && r.search !== null);

  return {
    matchedCount: matched.length,
    avgTimeMs: avg(matched.map((r) => r.timeMs)),
    avgSearchDepth: avg(matched.map((r) => r.cycleLength)),
    avgBranchingFactor: avg(matched.map((r) => (r.search!.nodesVisited ? r.search!.candidatesGenerated / r.search!.nodesVisited : 0))),
    avgLeavesExplored: avg(matched.map((r) => r.search!.leavesExplored)),
    avgNodesVisited: avg(matched.map((r) => r.search!.nodesVisited)),
  };
}
