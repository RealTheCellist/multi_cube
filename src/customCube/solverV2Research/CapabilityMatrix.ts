// --- CapabilityMatrix (Solver v2 Research Kickoff Sprint v1) ---------------
// Deliverable 1: quantifies which of the EXISTING capabilities (BASE/FLIP/
// CASE/PARITY, reusing capabilityAnalysis's own real re-execution tester,
// unmodified -- plus RECOVERY and CycleChase, the two "meta"/orchestration
// capabilities this whole research series built) resolves each real
// FailureCluster. Every cell is a real measured before/after, never a
// placeholder -- exactly the discipline capabilityAnalysis/capabilityMatrix.ts
// already established.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import { clusterFailures } from "../failureAnalysis/failureCluster";
import type { FailureCluster, FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { tryCycleChase } from "../primitivePrototype/CycleChasePrototype";

export type PrimitiveName = "BASE" | "FLIP" | "CASE" | "PARITY" | "RECOVERY" | "CYCLECHASE";

export const ALL_PRIMITIVES: readonly PrimitiveName[] = ["BASE", "FLIP", "CASE", "PARITY", "RECOVERY", "CYCLECHASE"];

export interface ClusterCapabilityRow {
  clusterKey: string;
  size: number;
  representativeHash: string;
  samplesTested: number; // how many distinct member snapshots were tested (see module comment on why >1)
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  longestCycleLength: number;
  succeeded: Record<PrimitiveName, boolean>; // true if this primitive net-improved WrongWing on ANY tested sample (see below)
  anySucceeded: boolean;
}

// capabilityAnalysis's own Capability Analysis Engine v1 already disclosed
// that several of these primitives (BASE/RECOVERY especially) internally
// use Math.random()-based shuffle(), so testing only ONE representative
// snapshot per cluster can misreport an intermittently-successful
// primitive as a hard gap. Testing a small SAMPLE of distinct members per
// cluster (not just [0]) and treating a primitive as "capable" if it
// succeeds on ANY of them is a more honest, still-cheap way to separate
// "sometimes works" from "genuinely never works" -- capped low since some
// clusters only have 1-2 members total anyway.
const SAMPLES_PER_CLUSTER = 3;

function testCycleChase(cubies: readonly Cubie[], libs: ExecutorLibraries): boolean {
  const before = wrongWingCount5(cubies as Cubie[]);
  const clone = cloneCubies(cubies as Cubie[]);
  const fix = tryCycleChase(clone, libs.lib, Date.now() + 300);
  return !!fix && fix.length > 0 && wrongWingCount5(clone) < before;
}

export function buildCapabilityMatrixForAllClusters(failuresDbPath: string): ClusterCapabilityRow[] {
  const snapshots = allSnapshots(loadDatabase(failuresDbPath));
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const clusters: FailureCluster[] = clusterFailures(snapshots);

  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  return clusters.map((cluster) => {
    const sampleHashes = cluster.hashes.slice(0, SAMPLES_PER_CLUSTER);
    const representative: FailureSnapshot = byHash.get(sampleHashes[0])!;
    const representativeCubies = deserializeCube(representative.cubeState);

    const succeeded = {} as Record<PrimitiveName, boolean>;
    for (const p of ALL_PRIMITIVES) succeeded[p] = false;

    for (const hash of sampleHashes) {
      const snapshot = byHash.get(hash)!;
      const cubies = deserializeCube(snapshot.cubeState);
      const testResults = testAllCapabilities(cubies, libs); // BASE/FLIP/CASE/PARITY/RECOVERY, real re-execution
      for (const r of testResults) {
        if (r.succeeded) succeeded[r.primitive as PrimitiveName] = true;
      }
      if (testCycleChase(cubies, libs)) succeeded.CYCLECHASE = true;
    }

    const cycle = pickLongestCycle(buildStateGraph(representativeCubies).cycles);

    return {
      clusterKey: cluster.key,
      size: cluster.size,
      representativeHash: representative.hash,
      samplesTested: sampleHashes.length,
      wrongWingCount: wrongWingCount5(representativeCubies),
      pairCount: pairCountOf(representativeCubies),
      parity: hasParity(representativeCubies),
      longestCycleLength: cycle ? cycle.length : 0,
      succeeded,
      anySucceeded: ALL_PRIMITIVES.some((p) => succeeded[p]),
    };
  });
}
