// --- Research Report (Primitive Discovery Engine) ---------------------------
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { canonicalizeAll, clusterCanonicalEntries } from "./clusterAnalyzer";
import { analyzeAllGaps } from "./primitiveGapAnalyzer";
import { mineAllCases } from "./caseMiner";
import { suggestForAllClusters } from "./primitiveSuggestionGenerator";

export function generateResearchReport(snapshots: readonly FailureSnapshot[]): string {
  const byHash = new Map(snapshots.map((s) => [s.hash, s]));
  const canonicalEntries = canonicalizeAll(snapshots);
  const clusters = clusterCanonicalEntries(canonicalEntries);
  const gaps = analyzeAllGaps(clusters, byHash);
  const mined = mineAllCases(clusters);
  const suggestions = suggestForAllClusters(clusters, gaps);
  const unknownClusters = clusters.filter((_, i) => gaps[i].isUnknown);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("========================================");
  push("Primitive Discovery Research Report -- 5x5x5 Edge Solver");
  push("========================================");
  push();
  push(`실패 상태: ${snapshots.length}`);
  push(`Canonical (고유 구조): ${canonicalEntries.length}`);
  push(`Cluster (WrongWing+Parity 기준): ${clusters.length}`);
  push(`Unknown Primitive Cluster: ${unknownClusters.length}`);
  push();

  if (clusters[0]) {
    const top = clusters[0];
    const topGap = gaps[0];
    push("--- 가장 빈번한 실패 ---");
    push(`  WrongWing: ${top.wrongWingCount}`);
    push(`  Parity: ${top.parity ? "있음" : "없음"}`);
    push(`  건수: ${top.size} (Canonical ${top.canonicalCount}종)`);
    push(`  Recovery: ${topGap.entries.find((e) => e.primitive === "RECOVERY")?.status === "OK" ? "가능한 사례 있음" : "불가"}`);
    push(`  추천 Primitive: ${suggestions[0].suggestion}`);
    push();
  }

  push("--- Cluster별 상세 (상위 10개, 건수순) ---");
  for (let i = 0; i < Math.min(10, clusters.length); i++) {
    const c = clusters[i];
    const gap = gaps[i];
    const mine = mined[i];
    const suggestion = suggestions[i];
    push(`Cluster ${c.id} -- WrongWing=${c.wrongWingCount}, Parity=${c.parity ? "있음" : "없음"} (${c.size}건, Canonical ${c.canonicalCount}종)`);
    push(`  공통 특징: ${mine.commonFeatures}`);
    push(`  대표 샘플 hash: ${mine.representativeHash}`);
    push("  Primitive 적용 가능 여부:");
    for (const e of gap.entries) {
      const symbol = e.status === "OK" ? "○" : e.status === "FAIL" ? "×" : "?";
      push(`    ${e.primitive.padEnd(10)} ${symbol} (${e.status})`);
    }
    push(`  -> ${gap.isUnknown ? "Unknown -- 현재 Primitive로 도달 불가능 가능성 높음" : "기존 Primitive로 일부 커버됨"}`);
    push(`  추천: ${suggestion.suggestion}`);
    push();
  }

  return lines.join("\n");
}
