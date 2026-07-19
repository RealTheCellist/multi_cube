// --- ReproducibilityCheck (Solver Primitive Blueprint Sprint v2) ---------
// STEP1: re-verifies whether the new Blueprint candidate from Primitive
// Blueprint Reanalysis Sprint v1 ("cycleLength 2~3 AND conflictEdgeCount>0",
// 50.0%/5-of-10 in a single run) holds up across MULTIPLE independent runs
// of the real Multi-Hop Bridge Prototype (unmodified, read-only reuse --
// this Sprint never touches Prototype code) on the full 150-replay
// Dataset, or was a small-sample artifact of BoundedResolver's own
// disclosed Math.random()-based search variance (the same reason
// HardGapReclassifier.ts averages 3 runs and ClusterStabilityReview
// averages 5).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { tryMultiHopBridge } from "../solverPrimitivePrototype/MultiHopBridgePrototype";

const DEADLINE_MS = 400;
export const REPRODUCIBILITY_RUNS = 5;

export interface ReplayFeatureVector {
  hash: string;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  cycleCount: number;
  cycleLength: number;
  swapEdgeCount: number;
  cycleEdgeCount: number;
  conflictEdgeCount: number;
}

export interface RunRecord {
  hash: string;
  features: ReplayFeatureVector;
  succeeded: boolean;
}

function extractFeatures(hash: string, cubies: ReturnType<typeof deserializeCube>): ReplayFeatureVector {
  const graph = buildStateGraph(cubies);
  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }
  const cycleLengths = graph.cycles.map((c) => c.length);
  return {
    hash,
    wrongWingCount: wrongWingCount5(cubies),
    pairCount: pairCountOf(cubies),
    parity: hasParity(cubies),
    cycleCount: cycleLengths.length,
    cycleLength: cycleLengths.length ? Math.max(...cycleLengths) : 0,
    swapEdgeCount,
    cycleEdgeCount,
    conflictEdgeCount,
  };
}

export function runMultiHopBridgeOnce(failuresDbPath: string): RunRecord[] {
  const all150 = loadAll75(failuresDbPath);
  const lib = buildWingLibrary();
  return all150.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const features = extractFeatures(s.hash, cubies);
    const wrongWingBefore = features.wrongWingCount;
    const result = tryMultiHopBridge(cubies, lib, Date.now() + DEADLINE_MS);
    let succeeded = false;
    if (result.moves && result.moves.length > 0) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves);
      succeeded = wrongWingCount5(clone) < wrongWingBefore;
    }
    return { hash: s.hash, features, succeeded };
  });
}

export function runMultiHopBridgeMultipleTimes(failuresDbPath: string, times: number = REPRODUCIBILITY_RUNS): RunRecord[][] {
  const runs: RunRecord[][] = [];
  for (let i = 0; i < times; i++) runs.push(runMultiHopBridgeOnce(failuresDbPath));
  return runs;
}

export interface CandidatePredicate {
  name: string;
  predicate: (f: ReplayFeatureVector) => boolean;
}

export interface PerRunStat {
  runIndex: number;
  matchedCount: number;
  successCount: number;
  successRate: number;
}

export interface ReproducibilityResult {
  candidateName: string;
  perRun: PerRunStat[];
  avgSuccessRate: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  stdDev: number;
  avgMatchedCount: number;
}

export function evaluateReproducibility(multiRun: readonly RunRecord[][], candidate: CandidatePredicate): ReproducibilityResult {
  const perRun: PerRunStat[] = multiRun.map((records, i) => {
    const matched = records.filter((r) => candidate.predicate(r.features));
    const successCount = matched.filter((r) => r.succeeded).length;
    return { runIndex: i + 1, matchedCount: matched.length, successCount, successRate: matched.length ? successCount / matched.length : 0 };
  });
  const rates = perRun.map((r) => r.successRate);
  const avgSuccessRate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, r) => a + (r - avgSuccessRate) ** 2, 0) / rates.length;
  const avgMatchedCount = perRun.reduce((a, r) => a + r.matchedCount, 0) / perRun.length;

  return { candidateName: candidate.name, perRun, avgSuccessRate, minSuccessRate: Math.min(...rates), maxSuccessRate: Math.max(...rates), stdDev: Math.sqrt(variance), avgMatchedCount };
}

// Reanalysis Sprint v1's own real, cited candidates (unmodified) --
// re-tested here across multiple runs instead of the single run that
// produced them.
export const NEW_CANDIDATE: CandidatePredicate = {
  name: "cycleLength 2~3 AND conflictEdgeCount>0 (Reanalysis Sprint v1 신규 후보)",
  predicate: (f) => f.cycleLength >= 2 && f.cycleLength <= 3 && f.conflictEdgeCount > 0,
};

export const OLD_BLUEPRINT: CandidatePredicate = {
  name: "cycleCount<=2 (기존 Blueprint 원안)",
  predicate: (f) => f.cycleCount <= 2,
};
