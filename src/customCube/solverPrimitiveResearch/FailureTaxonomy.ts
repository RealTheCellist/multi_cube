// --- FailureTaxonomy (Solver Primitive Capability Analysis Sprint v1) ----
// STEP3: classifies all 150 replays along the dimensions the work order
// names (Coarse Shape/WrongWing/Parity/Conflict/Cycle/Cluster -- "Hard
// Gap" itself is derived FROM the STEP1 matrix, not an independent
// taxonomy axis, so it's handled in STEP4/PrimitiveGapAnalysis.ts instead
// of here) and computes each Primitive's real success rate per bucket.
// Reuses buildStateGraph/wrongWingCount5/pairCountOf/hasParity/
// computeCoarseShapeKey -- all existing, unmodified.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { ALLOWED_PRIMITIVES, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import type { MatrixRow } from "./PrimitiveCapabilityMatrix";

export interface TaxonomyFeatures {
  hash: string;
  wrongWingCount: number;
  wrongWingBucket: string;
  parity: boolean;
  conflictEdgeCount: number;
  conflictBucket: string;
  cycleCount: number;
  cycleBucket: string;
  coarseShape: string;
  clusterKey: string; // GapDetector.ts's own pre-existing w{exact}|p{parity} axis
}

function bucket3(n: number): string {
  const lo = Math.floor(n / 3) * 3;
  return `${lo}-${lo + 2}`;
}

export function buildTaxonomy(failuresDbPath: string): TaxonomyFeatures[] {
  const all150 = loadAll75(failuresDbPath);

  return all150.map((snapshot) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const graph = buildStateGraph(cubies);
    let conflictEdgeCount = 0;
    for (const e of graph.edges) if (e.type === "CONFLICT") conflictEdgeCount++;
    const cycleCount = graph.cycles.length;
    const wrongWingCount = wrongWingCount5(cubies);
    const parity = hasParity(cubies);

    return {
      hash: snapshot.hash,
      wrongWingCount,
      wrongWingBucket: bucket3(wrongWingCount),
      parity,
      conflictEdgeCount,
      conflictBucket: String(Math.min(conflictEdgeCount, 3)),
      cycleCount,
      cycleBucket: String(Math.min(cycleCount, 3)),
      coarseShape: computeCoarseShapeKey(cubies),
      clusterKey: `w${wrongWingCount}|p${parity ? 1 : 0}`,
    };
  });
}

export interface TaxonomySuccessRate {
  dimension: string;
  bucket: string;
  totalReplays: number;
  primitiveSuccessRate: Record<AllowedPrimitive, number>;
  anySucceededRate: number;
}

function computeRatesFor(dimension: string, keyOf: (t: TaxonomyFeatures) => string, taxonomy: readonly TaxonomyFeatures[], matrixByHash: ReadonlyMap<string, MatrixRow>): TaxonomySuccessRate[] {
  const groups = new Map<string, TaxonomyFeatures[]>();
  for (const t of taxonomy) {
    const k = keyOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  return [...groups.entries()]
    .map(([bucket, members]) => {
      const rows = members.map((m) => matrixByHash.get(m.hash)).filter((r): r is MatrixRow => !!r);
      const primitiveSuccessRate = {} as Record<AllowedPrimitive, number>;
      for (const p of ALLOWED_PRIMITIVES) primitiveSuccessRate[p] = rows.length ? rows.filter((r) => r.success[p]).length / rows.length : 0;
      return {
        dimension,
        bucket,
        totalReplays: rows.length,
        primitiveSuccessRate,
        anySucceededRate: rows.length ? rows.filter((r) => r.anySucceeded).length / rows.length : 0,
      };
    })
    .sort((a, b) => b.totalReplays - a.totalReplays);
}

export function analyzeSuccessByTaxonomy(taxonomy: readonly TaxonomyFeatures[], matrix: readonly MatrixRow[]): TaxonomySuccessRate[] {
  const matrixByHash = new Map(matrix.map((r) => [r.hash, r]));
  return [
    ...computeRatesFor("WrongWing", (t) => t.wrongWingBucket, taxonomy, matrixByHash),
    ...computeRatesFor("Parity", (t) => `parity=${t.parity}`, taxonomy, matrixByHash),
    ...computeRatesFor("Conflict", (t) => `conflict>=${t.conflictBucket}`, taxonomy, matrixByHash),
    ...computeRatesFor("Cycle", (t) => `cycle>=${t.cycleBucket}`, taxonomy, matrixByHash),
  ];
}

// Coarse Shape/Cluster have far more unique buckets (81/25 on this
// Dataset) than the coarser dimensions above -- too many to usefully print
// per-bucket rates for all of them, so this returns only the largest N
// groups (still real, still computed over the FULL Dataset, just filtered
// for report readability).
export function topGroupSuccessRates(dimension: "CoarseShape" | "Cluster", taxonomy: readonly TaxonomyFeatures[], matrix: readonly MatrixRow[], topN: number): TaxonomySuccessRate[] {
  const matrixByHash = new Map(matrix.map((r) => [r.hash, r]));
  const keyOf = dimension === "CoarseShape" ? (t: TaxonomyFeatures) => t.coarseShape : (t: TaxonomyFeatures) => t.clusterKey;
  return computeRatesFor(dimension, keyOf, taxonomy, matrixByHash).slice(0, topN);
}
