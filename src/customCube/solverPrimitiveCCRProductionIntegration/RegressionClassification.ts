// --- RegressionClassification (CCR Production Integration Sprint v1) ------
// STEP4. Majority-vote-per-hash classification (same discipline
// CCR Prototype Sprint v1's own PrimitiveInteractionAnalysis.ts already
// established) into the 7 categories the Work Order names.
import type { RunRecord } from "./RecoveryLevelCollector";

export interface RegressionSummary {
  totalHashes: number;
  trueRegressionCount: number; // baseline succeeded (majority) AND candidate regressed (majority) -- a genuine, consistent capability loss
  falseRegressionCount: number; // candidate regressed in a MINORITY of runs only -- noise (e.g. PARITY's own shuffle()-based randomness), not a consistent regression
  duplicateSuccessCount: number; // both REPAIR and CCR would succeed on the same snapshot (majority) -- expected 0, Gates are disjoint
  ccrOnlySuccessCount: number;
  repairOnlySuccessCount: number;
  ccrSkipCount: number; // CCR's own Gate never matched (majority) -- Recovery reached, CCR not eligible
  deferredRejectCount: number; // CCR Gate matched but Deferred Validation rejected (majority)
}

function majority(count: number, n: number): boolean {
  return count > n / 2;
}

export function classifyRegressions(runs: readonly RunRecord[]): RegressionSummary {
  const n = runs.length;
  const hashes = runs[0].map((r) => r.hash);

  const baselineSucceededCount = new Map<string, number>();
  const candidateRegressedCount = new Map<string, number>();
  const repairProbeSucceededCount = new Map<string, number>();
  const ccrProbeSucceededCount = new Map<string, number>();
  const ccrGateEligibleCount = new Map<string, number>();
  const ccrDeferredRejectedCount = new Map<string, number>();

  for (const run of runs) {
    for (const r of run) {
      if (r.baselineSucceeded) baselineSucceededCount.set(r.hash, (baselineSucceededCount.get(r.hash) ?? 0) + 1);
      if (r.candidateRegressed) candidateRegressedCount.set(r.hash, (candidateRegressedCount.get(r.hash) ?? 0) + 1);
      if (r.repairProbeSucceeded) repairProbeSucceededCount.set(r.hash, (repairProbeSucceededCount.get(r.hash) ?? 0) + 1);
      if (r.ccrProbeSucceeded) ccrProbeSucceededCount.set(r.hash, (ccrProbeSucceededCount.get(r.hash) ?? 0) + 1);
      if (r.ccrGateEligible) ccrGateEligibleCount.set(r.hash, (ccrGateEligibleCount.get(r.hash) ?? 0) + 1);
      if (r.ccrDeferredRejected) ccrDeferredRejectedCount.set(r.hash, (ccrDeferredRejectedCount.get(r.hash) ?? 0) + 1);
    }
  }

  let trueRegressionCount = 0;
  let falseRegressionCount = 0;
  let duplicateSuccessCount = 0;
  let ccrOnlySuccessCount = 0;
  let repairOnlySuccessCount = 0;
  let ccrSkipCount = 0;
  let deferredRejectCount = 0;

  for (const hash of hashes) {
    const baselineSucceededMajority = majority(baselineSucceededCount.get(hash) ?? 0, n);
    const candidateRegressedMajority = majority(candidateRegressedCount.get(hash) ?? 0, n);
    const candidateRegressedAtAll = (candidateRegressedCount.get(hash) ?? 0) > 0;
    const repairSucceededMajority = majority(repairProbeSucceededCount.get(hash) ?? 0, n);
    const ccrSucceededMajority = majority(ccrProbeSucceededCount.get(hash) ?? 0, n);
    const gateEligibleMajority = majority(ccrGateEligibleCount.get(hash) ?? 0, n);
    const deferredRejectedMajority = majority(ccrDeferredRejectedCount.get(hash) ?? 0, n);

    if (baselineSucceededMajority && candidateRegressedMajority) trueRegressionCount++;
    else if (candidateRegressedAtAll && !candidateRegressedMajority) falseRegressionCount++;

    if (repairSucceededMajority && ccrSucceededMajority) duplicateSuccessCount++;
    else if (ccrSucceededMajority) ccrOnlySuccessCount++;
    else if (repairSucceededMajority) repairOnlySuccessCount++;

    if (!gateEligibleMajority) ccrSkipCount++;
    if (deferredRejectedMajority) deferredRejectCount++;
  }

  return {
    totalHashes: hashes.length,
    trueRegressionCount,
    falseRegressionCount,
    duplicateSuccessCount,
    ccrOnlySuccessCount,
    repairOnlySuccessCount,
    ccrSkipCount,
    deferredRejectCount,
  };
}
