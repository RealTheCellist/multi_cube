// --- FeatureInventory (Solver Representation Blueprint Sprint v1) --------
// STEP2: catalogs every currently-available piece of state information
// (all reused, unmodified, existing exports -- no new Solver/Primitive
// analysis) and measures real pairwise Pearson correlation across the
// 150-replay Dataset to find redundant vs independent axes. This grounds
// STEP3's candidate design in measured evidence, not intuition: an axis
// found here to be near-independent from the others is a genuine
// candidate for a NEW Representation dimension; an axis strongly
// correlated with one already in Coarse Shape adds little.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";

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

export const FEATURE_NAMES = [
  "wrongWingCount",
  "pairCount",
  "parity",
  "remainingEdgesCount",
  "cycleCount",
  "maxCycleLength",
  "avgCycleLength",
  "swapEdgeCount",
  "cycleEdgeCount",
  "conflictEdgeCount",
  "capabilitySuccessCount",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FEATURE_DESCRIPTIONS: Record<FeatureName, string> = {
  wrongWingCount: "solve까지 남은 wrong wing 개수 (fiveByFiveEdges.wrongWingCount5, 기존/미수정)",
  pairCount: "이미 짝지어진 edge pair 수 (GoalAnalyzer.pairCountOf, 기존/미수정)",
  parity: "parity 존재 여부 (GoalAnalyzer.hasParity, 기존/미수정) -- 0/1",
  remainingEdgesCount: "FailureSnapshot 자체에 기록된 remainingEdges 배열 길이 (failureAnalysisEngine이 이미 기록한 값, 재계산 아님)",
  cycleCount: "WANTS-그래프의 감지된 cycle 개수 (buildStateGraph, 기존/미수정)",
  maxCycleLength: "cycle 중 가장 긴 길이",
  avgCycleLength: "cycle 길이 평균 (cycle 없으면 0)",
  swapEdgeCount: "WANTS-그래프의 SWAP(2-cycle) 엣지 수",
  cycleEdgeCount: "WANTS-그래프의 CYCLE(3+-cycle) 엣지 수",
  conflictEdgeCount: "WANTS-그래프의 CONFLICT(비순환 의존) 엣지 수",
  capabilitySuccessCount: "9개 능력(BASE/FLIP/CASE/PARITY/RECOVERY/CYCLECHASE/BP-1/BP-2/BP-3) 중 성공한 개수 -- Capability Fingerprint의 비트합",
};

function extractFeatureVector(snapshot: FailureSnapshot, profile: ReplayGapProfile | undefined, lib: WingLibrary): Record<FeatureName, number> {
  const cubies = deserializeCube(snapshot.cubeState);
  const graph = buildStateGraph(cubies);
  const cycleLengths = graph.cycles.map((c) => c.length);
  let swapEdgeCount = 0;
  let cycleEdgeCount = 0;
  let conflictEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }

  const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
  const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
  const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
  const baseSuccessCount = profile ? Object.values(profile.succeeded).filter(Boolean).length : 0;
  const capabilitySuccessCount = baseSuccessCount + (bp1 ? 1 : 0) + (bp2 ? 1 : 0) + (bp3 ? 1 : 0);

  return {
    wrongWingCount: wrongWingCount5(cubies),
    pairCount: pairCountOf(cubies),
    parity: hasParity(cubies) ? 1 : 0,
    remainingEdgesCount: snapshot.remainingEdges.length,
    cycleCount: cycleLengths.length,
    maxCycleLength: cycleLengths.length ? Math.max(...cycleLengths) : 0,
    avgCycleLength: cycleLengths.length ? cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length : 0,
    swapEdgeCount,
    cycleEdgeCount,
    conflictEdgeCount,
    capabilitySuccessCount,
  };
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  if (n === 0) return 0;
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

export interface FeaturePairCorrelation {
  featureA: FeatureName;
  featureB: FeatureName;
  correlation: number;
  classification: "REDUNDANT" | "INDEPENDENT" | "MODERATE";
}

const REDUNDANT_THRESHOLD = 0.7;
const INDEPENDENT_THRESHOLD = 0.2;

export interface FeatureInventoryReport {
  totalReplays: number;
  featureNames: readonly FeatureName[];
  featureDescriptions: Record<FeatureName, string>;
  correlations: FeaturePairCorrelation[];
  redundantPairs: FeaturePairCorrelation[];
  independentPairs: FeaturePairCorrelation[];
  summary: string;
}

export function buildFeatureInventory(failuresDbPath: string, gapDeadlineMs: number): FeatureInventoryReport {
  const all150 = loadAll75(failuresDbPath);
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  const vectors = all150.map((s) => extractFeatureVector(s, profileByHash.get(s.hash), lib));
  const columns: Record<FeatureName, number[]> = Object.fromEntries(FEATURE_NAMES.map((f) => [f, vectors.map((v) => v[f])])) as Record<FeatureName, number[]>;

  const correlations: FeaturePairCorrelation[] = [];
  for (let i = 0; i < FEATURE_NAMES.length; i++) {
    for (let j = i + 1; j < FEATURE_NAMES.length; j++) {
      const featureA = FEATURE_NAMES[i];
      const featureB = FEATURE_NAMES[j];
      const r = pearson(columns[featureA], columns[featureB]);
      const absR = Math.abs(r);
      const classification: FeaturePairCorrelation["classification"] = absR >= REDUNDANT_THRESHOLD ? "REDUNDANT" : absR <= INDEPENDENT_THRESHOLD ? "INDEPENDENT" : "MODERATE";
      correlations.push({ featureA, featureB, correlation: r, classification });
    }
  }

  const redundantPairs = correlations.filter((c) => c.classification === "REDUNDANT").sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const independentPairs = correlations.filter((c) => c.classification === "INDEPENDENT").sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation));

  const summary =
    `${FEATURE_NAMES.length}개 Feature 중 ${redundantPairs.length}개 쌍이 |r|>=${REDUNDANT_THRESHOLD}로 중복(REDUNDANT), ` +
    `${independentPairs.length}개 쌍이 |r|<=${INDEPENDENT_THRESHOLD}로 독립(INDEPENDENT)이다. ` +
    `가장 강한 중복: ${redundantPairs[0] ? `${redundantPairs[0].featureA}~${redundantPairs[0].featureB} (r=${redundantPairs[0].correlation.toFixed(2)})` : "없음"}. ` +
    `가장 독립적인 축: ${independentPairs[0] ? `${independentPairs[0].featureA}~${independentPairs[0].featureB} (r=${independentPairs[0].correlation.toFixed(2)})` : "없음"}.`;

  return { totalReplays: all150.length, featureNames: FEATURE_NAMES, featureDescriptions: FEATURE_DESCRIPTIONS, correlations, redundantPairs, independentPairs, summary };
}
