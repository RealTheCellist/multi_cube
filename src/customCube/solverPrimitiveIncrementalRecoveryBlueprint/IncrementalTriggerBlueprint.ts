// --- IncrementalTriggerBlueprint (Incremental Recovery Blueprint Sprint
// v1) ----------------------------------------------------------------------
// STEP2. Compares 4 candidate triggers for WHEN an Incremental Recovery
// attempt should fire during the PAIR phase, using STEP1's own real
// population (PairFailurePopulationAnalysis.ts, unmodified) -- pure
// filter/aggregation logic, no new production hooks.
import type { PairFailureRecord } from "./PairFailurePopulationAnalysis";

export type TriggerId = "allNoProgress" | "consecutiveNoProgress" | "thresholdBased" | "featureBased";

export interface TriggerEvaluation {
  id: TriggerId;
  label: string;
  matchedRecords: number;
  totalRecords: number;
  coverageRate: number; // matchedRecords / totalRecords
  uniqueSnapshotsTriggered: number;
  gateEligibleAmongMatched: number; // how many matched records are ALSO CCR/REPAIR Gate-eligible -- the population where firing here could resolve the SAME structural issue ENDGAME's own Recovery would otherwise (redundantly) attempt later
  gateEligibleOverlapRate: number;
}

function evaluate(id: TriggerId, label: string, records: readonly PairFailureRecord[], matches: (r: PairFailureRecord, indexInHash: number, allForHash: PairFailureRecord[]) => boolean): TriggerEvaluation {
  const byHash = new Map<string, PairFailureRecord[]>();
  for (const r of records) {
    const list = byHash.get(r.hash) ?? [];
    list.push(r);
    byHash.set(r.hash, list);
  }

  const matchedRecords: PairFailureRecord[] = [];
  const triggeredHashes = new Set<string>();
  for (const [hash, list] of byHash) {
    list.forEach((r, i) => {
      if (matches(r, i, list)) {
        matchedRecords.push(r);
        triggeredHashes.add(hash);
      }
    });
  }

  const gateEligibleAmongMatched = matchedRecords.filter((r) => r.ccrGateEligible || r.repairGateEligible).length;

  return {
    id,
    label,
    matchedRecords: matchedRecords.length,
    totalRecords: records.length,
    coverageRate: records.length ? matchedRecords.length / records.length : 0,
    uniqueSnapshotsTriggered: triggeredHashes.size,
    gateEligibleAmongMatched,
    gateEligibleOverlapRate: matchedRecords.length ? gateEligibleAmongMatched / matchedRecords.length : 0,
  };
}

export function evaluateTriggers(records: readonly PairFailureRecord[]): TriggerEvaluation[] {
  return [
    evaluate("allNoProgress", "모든 no-progress (매 PAIR 실패마다 트리거)", records, () => true),
    evaluate(
      "consecutiveNoProgress",
      "연속 no-progress (같은 snapshot 안에서 2회 이상 연속 실패 시에만 트리거)",
      records,
      (_r, i) => i > 0, // fires on the 2nd+ consecutive failure within the same solve() call
    ),
    evaluate(
      "thresholdBased",
      "Threshold 기반 (wrongWingCount <= 15 -- '거의 다 왔는데 막힌' 상태만)",
      records,
      (r) => r.wrongWingCount <= 15,
    ),
    evaluate(
      "featureBased",
      "Feature 기반 (CCR 또는 REPAIR Gate가 이미 이 시점에 적합한 경우만)",
      records,
      (r) => r.ccrGateEligible || r.repairGateEligible,
    ),
  ];
}
