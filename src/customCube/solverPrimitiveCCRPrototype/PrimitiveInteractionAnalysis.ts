// --- PrimitiveInteractionAnalysis (CCR Prototype Sprint v1) ----------------
// STEP6. Reuses the SAME RunRecord data STEP5 already collected (no new
// probing) -- just a different aggregation, by majority vote per hash
// across the N runs, using RawDataCollector.ts's own `candidateSource`
// field (which of REPAIR/CCR actually produced the successful candidate
// per replay). Verifies CCR is a genuinely NEW capability, not a
// duplicate of what REPAIR already does: REPAIR's Gate (cycleLength 2~4)
// and CCR's Gate (cycleLength 5~6, conflictEdgeCount=0) are disjoint by
// construction (Blueprint section 7), so Duplicate Success is EXPECTED
// to measure 0 -- this Sprint verifies that expectation empirically
// rather than assuming it.
import type { RunRecord } from "./RawDataCollector";

export interface InteractionSummary {
  totalHashes: number;
  repairMajoritySuccessCount: number; // hashes where REPAIR succeeded in a majority of runs
  ccrMajoritySuccessCount: number; // hashes where CCR succeeded in a majority of runs
  duplicateSuccessCount: number; // hashes where BOTH majority-succeed -- expected 0 given disjoint Gates
  repairExclusiveCount: number; // REPAIR majority-succeeds, CCR does not
  ccrExclusiveCount: number; // CCR majority-succeeds, REPAIR does not -- CCR's own genuinely new contribution
}

export function analyzeInteraction(runs: readonly RunRecord[]): InteractionSummary {
  const nRuns = runs.length;
  const hashes = runs[0].map((r) => r.hash);

  const repairSuccessCount = new Map<string, number>();
  const ccrSuccessCount = new Map<string, number>();
  for (const run of runs) {
    for (const r of run) {
      if (r.candidateSucceeded && r.candidateSource === "REPAIR") repairSuccessCount.set(r.hash, (repairSuccessCount.get(r.hash) ?? 0) + 1);
      if (r.candidateSucceeded && r.candidateSource === "CCR") ccrSuccessCount.set(r.hash, (ccrSuccessCount.get(r.hash) ?? 0) + 1);
    }
  }

  let repairMajoritySuccessCount = 0;
  let ccrMajoritySuccessCount = 0;
  let duplicateSuccessCount = 0;
  let repairExclusiveCount = 0;
  let ccrExclusiveCount = 0;

  for (const hash of hashes) {
    const repairMajority = (repairSuccessCount.get(hash) ?? 0) > nRuns / 2;
    const ccrMajority = (ccrSuccessCount.get(hash) ?? 0) > nRuns / 2;
    if (repairMajority) repairMajoritySuccessCount++;
    if (ccrMajority) ccrMajoritySuccessCount++;
    if (repairMajority && ccrMajority) duplicateSuccessCount++;
    if (repairMajority && !ccrMajority) repairExclusiveCount++;
    if (ccrMajority && !repairMajority) ccrExclusiveCount++;
  }

  return {
    totalHashes: hashes.length,
    repairMajoritySuccessCount,
    ccrMajoritySuccessCount,
    duplicateSuccessCount,
    repairExclusiveCount,
    ccrExclusiveCount,
  };
}
