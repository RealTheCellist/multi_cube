// --- FailureCluster (Failure Analysis Engine v1) ----------------------------
// Groups failure snapshots that likely share the SAME underlying missing
// capability, so a human doesn't have to eyeball hundreds of individual
// residuals one at a time. Grouping key follows spec section
// "FailureCluster" (WrongWing / Parity / Pair Layout / Edge Distribution --
// "Center Pattern" is omitted: this solver phase's own FailureSnapshot
// doesn't track center state at all, wing-pairing residuals are defined
// entirely by wing/true-edge slots, see fiveByFiveEdgeStateHash.ts's own
// same omission for the identical reason).
import type { FailureCluster, FailureSnapshot } from "./failureTypes";

// Which SPECIFIC 12 slots are still stuck is largely an artifact of which
// random scramble produced this residual, not a signal about what kind of
// case it is -- keying on the exact slot set (tried first) fragmented 75
// real collected failures into 72 near-singleton clusters, which isn't
// "사람이 새 Primitive가 필요한 영역을 쉽게 찾을 수 있도록" at all. WrongWing
// count + parity alone is what the spec's own worked example clusters by
// ("Cluster 7, 32건, WrongWing 6, Parity 없음") and groups genuinely
// comparable cases together regardless of which exact slots a given
// scramble happened to leave stuck.
function clusterKey(s: FailureSnapshot): string {
  return `w${s.wrongWingCount}|p${s.parity ? 1 : 0}`;
}

export function clusterFailures(snapshots: readonly FailureSnapshot[]): FailureCluster[] {
  const groups = new Map<string, FailureSnapshot[]>();
  for (const s of snapshots) {
    const key = clusterKey(s);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const clusters: FailureCluster[] = [];
  let id = 1;
  for (const [key, list] of groups) {
    const wrongWingCounts = new Set(list.map((s) => s.wrongWingCount));
    const parities = new Set(list.map((s) => s.parity));
    clusters.push({
      id: id++,
      key,
      size: list.length,
      hashes: list.map((s) => s.hash),
      commonWrongWingCount: wrongWingCounts.size === 1 ? [...wrongWingCounts][0] : null,
      commonParity: parities.size === 1 ? [...parities][0] : null,
      description: `wrongWing=${list[0].wrongWingCount}, parity=${list[0].parity ? "있음" : "없음"}, 정체 슬롯 ${list[0].remainingEdges.length}개`,
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}
