// --- PolicyNormalizer (Policy Generalization Sprint v1) ---------------------
// Step 4 of spec section 6: "Cluster별 Policy 생성". The extraction
// algorithm (freely chosen, documented here per this whole session's
// "계산식은 자유롭게 정의하되 문서화한다" convention):
//
// At each position (0, 1, 2, ...), tally which Primitive each STILL-ALIVE
// REPLAY demonstrates at that position -- one vote per DISTINCT REPLAY, not
// per Goal Candidate. This matters: a single replay's own BFS branching in
// Architecture Evolution Sprint v1 can produce many nested candidates
// (`BASE`, `BASE>BASE`, `BASE>BASE>BASE`, ...) that would otherwise flood
// the tally with duplicate "votes" from one replay's own depth, drowning
// out genuine agreement between DIFFERENT replays. A replay that
// demonstrates more than one Primitive at a position (e.g. both a `BASE`
// and a `PARITY` candidate straight from its own root) votes for BOTH --
// it isn't forced to pick a favorite.
//
// The Policy extends past a position only if a STRICT majority (> half) of
// the replays that were even still able to vote at that position agree on
// the same next Primitive; otherwise extraction stops there. A replay that
// has run out of sequence (its own discovered chain was shorter) simply
// stops contributing votes -- it does not count as "opposing" further
// extension.
import type { GoalCluster } from "./GoalClusterer";
import type { GoalPrimitiveName, NormalizedGoalRecord, Policy } from "./PolicyTypes";

const MAX_POLICY_LENGTH = 6; // generous upper bound; real data has never needed more than a couple of steps

export function normalizeCluster(cluster: GoalCluster): Policy | null {
  let aliveByReplay = new Map<string, NormalizedGoalRecord[]>();
  for (const r of cluster.records) {
    const list = aliveByReplay.get(r.sourceReplayHash) ?? [];
    list.push(r);
    aliveByReplay.set(r.sourceReplayHash, list);
  }

  const sequence: GoalPrimitiveName[] = [];
  const agreementCounts: number[] = [];
  const votingReplayCounts: number[] = [];

  for (let pos = 0; pos < MAX_POLICY_LENGTH; pos++) {
    const votesFor = new Map<GoalPrimitiveName, Set<string>>();
    for (const [replayHash, records] of aliveByReplay) {
      const primitivesHere = new Set(records.filter((r) => r.primitiveSequence.length > pos).map((r) => r.primitiveSequence[pos]));
      for (const p of primitivesHere) {
        if (!votesFor.has(p)) votesFor.set(p, new Set());
        votesFor.get(p)!.add(replayHash);
      }
    }
    if (votesFor.size === 0) break; // no alive replay has anything left to say at this position

    const votingReplays = new Set<string>();
    for (const replays of votesFor.values()) for (const r of replays) votingReplays.add(r);
    const totalVoting = votingReplays.size;

    let bestPrimitive: GoalPrimitiveName | null = null;
    let bestCount = 0;
    for (const [p, replays] of votesFor) {
      if (replays.size > bestCount) {
        bestPrimitive = p;
        bestCount = replays.size;
      }
    }
    if (!bestPrimitive || bestCount <= totalVoting / 2) break; // no STRICT majority -- stop extending

    sequence.push(bestPrimitive);
    agreementCounts.push(bestCount);
    votingReplayCounts.push(totalVoting);

    const supportingReplays = votesFor.get(bestPrimitive)!;
    const nextAlive = new Map<string, NormalizedGoalRecord[]>();
    for (const [replayHash, records] of aliveByReplay) {
      if (!supportingReplays.has(replayHash)) continue;
      nextAlive.set(
        replayHash,
        records.filter((r) => r.primitiveSequence[pos] === bestPrimitive)
      );
    }
    aliveByReplay = nextAlive;
  }

  if (sequence.length === 0) return null; // no majority even at the first step -- no Policy for this state

  return {
    stateSignature: cluster.stateSignature,
    primitiveSequence: sequence,
    supportCount: agreementCounts[0],
    agreementCounts,
    votingReplayCounts,
  };
}

export function normalizeAllClusters(clusters: readonly GoalCluster[]): Policy[] {
  const policies: Policy[] = [];
  for (const cluster of clusters) {
    const policy = normalizeCluster(cluster);
    if (policy) policies.push(policy);
  }
  return policies;
}
