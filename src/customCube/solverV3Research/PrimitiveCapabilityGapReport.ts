// --- PrimitiveCapabilityGapReport (Solver v3 Research Kickoff Sprint v1) --
// STEP3: design-level (no implementation) new-Primitive candidates, grounded
// in what actually differentiates the replays that STEP1's reclassification
// rescues (BP-1/BP-2/BP-3 combined) from the ones that remain Hard Gap even
// after that widened measurement window. Reuses HardGapReclassifier.ts
// (STEP1, unmodified) and StateRepresentationCandidates.ts's Coarse Shape
// (STEP2, unmodified) -- no new search or algorithm here, only comparison
// of already-computed real features between the two groups.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import type { HardGapReclassificationAggregate } from "./HardGapReclassifier";

export interface GroupFeatureSummary {
  count: number;
  avgWrongWing: number;
  avgPair: number;
  parityRate: number;
  avgCycleCount: number;
  avgLongestCycleLength: number;
  avgConflictEdgeCount: number;
}

export interface PrimitiveCapabilityGapFindings {
  reclassification: HardGapReclassificationAggregate;
  rescuedGroup: GroupFeatureSummary;
  stillHardGroup: GroupFeatureSummary;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function summarizeGroup(hashes: readonly string[], byHash: Map<string, ReturnType<typeof deserializeCube>>): GroupFeatureSummary {
  const wrongWings: number[] = [];
  const pairs: number[] = [];
  let parityCount = 0;
  const cycleCounts: number[] = [];
  const longestCycles: number[] = [];
  const conflicts: number[] = [];

  for (const hash of hashes) {
    const cubies = byHash.get(hash);
    if (!cubies) continue;
    wrongWings.push(wrongWingCount5(cubies));
    pairs.push(pairCountOf(cubies));
    if (hasParity(cubies)) parityCount++;
    const graph = buildStateGraph(cubies);
    cycleCounts.push(graph.cycles.length);
    const longest = pickLongestCycle(graph.cycles);
    longestCycles.push(longest ? longest.length : 0);
    conflicts.push(graph.edges.filter((e) => e.type === "CONFLICT").length);
  }

  return {
    count: hashes.length,
    avgWrongWing: avg(wrongWings),
    avgPair: avg(pairs),
    parityRate: hashes.length ? parityCount / hashes.length : 0,
    avgCycleCount: avg(cycleCounts),
    avgLongestCycleLength: avg(longestCycles),
    avgConflictEdgeCount: avg(conflicts),
  };
}

// Takes an ALREADY-COMPUTED reclassification (STEP1's own output, reused
// as-is -- not recomputed) to avoid paying its expensive multi-run cost a
// second time. Uses the LAST run inside the aggregate (any single run is a
// valid real sample of the rescued/still-hard partition; the aggregate's
// averaged counts are what STEP1 itself reports as the headline numbers).
export function buildPrimitiveCapabilityGapReport(failuresDbPath: string, reclassification: HardGapReclassificationAggregate): PrimitiveCapabilityGapFindings {
  const lastRun = reclassification.runs[reclassification.runs.length - 1];

  const all75 = loadAll75(failuresDbPath);
  const byHash = new Map(all75.map((s) => [s.hash, deserializeCube(s.cubeState)]));

  const originalHardGap = lastRun.perReplay.filter((r) => r.wasHardGap);
  const rescuedHashes = originalHardGap.filter((r) => r.rescued).map((r) => r.hash);
  const stillHardHashes = originalHardGap.filter((r) => r.stillHardGap).map((r) => r.hash);

  return {
    reclassification,
    rescuedGroup: summarizeGroup(rescuedHashes, byHash),
    stillHardGroup: summarizeGroup(stillHardHashes, byHash),
  };
}
