// --- StructuralReporter (Solver v2 Primitive Prototype Sprint v1) --------
// STEP 5: formats the per-Cycle structural outcome (succeeded/failed/why)
// and the aggregate Benchmark comparison. Verdict logic stays in the
// driver, matching this whole series' convention.
import type { BenchmarkSummary } from "./ReplayBenchmark";

export interface CycleOutcomeRecord {
  hash: string;
  cycleLength: number | null;
  succeeded: boolean;
  failureReason: string | null; // "no chaseable cycle" | "no leaf net-improved" | ...
  leavesExplored: number;
  timeMs: number;
}

export function formatCycleOutcomes(records: readonly CycleOutcomeRecord[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const succeeded = records.filter((r) => r.succeeded);
  const failed = records.filter((r) => !r.succeeded);

  push(`--- 성공한 Cycle (${succeeded.length}건) ---`);
  for (const r of succeeded) push(`  ${r.hash}  cycleLength=${r.cycleLength}  leaves=${r.leavesExplored}  time=${r.timeMs}ms`);
  push();
  push(`--- 실패한 Cycle (${failed.length}건) ---`);
  for (const r of failed) push(`  ${r.hash}  cycleLength=${r.cycleLength ?? "없음"}  이유=${r.failureReason}  leaves=${r.leavesExplored}  time=${r.timeMs}ms`);

  return lines;
}

export function formatComparisonTable(summaries: readonly BenchmarkSummary[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- CycleChase vs Bounded Multi-Cycle Resolver ---");
  for (const s of summaries) {
    push(`[${s.label}]`);
    push(`  Coverage: ${(s.coverage * 100).toFixed(1)}% (${s.activatedCount}/${s.totalTested})`);
    push(`  WrongWing 개선 건수: ${s.improvedCount}`);
    push(`  Regression (활성화된 것 중): ${(s.regressionRateAmongActivated * 100).toFixed(1)}% (${s.regressionCount}/${s.activatedCount || 0})`);
    push(`  평균 WrongWing 변화: ${s.avgWrongWingDelta.toFixed(2)}`);
    push(`  평균 Pair 변화: ${s.avgPairDelta.toFixed(2)}`);
    push(`  평균 시간: ${s.avgTimeMs.toFixed(1)}ms`);
    push();
  }
  return lines;
}
