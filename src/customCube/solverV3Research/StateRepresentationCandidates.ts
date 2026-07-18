// --- StateRepresentationCandidates (Solver v3 Research Kickoff Sprint v1) -
// STEP2: evaluates alternative State Representations against BP-4's own
// Shape Key (solverV2PrototypeBP4/CycleShapeHasher.ts, existing/unmodified)
// as the baseline, on the real 75-replay DB. No fixed candidate count is
// required by the Charter -- as many as are worth trying, at least one
// compared. Two are tried here, for two different reasons a coarser or
// differently-grounded representation might re-cluster better:
//
//   1. Coarse Structural Shape -- same structural ingredients as BP-4
//      (WrongWing/Pair/Parity/WANTS-graph edge counts) but deliberately
//      coarsened (binned WrongWing/Pair, cycle COUNT instead of the full
//      length distribution, edge counts capped at 2+) on the theory that
//      BP-4's exact-match key was simply too fine-grained for 75 samples.
//   2. Capability Fingerprint -- abandons structure entirely and groups
//      replays by BEHAVIOR: which of the 9 known capabilities
//      (BASE/FLIP/CASE/PARITY/RECOVERY/CYCLECHASE/BP-1/BP-2/BP-3, all
//      existing/unmodified/reused) actually succeed on that state. This
//      tests whether "what solves it" clusters better than "what it looks
//      like structurally."
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";

export interface RepresentationEvalResult {
  name: string;
  totalReplays: number;
  uniqueGroups: number;
  singletonGroups: number;
  singletonRate: number;
  reentryRate: number; // fraction of replays sharing a group with >=1 other replay
  avgGroupSize: number;
}

function evaluateGrouping(name: string, keys: readonly string[]): RepresentationEvalResult {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const uniqueGroups = counts.size;
  const singletonGroups = [...counts.values()].filter((c) => c === 1).length;
  const multiMemberReplays = keys.filter((k) => (counts.get(k) ?? 0) >= 2).length;
  return {
    name,
    totalReplays: keys.length,
    uniqueGroups,
    singletonGroups,
    singletonRate: uniqueGroups ? singletonGroups / uniqueGroups : 0,
    reentryRate: keys.length ? multiMemberReplays / keys.length : 0,
    avgGroupSize: uniqueGroups ? keys.length / uniqueGroups : 0,
  };
}

function bucket3(n: number): number {
  return Math.floor(n / 3);
}
function capAt(n: number, cap: number): number {
  return Math.min(n, cap);
}

export function computeCoarseShapeKey(cubies: ReturnType<typeof deserializeCube>): string {
  const graph = buildStateGraph(cubies);
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

  return [
    `WWb${bucket3(wrongWingCount)}`,
    `Pb${bucket3(pairCount)}`,
    `par${parity}`,
    `cycCount${graph.cycles.length}`,
    `swap${capAt(swapEdgeCount, 2)}`,
    `cycE${capAt(cycleEdgeCount, 2)}`,
    `conf${capAt(conflictEdgeCount, 2)}`,
  ].join("|");
}

const FINGERPRINT_DEADLINE_MS = 500;

function testResolver(
  resolver: (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryBoundedMultiCycleResolver>,
  snapshot: FailureSnapshot,
  lib: WingLibrary,
): boolean {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const clone = cloneCubies(cubies);
  const fix = resolver(clone, lib, Date.now() + FINGERPRINT_DEADLINE_MS);
  if (!fix || fix.length === 0) return false;
  applySeq(clone, fix);
  return wrongWingCount5(clone) < before;
}

export function computeCapabilityFingerprintKey(profile: ReplayGapProfile, bp1: boolean, bp2: boolean, bp3: boolean): string {
  const bit = (b: boolean) => (b ? "1" : "0");
  return [
    bit(profile.succeeded.BASE),
    bit(profile.succeeded.FLIP),
    bit(profile.succeeded.CASE),
    bit(profile.succeeded.PARITY),
    bit(profile.succeeded.RECOVERY),
    bit(profile.succeeded.CYCLECHASE),
    bit(bp1),
    bit(bp2),
    bit(bp3),
  ].join("");
}

export interface StateRepresentationComparison {
  baseline: RepresentationEvalResult; // BP-4's own Shape Key
  coarseShape: RepresentationEvalResult;
  capabilityFingerprint: RepresentationEvalResult;
}

export function evaluateStateRepresentationCandidates(failuresDbPath: string, gapDeadlineMs: number): StateRepresentationComparison {
  const all75 = loadAll75(failuresDbPath);
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  const baselineKeys: string[] = [];
  const coarseKeys: string[] = [];
  const fingerprintKeys: string[] = [];

  for (const snapshot of all75) {
    const cubies = deserializeCube(snapshot.cubeState);
    baselineKeys.push(computeCycleShape(cubies).shapeKey);
    coarseKeys.push(computeCoarseShapeKey(cubies));

    const profile = profileByHash.get(snapshot.hash);
    const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
    fingerprintKeys.push(
      profile
        ? computeCapabilityFingerprintKey(profile, bp1, bp2, bp3)
        : computeCapabilityFingerprintKey({ succeeded: { BASE: false, FLIP: false, CASE: false, PARITY: false, RECOVERY: false, CYCLECHASE: false } } as ReplayGapProfile, bp1, bp2, bp3),
    );
  }

  return {
    baseline: evaluateGrouping("BP-4 Shape Key (baseline)", baselineKeys),
    coarseShape: evaluateGrouping("Coarse Structural Shape", coarseKeys),
    capabilityFingerprint: evaluateGrouping("Capability Fingerprint", fingerprintKeys),
  };
}
