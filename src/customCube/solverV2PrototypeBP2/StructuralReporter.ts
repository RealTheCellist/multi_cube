// --- StructuralReporter (Solver v2 Primitive Prototype Sprint v2) --------
// STEP 5: formats the Parity success/failure breakdown + Cycle/WrongWing/
// Pair/Regression changes. Verdict logic stays in the driver, matching this
// whole series' convention.
import type { SingleRunResult, BenchmarkSummary } from "./ReplayBenchmark";

export function formatParityOutcomes(results: readonly SingleRunResult[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const succeeded = results.filter((r) => r.activated && r.wrongWingAfter < r.wrongWingBefore);
  const failed = results.filter((r) => !(r.activated && r.wrongWingAfter < r.wrongWingBefore));

  push(`--- Parity 성공 사례 (${succeeded.length}건) ---`);
  for (const r of succeeded) {
    push(`  ${r.hash}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  Pair ${r.pairBefore}->${r.pairAfter}  Parity ${r.parityBefore}->${r.parityAfter}  time=${r.timeMs}ms`);
  }
  push();
  push(`--- Parity 실패 사례 (${failed.length}건) ---`);
  for (const r of failed) {
    const reason = !r.activated ? "48개 Entry 전부 개선 없음 (Deferred Validation 거부)" : "적용됐으나 WrongWing 개선 없음";
    push(`  ${r.hash}  활성화=${r.activated}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  이유=${reason}`);
  }

  return lines;
}

export function formatComparisonTable(summaries: readonly BenchmarkSummary[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- CycleChase vs Bounded Multi-Cycle Resolver vs Parity-Aware Cycle Breaker ---");
  for (const s of summaries) {
    push(`[${s.label}]`);
    push(`  Coverage: ${(s.coverage * 100).toFixed(1)}% (${s.activatedCount}/${s.totalTested})`);
    push(`  WrongWing 개선 건수: ${s.improvedCount}`);
    push(`  Regression (활성화된 것 중): ${(s.regressionRateAmongActivated * 100).toFixed(1)}% (${s.regressionCount}/${s.activatedCount || 0})`);
    push(`  평균 WrongWing 변화: ${s.avgWrongWingDelta.toFixed(2)}`);
    push(`  평균 Pair 변화: ${s.avgPairDelta.toFixed(2)}`);
    push(`  Cycle/Pair 구조 보존율 (활성화된 것 중 Pair 유지+): ${(s.cycleStructurePreservedRate * 100).toFixed(1)}%`);
    push(`  평균 시간: ${s.avgTimeMs.toFixed(1)}ms`);
    push();
  }
  return lines;
}
