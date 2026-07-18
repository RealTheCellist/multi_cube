// --- DatasetExpansionReport (Solver Failure Dataset Expansion Sprint v2) -
// Formats the BEFORE/AFTER distribution comparisons (Shape/Cluster/Hard
// Gap) required by spec section 9 items 3~5. Reuses histogramOf
// (solverDatasetResearch/DatasetBiasReport.ts, existing/unmodified).
import { histogramOf } from "../solverDatasetResearch/DatasetBiasReport";
import type { ReplayMetadata } from "./MetadataBuilder";

function bucket3(n: number): number {
  return Math.floor(n / 3);
}

export function formatShapeDistributionChange(before: readonly ReplayMetadata[], after: readonly ReplayMetadata[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const beforeHist = histogramOf(before, (m) => m.coarseShapeKey);
  const afterHist = histogramOf(after, (m) => m.coarseShapeKey);
  push(`Coarse Shape 고유 개수: ${beforeHist.length} -> ${afterHist.length}`);
  push(`  1건짜리(Singleton) Shape: ${beforeHist.filter((h) => h.count === 1).length} -> ${afterHist.filter((h) => h.count === 1).length}`);
  push(`  2건 이상 Shape: ${beforeHist.filter((h) => h.count >= 2).length} -> ${afterHist.filter((h) => h.count >= 2).length}`);
  const top = [...afterHist].sort((a, b) => b.count - a.count).slice(0, 5);
  push(`  가장 많이 재등장한 Shape (상위 5개): ${top.map((h) => `${h.bucketLabel}(${h.count}건)`).join(", ")}`);
  return lines;
}

export function formatClusterDistributionChange(before: readonly ReplayMetadata[], after: readonly ReplayMetadata[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const beforeHist = histogramOf(before, (m) => m.clusterKey);
  const afterHist = histogramOf(after, (m) => m.clusterKey);
  push(`Cluster(w|p) 고유 개수: ${beforeHist.length} -> ${afterHist.length}`);
  const beforeUnderrep = beforeHist.filter((h) => h.count <= 2).length;
  const afterUnderrep = afterHist.filter((h) => h.count <= 2).length;
  push(`  대표성 부족(2건 이하) Cluster: ${beforeUnderrep} -> ${afterUnderrep}`);
  return lines;
}

export function formatHardGapDistributionChange(before: readonly ReplayMetadata[], after: readonly ReplayMetadata[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const beforeHist = histogramOf(before, (m) => `${bucket3(m.wrongWingCount)}|${m.isHardGap}`);
  const afterHist = histogramOf(after, (m) => `${bucket3(m.wrongWingCount)}|${m.isHardGap}`);
  const beforeHardGapRate = before.length ? before.filter((m) => m.isHardGap).length / before.length : 0;
  const afterHardGapRate = after.length ? after.filter((m) => m.isHardGap).length / after.length : 0;
  push(`Hard Gap 비율: ${(beforeHardGapRate * 100).toFixed(1)}% -> ${(afterHardGapRate * 100).toFixed(1)}%`);
  push(`  WrongWing 구간 x Hard Gap 여부 고유 조합: ${beforeHist.length} -> ${afterHist.length}`);
  const beforeUnderrep = beforeHist.filter((h) => h.count <= 2).length;
  const afterUnderrep = afterHist.filter((h) => h.count <= 2).length;
  push(`  대표성 부족(2건 이하) 조합: ${beforeUnderrep} -> ${afterUnderrep}`);
  return lines;
}
