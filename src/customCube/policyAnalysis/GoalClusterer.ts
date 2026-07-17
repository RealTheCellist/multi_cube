// --- GoalClusterer (Policy Generalization Sprint v1) ------------------------
// Step 2/3 of spec section 6: "Primitive Sequence 정규화 -> Replay 공통
// Prefix 추출" starts with grouping by STATE (not by which Replay produced
// the record) -- the same `w{wrongWing}|p{0|1}` key vocabulary
// failureAnalysis/failureCluster.ts already established, so a Cluster here
// is directly comparable to a FailureCluster from earlier engines.
import type { NormalizedGoalRecord } from "./PolicyTypes";

export interface GoalCluster {
  stateSignature: string;
  records: NormalizedGoalRecord[];
  distinctReplayCount: number;
}

export function clusterByStateSignature(records: readonly NormalizedGoalRecord[]): GoalCluster[] {
  const groups = new Map<string, NormalizedGoalRecord[]>();
  for (const r of records) {
    const list = groups.get(r.stateSignature) ?? [];
    list.push(r);
    groups.set(r.stateSignature, list);
  }

  return [...groups.entries()]
    .map(([stateSignature, list]) => ({
      stateSignature,
      records: list,
      distinctReplayCount: new Set(list.map((r) => r.sourceReplayHash)).size,
    }))
    .sort((a, b) => b.distinctReplayCount - a.distinctReplayCount);
}
