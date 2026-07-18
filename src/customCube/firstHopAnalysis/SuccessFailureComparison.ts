// --- SuccessFailureComparison (First-Hop Failure Analysis Sprint v1) -------
// Spec STEP 4: compares the 17 Replays where CycleChase actually activated
// against the 46 where it didn't (FIRST_HOP_FAIL specifically), across the
// structural stats already established in this whole research series.
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import type { FirstHopTraceRecord } from "./FirstHopTraceDB";

export interface GroupStats {
  label: string;
  count: number;
  avgCycleLength: number;
  avgWrongWingCount: number;
  avgPairCount: number;
  avgCandidateCount: number | null; // only meaningful for the failed group (FirstHopTraceRecord-derived)
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function computeActivatedGroupStats(activatedSnapshots: readonly FailureSnapshot[]): GroupStats {
  const cycleLengths: number[] = [];
  const wrongWings: number[] = [];
  const pairs: number[] = [];

  for (const s of activatedSnapshots) {
    const cubies = deserializeCube(s.cubeState);
    const cycle = pickLongestCycle(buildStateGraph(cubies).cycles);
    cycleLengths.push(cycle ? cycle.length : 0);
    wrongWings.push(wrongWingCount5(cubies));
    pairs.push(pairCountOf(cubies));
  }

  return {
    label: "활성화 (17건)",
    count: activatedSnapshots.length,
    avgCycleLength: avg(cycleLengths),
    avgWrongWingCount: avg(wrongWings),
    avgPairCount: avg(pairs),
    avgCandidateCount: null,
  };
}

export function computeFailedGroupStats(records: readonly FirstHopTraceRecord[]): GroupStats {
  return {
    label: "FIRST_HOP_FAIL (46건)",
    count: records.length,
    avgCycleLength: avg(records.map((r) => r.cycleLength)),
    avgWrongWingCount: avg(records.map((r) => r.wrongWingCount)),
    avgPairCount: avg(records.map((r) => r.pairCount)),
    avgCandidateCount: avg(records.map((r) => r.candidateCount)),
  };
}
