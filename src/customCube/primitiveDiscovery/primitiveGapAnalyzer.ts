// --- PrimitiveGapAnalyzer (Primitive Discovery Engine) ----------------------
// "가장 중요한 모듈" per spec: for each cluster, was any current Primitive
// EVER observed succeeding on a residual of this shape (OK), only ever seen
// failing (FAIL), or never even attempted (UNTESTED)? A cluster is "Unknown"
// (needs a new Primitive) only if NO current primitive shows OK anywhere
// across every member snapshot -- distinguishing "confirmed can't" from
// "never tried" matters because the spec's own goal is finding gaps in
// COVERAGE, not just re-confirming that the final stuck slots resisted
// whatever was tried on them (which is trivially true of every failure by
// definition, and wouldn't tell a human anything new).
//
// Reuses PrimitiveName from the existing Failure Analysis Engine rather
// than the spec's literal "BASE/FLIP/PARITY/CASE" list: this project's
// PARITY task type IS the case-library match (tryExactCaseMatch), so
// "PARITY" here already covers the spec's "CASE"; ENDGAME/RECOVERY are
// tracked as two additional real code paths beyond the spec's minimum 4,
// giving strictly more coverage information, not less.
import { slotToIndexReverse } from "../failureAnalysis/slotOrder";
import type { FailureSnapshot, PrimitiveAttempt, PrimitiveName } from "../failureAnalysis/failureTypes";
import type { DiscoveryCluster, GapAnalysis, PrimitiveGapEntry, PrimitiveGapStatus } from "./discoveryTypes";

const PRIMITIVES: PrimitiveName[] = ["BASE", "FLIP", "PARITY", "ENDGAME", "RECOVERY"];

/**
 * A FailureSnapshot's `primitiveAttempts` covers the WHOLE plan, including
 * every slot that got resolved just fine before the final stuck residual --
 * counting those as evidence "BASE works on this residual shape" would mark
 * almost every cluster as non-Unknown regardless of how genuinely stuck its
 * ACTUAL leftover slots are (measured directly: without this filter, all 22
 * clusters from the real 75-failure dataset showed BASE=OK and 0 were
 * flagged Unknown, which contradicts the fact that every one of these is a
 * genuine, already-confirmed failure). PARITY/ENDGAME/RECOVERY operate on
 * the whole residual as it stood at that point, not one named slot, so
 * they're always relevant; BASE/FLIP are slot-specific (their trace detail
 * starts with the slot key, e.g. "x-2,y-2 슬롯 wing 페어링: ...") and only
 * count if they targeted one of THIS snapshot's own still-stuck slots.
 */
function isRelevantAttempt(attempt: PrimitiveAttempt, snapshot: FailureSnapshot): boolean {
  if (attempt.primitive === "PARITY" || attempt.primitive === "ENDGAME" || attempt.primitive === "RECOVERY") return true;
  if (!attempt.detail) return false;
  const stuckSlotKeys = snapshot.remainingEdges.map(slotToIndexReverse);
  return stuckSlotKeys.some((slot) => attempt.detail!.startsWith(slot));
}

export function analyzeGap(cluster: DiscoveryCluster, byHash: Map<string, FailureSnapshot>): GapAnalysis {
  const entries: PrimitiveGapEntry[] = PRIMITIVES.map((primitive) => {
    let attempted = false;
    let succeeded = false;
    for (const hash of cluster.snapshotHashes) {
      const snapshot = byHash.get(hash);
      if (!snapshot) continue;
      for (const attempt of snapshot.primitiveAttempts) {
        if (attempt.primitive !== primitive) continue;
        if (!isRelevantAttempt(attempt, snapshot)) continue;
        attempted = true;
        if (attempt.succeeded) succeeded = true;
      }
    }
    const status: PrimitiveGapStatus = succeeded ? "OK" : attempted ? "FAIL" : "UNTESTED";
    return { primitive, status };
  });

  return {
    clusterId: cluster.id,
    entries,
    isUnknown: entries.every((e) => e.status !== "OK"),
  };
}

export function analyzeAllGaps(clusters: readonly DiscoveryCluster[], byHash: Map<string, FailureSnapshot>): GapAnalysis[] {
  return clusters.map((c) => analyzeGap(c, byHash));
}
