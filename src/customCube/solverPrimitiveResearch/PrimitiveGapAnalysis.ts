// --- PrimitiveGapAnalysis (Solver Primitive Capability Analysis Sprint
// v1) -------------------------------------------------------------------
// STEP4: extracts the COMMON FAILURE region -- replays where ALL 5
// allowed Primitives fail (STEP1 matrix's anySucceeded===false) -- and
// asks the decisive question for Q3/Q4: is this Gap a describable,
// coherent pattern (worth designing a targeted new Primitive for), or
// scattered noise with no common structure (where a single new Primitive
// couldn't plausibly help)? Operationalized by comparing the Gap subset's
// OWN Coarse Shape reentry rate (STEP3's coarseShape field) against the
// WHOLE Dataset's reentry rate on the exact same key, computed fresh here
// for an apples-to-apples, same-run comparison.
import type { MatrixRow } from "./PrimitiveCapabilityMatrix";
import type { TaxonomyFeatures } from "./FailureTaxonomy";

function reentryRateOf(keys: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const multiMember = keys.filter((k) => (counts.get(k) ?? 0) >= 2).length;
  return keys.length ? multiMember / keys.length : 0;
}

export interface GroupCount {
  key: string;
  count: number;
}

export interface GapAnalysisResult {
  totalReplays: number;
  gapCount: number;
  gapRate: number;
  gapWrongWingAvg: number;
  gapWrongWingRange: [number, number];
  gapParityRate: number;
  gapCoarseShapeGroupCount: number;
  gapCoarseShapeReentryRate: number;
  datasetCoarseShapeReentryRate: number; // whole 150-replay baseline, same key, computed fresh in this same run
  gapClusterGroupCount: number;
  gapTopCoarseShapeGroups: GroupCount[];
  summary: string;
}

export function analyzeGap(matrix: readonly MatrixRow[], taxonomy: readonly TaxonomyFeatures[]): GapAnalysisResult {
  const taxByHash = new Map(taxonomy.map((t) => [t.hash, t]));
  const totalReplays = matrix.length;
  const gapRows = matrix.filter((r) => !r.anySucceeded);
  const gapTax = gapRows.map((r) => taxByHash.get(r.hash)).filter((t): t is TaxonomyFeatures => !!t);
  const gapCount = gapRows.length;
  const gapRate = totalReplays ? gapCount / totalReplays : 0;

  const wrongWings = gapTax.map((t) => t.wrongWingCount);
  const gapWrongWingAvg = wrongWings.length ? wrongWings.reduce((a, b) => a + b, 0) / wrongWings.length : 0;
  const gapWrongWingRange: [number, number] = wrongWings.length ? [Math.min(...wrongWings), Math.max(...wrongWings)] : [0, 0];
  const gapParityRate = gapTax.length ? gapTax.filter((t) => t.parity).length / gapTax.length : 0;

  const coarseCounts = new Map<string, number>();
  for (const t of gapTax) coarseCounts.set(t.coarseShape, (coarseCounts.get(t.coarseShape) ?? 0) + 1);
  const gapTopCoarseShapeGroups: GroupCount[] = [...coarseCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const clusterCounts = new Set(gapTax.map((t) => t.clusterKey));

  const gapCoarseShapeReentryRate = reentryRateOf(gapTax.map((t) => t.coarseShape));
  const datasetCoarseShapeReentryRate = reentryRateOf(taxonomy.map((t) => t.coarseShape));

  const summary =
    `공통 실패(5개 Primitive 전부 실패) ${gapCount}/${totalReplays}건(${(gapRate * 100).toFixed(1)}%). ` +
    `평균 WrongWing=${gapWrongWingAvg.toFixed(1)}(범위 ${gapWrongWingRange[0]}-${gapWrongWingRange[1]}), Parity 비율=${(gapParityRate * 100).toFixed(1)}%. ` +
    `이 부분집합의 Coarse Shape 재등장률=${(gapCoarseShapeReentryRate * 100).toFixed(1)}% (전체 Dataset 기준 재등장률=${(datasetCoarseShapeReentryRate * 100).toFixed(1)}%) -- ` +
    `${gapCoarseShapeReentryRate >= datasetCoarseShapeReentryRate * 0.5 ? "흩어진 잡음이 아니라 서술 가능한 공통 구조가 존재한다." : "전체 Dataset보다 뚜렷하게 흩어져 있어 단일 패턴으로 서술하기 어렵다."}`;

  return {
    totalReplays,
    gapCount,
    gapRate,
    gapWrongWingAvg,
    gapWrongWingRange,
    gapParityRate,
    gapCoarseShapeGroupCount: coarseCounts.size,
    gapCoarseShapeReentryRate,
    datasetCoarseShapeReentryRate,
    gapClusterGroupCount: clusterCounts.size,
    gapTopCoarseShapeGroups,
    summary,
  };
}
