// --- FeatureExplanatoryPower (Solver Primitive Blueprint Reanalysis
// Sprint v1) -------------------------------------------------------------
// STEP2/3: re-measures each Blueprint feature's real explanatory power
// against the actual Prototype success/failure outcomes (STEP1's own
// records) -- Pearson correlation with success (point-biserial, success
// treated as 0/1) and bucketed success rate per feature, exactly the same
// method this whole project has used throughout (solverRepresentationBlueprint/
// FeatureInventory.ts's own pearson()).
import type { NumericFeature, PrimitiveRunRecord } from "./SuccessFailureComparison";
import { NUMERIC_FEATURES } from "./SuccessFailureComparison";

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

export interface FeatureCorrelation {
  feature: NumericFeature;
  correlation: number; // with success (0/1)
}

export function computeFeatureCorrelations(records: readonly PrimitiveRunRecord[]): FeatureCorrelation[] {
  const successBinary = records.map((r) => (r.succeeded ? 1 : 0));
  return NUMERIC_FEATURES.map((feature) => ({
    feature,
    correlation: pearson(
      records.map((r) => r.features[feature] as number),
      successBinary,
    ),
  })).sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

export interface BucketSuccessRate {
  feature: NumericFeature;
  bucket: string;
  count: number;
  successCount: number;
  successRate: number;
}

// wrongWingCount/pairCount span a wide range (0-22ish) -- bucketed in 3s
// like every prior Sprint's own bucket3(); cycleCount/cycleLength/
// swapEdgeCount/cycleEdgeCount/conflictEdgeCount are small integers (0-6ish
// in this Dataset) -- reported at their EXACT value so STEP2's core
// discovery (cycleLength, not cycleCount, predicts success) is visible at
// full resolution, not smeared across a bucket.
const WIDE_RANGE_FEATURES = new Set<NumericFeature>(["wrongWingCount", "pairCount"]);

function bucketOf(feature: NumericFeature, value: number): string {
  if (WIDE_RANGE_FEATURES.has(feature)) {
    const lo = Math.floor(value / 3) * 3;
    return `${lo}-${lo + 2}`;
  }
  return String(value);
}

export function computeBucketSuccessRates(records: readonly PrimitiveRunRecord[]): BucketSuccessRate[] {
  const results: BucketSuccessRate[] = [];
  for (const feature of NUMERIC_FEATURES) {
    const groups = new Map<string, PrimitiveRunRecord[]>();
    for (const r of records) {
      const bucket = bucketOf(feature, r.features[feature] as number);
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket)!.push(r);
    }
    for (const [bucket, members] of groups.entries()) {
      const successCount = members.filter((r) => r.succeeded).length;
      results.push({ feature, bucket, count: members.length, successCount, successRate: members.length ? successCount / members.length : 0 });
    }
  }
  return results;
}
