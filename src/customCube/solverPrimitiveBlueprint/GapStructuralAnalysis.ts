// --- GapStructuralAnalysis (Solver Primitive Blueprint Sprint v1) --------
// STEP1: re-classifies the 49-replay Capability Gap (all 5 allowed
// Primitives fail -- Primitive Capability Analysis Sprint v1's own real
// finding) along 7 structural axes (WrongWing/Pair/Cycle/Conflict/Swap/
// Coarse Shape/Cluster), and extracts REPEATING structure by comparing
// each axis's distribution WITHIN the Gap subset against the SAME axis's
// distribution over the whole 150-replay Dataset -- an axis bucket that's
// substantially OVER-represented in the Gap (relative to its dataset-wide
// base rate) is a real, measured candidate for "what makes these states
// specifically hard", not intuition.
//
// Reuses solverPrimitiveResearch's own Capability Matrix/Taxonomy builders
// (Primitive Capability Analysis Sprint v1, unmodified, read-only) to
// re-derive the exact same 49-replay Gap subset, plus buildStateGraph/
// pairCountOf for the richer per-replay structural features this Sprint's
// own STEP1 additionally requires (exact Pair count, exact cycle-length
// multiset, exact Swap/Conflict edge counts -- FailureTaxonomy.ts only
// kept capped/bucketed versions of some of these for report readability).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { buildCapabilityMatrix, type MatrixRow } from "../solverPrimitiveResearch/PrimitiveCapabilityMatrix";

export interface GapReplayFeatures {
  hash: string;
  wrongWingCount: number;
  pairCount: number;
  parity: boolean;
  cycleCount: number;
  cycleLengths: number[];
  maxCycleLength: number;
  swapEdgeCount: number;
  conflictEdgeCount: number;
  cycleEdgeCount: number;
  coarseShape: string;
  clusterKey: string;
}

function extractFeatures(hash: string, cubies: ReturnType<typeof deserializeCube>): GapReplayFeatures {
  const graph = buildStateGraph(cubies);
  const cycleLengths = graph.cycles.map((c) => c.length).sort((a, b) => a - b);
  let swapEdgeCount = 0;
  let conflictEdgeCount = 0;
  let cycleEdgeCount = 0;
  for (const e of graph.edges) {
    if (e.type === "SWAP") swapEdgeCount++;
    else if (e.type === "CYCLE") cycleEdgeCount++;
    else conflictEdgeCount++;
  }
  const wrongWingCount = wrongWingCount5(cubies);
  const parity = hasParity(cubies);

  return {
    hash,
    wrongWingCount,
    pairCount: pairCountOf(cubies),
    parity,
    cycleCount: cycleLengths.length,
    cycleLengths,
    maxCycleLength: cycleLengths.length ? Math.max(...cycleLengths) : 0,
    swapEdgeCount,
    conflictEdgeCount,
    cycleEdgeCount,
    coarseShape: computeCoarseShapeKey(cubies),
    clusterKey: `w${wrongWingCount}|p${parity ? 1 : 0}`,
  };
}

export interface GapStructuralData {
  matrix: MatrixRow[];
  allFeatures: GapReplayFeatures[]; // whole 150-replay Dataset, for baseline comparison
  gapFeatures: GapReplayFeatures[]; // the 49-replay Gap subset
}

export function collectGapStructuralData(failuresDbPath: string): GapStructuralData {
  const all150 = loadAll75(failuresDbPath);
  const matrix = buildCapabilityMatrix(failuresDbPath);
  const gapHashes = new Set(matrix.filter((r) => !r.anySucceeded).map((r) => r.hash));

  const allFeatures = all150.map((s) => extractFeatures(s.hash, deserializeCube(s.cubeState)));
  const gapFeatures = allFeatures.filter((f) => gapHashes.has(f.hash));

  return { matrix, allFeatures, gapFeatures };
}

export interface BucketOverRepresentation {
  axis: string;
  bucket: string;
  gapCount: number;
  gapShare: number; // gapCount / gapTotal
  datasetCount: number;
  datasetShare: number; // datasetCount / datasetTotal
  overRepresentationRatio: number; // gapShare / datasetShare, >1 = over-represented in Gap
}

function bucketed<T>(items: readonly T[], keyOf: (t: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = keyOf(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function overRepresentationFor(axis: string, gapKeyOf: (f: GapReplayFeatures) => string, gap: readonly GapReplayFeatures[], dataset: readonly GapReplayFeatures[]): BucketOverRepresentation[] {
  const gapCounts = bucketed(gap, gapKeyOf);
  const datasetCounts = bucketed(dataset, gapKeyOf);
  const gapTotal = gap.length;
  const datasetTotal = dataset.length;

  return [...gapCounts.entries()]
    .map(([bucket, gapCount]) => {
      const datasetCount = datasetCounts.get(bucket) ?? 0;
      const gapShare = gapTotal ? gapCount / gapTotal : 0;
      const datasetShare = datasetTotal ? datasetCount / datasetTotal : 0;
      return { axis, bucket, gapCount, gapShare, datasetCount, datasetShare, overRepresentationRatio: datasetShare > 0 ? gapShare / datasetShare : gapCount > 0 ? Infinity : 0 };
    })
    .sort((a, b) => b.overRepresentationRatio - a.overRepresentationRatio || b.gapCount - a.gapCount);
}

function bucket3(n: number): string {
  const lo = Math.floor(n / 3) * 3;
  return `${lo}-${lo + 2}`;
}

export interface GapStructuralReport {
  gapTotal: number;
  datasetTotal: number;
  byAxis: Record<string, BucketOverRepresentation[]>;
  topOverRepresented: BucketOverRepresentation[]; // strongest signals across ALL axes, gapCount>=3 to avoid noise from tiny buckets
}

const MIN_GAP_COUNT_FOR_SIGNAL = 3; // a bucket with 1-2 Gap replays can't support a "repeating structure" claim

export function analyzeGapStructure(data: GapStructuralData): GapStructuralReport {
  const { gapFeatures, allFeatures } = data;

  const byAxis: Record<string, BucketOverRepresentation[]> = {
    WrongWing: overRepresentationFor("WrongWing", (f) => bucket3(f.wrongWingCount), gapFeatures, allFeatures),
    Pair: overRepresentationFor("Pair", (f) => bucket3(f.pairCount), gapFeatures, allFeatures),
    Cycle: overRepresentationFor("Cycle", (f) => `count=${Math.min(f.cycleCount, 3)}`, gapFeatures, allFeatures),
    Conflict: overRepresentationFor("Conflict", (f) => `count=${Math.min(f.conflictEdgeCount, 3)}`, gapFeatures, allFeatures),
    Swap: overRepresentationFor("Swap", (f) => `count=${Math.min(f.swapEdgeCount, 3)}`, gapFeatures, allFeatures),
    CoarseShape: overRepresentationFor("CoarseShape", (f) => f.coarseShape, gapFeatures, allFeatures),
    Cluster: overRepresentationFor("Cluster", (f) => f.clusterKey, gapFeatures, allFeatures),
  };

  const topOverRepresented = Object.values(byAxis)
    .flat()
    .filter((b) => b.gapCount >= MIN_GAP_COUNT_FOR_SIGNAL && isFinite(b.overRepresentationRatio))
    .sort((a, b) => b.overRepresentationRatio - a.overRepresentationRatio)
    .slice(0, 10);

  return { gapTotal: gapFeatures.length, datasetTotal: allFeatures.length, byAxis, topOverRepresented };
}
