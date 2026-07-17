// --- ReportGenerator (Failure Analysis Engine v1) ---------------------------
import type { FailureSnapshot } from "./failureTypes";
import { clusterFailures } from "./failureCluster";
import { computeStatistics } from "./failureStatistics";
import { computeCoverage, computeHeatMap, renderHeatMapAscii } from "./primitiveCoverage";
import { recommendForAllClusters } from "./recommendation";

export function generateReport(snapshots: readonly FailureSnapshot[]): string {
  const clusters = clusterFailures(snapshots);
  const stats = computeStatistics(snapshots);
  const coverage = computeCoverage(snapshots);
  const heatMap = computeHeatMap(snapshots);
  const recommendations = recommendForAllClusters(clusters, snapshots);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("========================================");
  push("Failure Analysis Report -- 5x5x5 Edge Solver");
  push("========================================");
  push();
  push(`총 실패 수: ${stats.totalFailures}`);
  push(`Cluster: ${clusters.length}개`);
  if (clusters[0]) push(`가장 큰 Cluster: ${clusters[0].size}개 (#${clusters[0].id}, ${clusters[0].description})`);
  push();

  push("--- WrongWing 분포 ---");
  for (const [w, count] of Object.entries(stats.wrongWingDistribution).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    push(`  wrongWing=${w}: ${count}건`);
  }
  push();

  push("--- 통계 ---");
  push(`  Parity 발생률: ${stats.parityRate}%`);
  push(`  Recovery 시도 후 실패율: ${stats.recoveryFailureRate}%`);
  push(`  평균 Trace 길이: ${stats.averageTraceLength}`);
  push(`  평균 Recovery 시도 횟수: ${stats.averageRecoveryAttempts}`);
  push("  Primitive 사용 빈도:");
  for (const [p, count] of Object.entries(stats.primitiveUsageFrequency)) push(`    ${p}: ${count}`);
  push();

  push("--- Primitive Coverage ---");
  for (const [p, pct] of Object.entries(coverage.byPrimitivePercent)) {
    push(`  ${p.padEnd(10)} ${pct}% (${coverage.byPrimitive[p as keyof typeof coverage.byPrimitive]}건)`);
  }
  push(`  Unknown     ${coverage.unknownPercent}% (${coverage.unknownCount}건) <- 새 Primitive가 필요한 영역`);
  push();

  push("--- Heat Map (잔여 Wrong Wing이 몰리는 슬롯) ---");
  push(renderHeatMapAscii(heatMap));
  push();

  push("--- Cluster별 추천 (상위 10개) ---");
  for (const rec of recommendations.slice(0, 10)) {
    push(`Cluster ${rec.clusterId} (총 ${rec.size}건)`);
    push(`  공통 특징: ${rec.commonFeatures}`);
    push(`  추천: ${rec.recommendation}`);
    push();
  }

  return lines.join("\n");
}
