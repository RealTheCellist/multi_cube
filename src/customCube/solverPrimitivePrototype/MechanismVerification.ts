// --- MechanismVerification (Solver Primitive Prototype Sprint v3) --------
// STEP2: directly tests the Blueprint's Expected Mechanism ("Conflict Edge
// 존재가 bounded backtracking의 탐색 다양성을 실제로 높인다") by running
// the SAME instrumented DFS (runInstrumentedBoundedSearch, disclosed
// counterfactual reuse -- bypasses the deployed gate ONLY for this
// research probe, never for the Primitive's own decision path) on every
// replay whose cycleLength is in the [2,3] Blueprint band, split into two
// groups by conflictEdgeCount (>0 vs ==0), and compares average search
// diversity metrics between them. This is the actual mechanism test the
// work order asks for -- STEP1/STEP3 only measure WHETHER the gate fires
// and WHETHER it succeeds, not WHY.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges, runInstrumentedBoundedSearch, MIN_BRIDGE_CYCLE_LENGTH, MAX_BRIDGE_CYCLE_LENGTH } from "./MultiHopBridgePrototypeV3";

export interface MechanismProbeRecord {
  hash: string;
  conflictEdgeCount: number;
  nodesVisited: number;
  candidatesGenerated: number;
  leavesExplored: number;
  netImprovingLeaves: number;
  netImprovingLeafRatio: number;
}

export interface GroupStats {
  label: string;
  sampleCount: number;
  avgNodesVisited: number;
  avgCandidatesGenerated: number;
  avgLeavesExplored: number;
  avgNetImprovingLeaves: number;
  avgNetImprovingLeafRatio: number;
}

function avg(nums: readonly number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function summarizeGroup(label: string, records: readonly MechanismProbeRecord[]): GroupStats {
  return {
    label,
    sampleCount: records.length,
    avgNodesVisited: avg(records.map((r) => r.nodesVisited)),
    avgCandidatesGenerated: avg(records.map((r) => r.candidatesGenerated)),
    avgLeavesExplored: avg(records.map((r) => r.leavesExplored)),
    avgNetImprovingLeaves: avg(records.map((r) => r.netImprovingLeaves)),
    avgNetImprovingLeafRatio: avg(records.map((r) => r.netImprovingLeafRatio)),
  };
}

export interface MechanismVerificationResult {
  withConflict: GroupStats;
  withoutConflict: GroupStats;
  diversityHigherWithConflict: boolean; // avgCandidatesGenerated AND avgLeavesExplored both higher
  netImprovingRatioHigherWithConflict: boolean;
  mechanismConfirmed: boolean;
}

export function verifyMechanism(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): MechanismVerificationResult {
  const withConflict: MechanismProbeRecord[] = [];
  const withoutConflict: MechanismProbeRecord[] = [];

  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    const analysis = analyzeMultiCycle(cubies);
    if (!analysis) continue;
    if (analysis.cycleLength < MIN_BRIDGE_CYCLE_LENGTH || analysis.cycleLength > MAX_BRIDGE_CYCLE_LENGTH) continue;

    const conflictEdgeCount = countConflictEdges(cubies);
    const search = runInstrumentedBoundedSearch(cubies, analysis.cycleNodes, lib, Date.now() + deadlineMs);
    const record: MechanismProbeRecord = {
      hash: s.hash,
      conflictEdgeCount,
      nodesVisited: search.nodesVisited,
      candidatesGenerated: search.candidatesGenerated,
      leavesExplored: search.leavesExplored,
      netImprovingLeaves: search.netImprovingLeaves,
      netImprovingLeafRatio: search.leavesExplored ? search.netImprovingLeaves / search.leavesExplored : 0,
    };
    if (conflictEdgeCount > 0) withConflict.push(record);
    else withoutConflict.push(record);
  }

  const withStats = summarizeGroup("conflictEdgeCount>0", withConflict);
  const withoutStats = summarizeGroup("conflictEdgeCount==0", withoutConflict);

  const diversityHigherWithConflict = withStats.avgCandidatesGenerated > withoutStats.avgCandidatesGenerated && withStats.avgLeavesExplored > withoutStats.avgLeavesExplored;
  const netImprovingRatioHigherWithConflict = withStats.avgNetImprovingLeafRatio > withoutStats.avgNetImprovingLeafRatio;

  return {
    withConflict: withStats,
    withoutConflict: withoutStats,
    diversityHigherWithConflict,
    netImprovingRatioHigherWithConflict,
    mechanismConfirmed: diversityHigherWithConflict && netImprovingRatioHigherWithConflict,
  };
}
