// --- CapabilityReportGenerator (Capability Analysis Engine v1) -------------
import { CAPABILITY_ROW_LABELS } from "./capabilityTypes";
import type { CapabilityAnalysisResult } from "./capabilityAnalysisEngine";

export function generateCapabilityReport(result: CapabilityAnalysisResult): string {
  const { summaries, candidates, mergedGroups, totalFailureCount } = result;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("========================================");
  push("Capability Analysis Report -- 5x5x5 Edge Solver");
  push("========================================");
  push();
  push(`총 Failure: ${totalFailureCount}`);
  push(`Cluster: ${summaries.length}`);
  push(`발견된 Capability Gap 종류: ${new Set(summaries.flatMap((s) => s.gap.missingCapabilities)).size}`);
  push();

  if (candidates[0]) {
    const top = candidates[0];
    push("--- 가장 부족한 Capability ---");
    push(`  ${top.name}`);
    push(`  영향 Cluster: ${top.affectedClusterIds.join(", ")}`);
    push(`  점유율: ${top.impactPercent}% (${top.affectedFailureCount}/${top.totalFailureCount}건)`);
    push(`  예상 WrongWing 감소: ~${top.expectedWrongWingReduction}`);
    push(`  추천 우선순위: ${"★".repeat(top.priorityStars)}${"☆".repeat(5 - top.priorityStars)}`);
    push();
  }

  push("--- Primitive Candidate 전체 ---");
  for (const c of candidates) {
    push(`${c.name}`);
    push(`  필요 Cluster: ${c.affectedClusterIds.join(", ")}`);
    push(`  영향도: ${c.impactPercent}% (${c.affectedFailureCount}/${c.totalFailureCount}건)`);
    push(`  예상 효과: WrongWing 평균 -> 약 ${c.expectedWrongWingReduction} 감소`);
    push(`  우선순위: ${"★".repeat(c.priorityStars)}${"☆".repeat(5 - c.priorityStars)}`);
    push();
  }

  if (mergedGroups.length > 0) {
    push("--- Capability 유사도로 병합된 Cluster 그룹 ---");
    for (const group of mergedGroups) {
      if (group.length < 2) continue;
      push(`  Cluster ${group.join(", ")} -- 유사한 Capability Gap (동일 Primitive로 해결 가능성)`);
    }
    push();
  }

  push("--- Cluster별 Capability Matrix (Gap 있는 것만, 상위 10개) ---");
  const withGap = summaries.filter((s) => s.gap.missingCapabilities.length > 0).sort((a, b) => b.cluster.size - a.cluster.size);
  for (const s of withGap.slice(0, 10)) {
    push(`Cluster ${s.cluster.id} -- WrongWing=${s.cluster.wrongWingCount}, Parity=${s.cluster.parity ? "있음" : "없음"} (${s.cluster.size}건)`);
    push(`  대표 샘플 hash: ${s.representativeHash} (Failure Replay로 즉시 재현 가능)`);
    push("  Capability Matrix:");
    const primitives = s.matrix.testResults.map((r) => r.primitive);
    push(`    ${"".padEnd(16)} ${primitives.map((p) => p.padEnd(9)).join("")}`);
    for (const row of Object.keys(s.matrix.rows) as (keyof typeof s.matrix.rows)[]) {
      const cells = primitives.map((p) => s.matrix.rows[row][p].padEnd(9)).join("");
      push(`    ${CAPABILITY_ROW_LABELS[row].padEnd(16)} ${cells}`);
    }
    push(`  부족한 Capability: ${s.gap.missingCapabilities.map((r) => CAPABILITY_ROW_LABELS[r]).join(", ")}`);
    push(`  신뢰도: ${s.gap.confidence}%`);
    push();
  }

  return lines.join("\n");
}
