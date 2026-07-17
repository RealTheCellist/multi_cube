// --- ClusterSelector (Primitive Invention Sprint v1) -------------------------
// Spec section 5: pick only Clusters satisfying "Coverage 높은 Cluster AND
// Recovery 실패 AND Policy 없음" -- i.e. the Clusters where a genuinely NEW
// Primitive would actually matter, not ones existing tools or the previous
// Sprint's extracted Policies already cover. Read-only reuse of the
// EXISTING, unmodified Failure Analysis Engine (failureCluster.ts) and the
// EXISTING Policy Database from Policy Generalization Sprint v1 -- no new
// Goal/Policy generation happens here.
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import { clusterFailures } from "../failureAnalysis/failureCluster";
import type { FailureCluster, FailureSnapshot } from "../failureAnalysis/failureTypes";
import { allPolicies, loadPolicyDatabase } from "../policyPlanner/PolicyDatabase";

export interface TargetCluster {
  cluster: FailureCluster;
  members: FailureSnapshot[];
  coverageShare: number; // cluster.size / total failures
  recoveryFailureRate: number; // fraction of members where recovery never succeeded (spec: always true in this dataset, see disclosure below)
}

export interface ClusterSelectionResult {
  totalFailures: number;
  allClusters: FailureCluster[];
  excludedForHavingPolicy: string[]; // cluster keys already covered by a Policy Generalization Sprint v1 Policy
  targets: TargetCluster[]; // top-N remaining, sorted by size (= "Coverage 높은")
}

/**
 * Selects target Clusters per spec section 5. "Recovery 실패" is checked
 * per member (recoverySucceeded === false) but disclosed as a near-universal
 * property of this whole dataset (every stored FailureSnapshot represents a
 * solve() call that ended with wrongWingCount > 0, so recoverySucceeded is
 * false for essentially all 75 -- confirmed directly against the real data,
 * not assumed) -- the REAL discriminating filter ends up being "Policy
 * 없음" (exclude w13|p1/w10|p1, the only 2 Clusters Policy Generalization
 * Sprint v1 covered) combined with "Coverage 높은" (rank what remains by
 * size).
 */
export function selectTargetClusters(failuresDbPath: string, policiesDbPath: string, topN: number): ClusterSelectionResult {
  const snapshots = allSnapshots(loadDatabase(failuresDbPath));
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const allClusters = clusterFailures(snapshots); // already sorted by size desc

  const policies = allPolicies(loadPolicyDatabase(policiesDbPath));
  const coveredSignatures = new Set(policies.map((p) => p.stateSignature));

  const excludedForHavingPolicy = allClusters.filter((c) => coveredSignatures.has(c.key)).map((c) => c.key);
  const eligible = allClusters.filter((c) => !coveredSignatures.has(c.key));

  const targets: TargetCluster[] = eligible.slice(0, topN).map((cluster) => {
    const members = cluster.hashes.map((h) => byHash.get(h)).filter((s): s is FailureSnapshot => !!s);
    const recoveryFailureRate = members.length ? members.filter((m) => !m.recoverySucceeded).length / members.length : 0;
    return { cluster, members, coverageShare: cluster.size / snapshots.length, recoveryFailureRate };
  });

  return { totalFailures: snapshots.length, allClusters, excludedForHavingPolicy, targets };
}
