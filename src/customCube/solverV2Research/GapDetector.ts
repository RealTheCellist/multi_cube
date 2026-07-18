// --- GapDetector (Solver v2 Research Kickoff Sprint v1) --------------------
// Deliverable 2: finds the common features of states where EVERY tested
// capability fails -- operating per-REPLAY (all 75 real Failure Replays),
// not per-Cluster, since a Cluster can have some members solvable and
// others not (exactly what PAIR_CONFLICT already showed at the replay
// level in First-Hop Failure Analysis Sprint v1). Reuses
// capabilityAnalysis's real re-execution tester and CycleChasePrototype.ts
// read-only, never modifying either.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { tryCycleChase } from "../primitivePrototype/CycleChasePrototype";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { classifyReplay } from "../coverageExpansion/InactivityClassifier";
import type { PrimitiveName } from "./CapabilityMatrix";
import { ALL_PRIMITIVES } from "./CapabilityMatrix";

export interface ReplayGapProfile {
  replayHash: string;
  clusterKey: string;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  longestCycleLength: number;
  cycleChaseEngaged: boolean; // a 4+ cycle exists (CycleChase's own activation gate), regardless of outcome
  pairConflict: boolean; // engaged but a valid candidate existed that didn't net-improve (reuses coverageExpansion's own classifier)
  succeeded: Record<PrimitiveName, boolean>;
  isHardGap: boolean; // NOTHING tested succeeded
}

function testCycleChase(cubies: readonly Cubie[], libs: ExecutorLibraries): boolean {
  const before = wrongWingCount5(cubies as Cubie[]);
  const clone = cloneCubies(cubies as Cubie[]);
  const fix = tryCycleChase(clone, libs.lib, Date.now() + 300);
  return !!fix && fix.length > 0 && wrongWingCount5(clone) < before;
}

export function profileReplay(snapshot: FailureSnapshot, clusterKey: string, libs: ExecutorLibraries, deadlineMs: number): ReplayGapProfile {
  const cubies = deserializeCube(snapshot.cubeState);
  const testResults = testAllCapabilities(cubies, libs);
  const succeeded = {} as Record<PrimitiveName, boolean>;
  for (const p of ALL_PRIMITIVES) succeeded[p] = false;
  for (const r of testResults) succeeded[r.primitive as PrimitiveName] = r.succeeded;
  succeeded.CYCLECHASE = testCycleChase(cubies, libs);

  const cycle = pickLongestCycle(buildStateGraph(cubies).cycles);
  const longestCycleLength = cycle ? cycle.length : 0;
  const classification = classifyReplay(snapshot, libs.lib, deadlineMs);

  return {
    replayHash: snapshot.hash,
    clusterKey,
    wrongWingCount: wrongWingCount5(cubies),
    pairCount: pairCountOf(cubies),
    parity: hasParity(cubies),
    longestCycleLength,
    cycleChaseEngaged: longestCycleLength >= 4,
    pairConflict: classification.cause === "PAIR_CONFLICT",
    succeeded,
    isHardGap: ALL_PRIMITIVES.every((p) => !succeeded[p]),
  };
}

export function profileAllReplays(failuresDbPath: string, deadlineMs: number): ReplayGapProfile[] {
  const snapshots = allSnapshots(loadDatabase(failuresDbPath));
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
  return snapshots.map((s) => profileReplay(s, `w${s.wrongWingCount}|p${s.parity ? 1 : 0}`, libs, deadlineMs));
}

export interface GapCommonFeatures {
  count: number;
  totalReplays: number;
  gapShare: number;
  avgWrongWing: number;
  wrongWingRange: [number, number];
  parityRate: number;
  avgCycleLength: number;
  pairConflictRate: number; // fraction of hard-gap replays that ALSO show the PAIR_CONFLICT pattern
  avgPairCount: number;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function extractCommonFeatures(profiles: readonly ReplayGapProfile[]): GapCommonFeatures {
  const gaps = profiles.filter((p) => p.isHardGap);
  const wrongWings = gaps.map((g) => g.wrongWingCount);
  return {
    count: gaps.length,
    totalReplays: profiles.length,
    gapShare: profiles.length ? gaps.length / profiles.length : 0,
    avgWrongWing: avg(wrongWings),
    wrongWingRange: wrongWings.length ? [Math.min(...wrongWings), Math.max(...wrongWings)] : [0, 0],
    parityRate: gaps.length ? gaps.filter((g) => g.parity).length / gaps.length : 0,
    avgCycleLength: avg(gaps.map((g) => g.longestCycleLength)),
    pairConflictRate: gaps.length ? gaps.filter((g) => g.pairConflict).length / gaps.length : 0,
    avgPairCount: avg(gaps.map((g) => g.pairCount)),
  };
}
