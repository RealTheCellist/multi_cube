// --- SuccessFailureComparison (Solver Primitive Blueprint Reanalysis
// Sprint v1) -------------------------------------------------------------
// STEP1: re-runs BOTH Prototype primitives from Primitive Prototype Sprint
// v2 (MultiHopBridgePrototype.ts/ConflictDominantSacrificePrototype.ts,
// unmodified, read-only reuse -- this Sprint never touches Prototype code)
// on the full 150-replay Dataset, pairing each outcome with a complete
// structural feature vector, and extracts the mean feature difference
// between the SUCCESS and FAILURE groups -- the concrete, data-grounded
// answer to "성공 사례에서 공통적으로 나타나는 구조를 추출한다."
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { tryMultiHopBridge } from "../solverPrimitivePrototype/MultiHopBridgePrototype";
import { tryConflictDominantSacrifice } from "../solverPrimitivePrototype/ConflictDominantSacrificePrototype";

const DEADLINE_MS = 400;

export const NUMERIC_FEATURES = ["wrongWingCount", "pairCount", "cycleCount", "cycleLength", "swapEdgeCount", "cycleEdgeCount", "conflictEdgeCount"] as const;
export type NumericFeature = (typeof NUMERIC_FEATURES)[number];

export interface ReplayFeatureVector {
  hash: string;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  cycleCount: number;
  cycleLength: number; // longest cycle length, 0 if no cycle
  swapEdgeCount: number;
  cycleEdgeCount: number;
  conflictEdgeCount: number;
}

export interface PrimitiveRunRecord {
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

export interface DatasetRuns {
  bridge: PrimitiveRunRecord[];
  sacrifice: PrimitiveRunRecord[];
}

export function runBothPrimitivesWithFeatures(failuresDbPath: string): DatasetRuns {
  const all150 = loadAll75(failuresDbPath);
  const lib = buildWingLibrary();

  const bridge: PrimitiveRunRecord[] = [];
  const sacrifice: PrimitiveRunRecord[] = [];

  for (const s of all150) {
    const cubies = deserializeCube(s.cubeState);
    const features = extractFeatures(s.hash, cubies);
    const wrongWingBefore = features.wrongWingCount;

    const bridgeResult = tryMultiHopBridge(cubies, lib, Date.now() + DEADLINE_MS);
    let bridgeSucceeded = false;
    if (bridgeResult.moves && bridgeResult.moves.length > 0) {
      const clone = cloneCubies(cubies);
      applySeq(clone, bridgeResult.moves);
      bridgeSucceeded = wrongWingCount5(clone) < wrongWingBefore;
    }
    bridge.push({ hash: s.hash, features, succeeded: bridgeSucceeded });

    const sacrificeResult = tryConflictDominantSacrifice(cubies, lib, Date.now() + DEADLINE_MS);
    let sacrificeSucceeded = false;
    if (sacrificeResult.moves && sacrificeResult.moves.length > 0) {
      const clone = cloneCubies(cubies);
      applySeq(clone, sacrificeResult.moves);
      sacrificeSucceeded = wrongWingCount5(clone) < wrongWingBefore;
    }
    sacrifice.push({ hash: s.hash, features, succeeded: sacrificeSucceeded });
  }

  return { bridge, sacrifice };
}

export interface FeatureMeanComparison {
  feature: NumericFeature;
  successMean: number;
  failureMean: number;
  difference: number; // successMean - failureMean
  successCount: number;
  failureCount: number;
}

function avg(nums: readonly number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function compareSuccessVsFailure(records: readonly PrimitiveRunRecord[]): FeatureMeanComparison[] {
  const successes = records.filter((r) => r.succeeded);
  const failures = records.filter((r) => !r.succeeded);

  return NUMERIC_FEATURES.map((feature) => {
    const successMean = avg(successes.map((r) => r.features[feature] as number));
    const failureMean = avg(failures.map((r) => r.features[feature] as number));
    return { feature, successMean, failureMean, difference: successMean - failureMean, successCount: successes.length, failureCount: failures.length };
  });
}
