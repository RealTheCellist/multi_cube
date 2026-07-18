// --- StructuralReporter (Solver v2 Primitive Prototype Sprint v3) --------
// STEP 5: formats the Non-Parity Structural Fix success/failure breakdown +
// the required CycleChase/BP-1/BP-2/BP-3 comparison table (spec section 7).
// Verdict logic stays in the driver, matching this whole series' convention.
import type { SingleRunResult, BenchmarkSummary } from "./ReplayBenchmark";

export function formatNonParityOutcomes(results: readonly SingleRunResult[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const succeeded = results.filter((r) => r.activated && r.wrongWingAfter < r.wrongWingBefore);
  const failed = results.filter((r) => !(r.activated && r.wrongWingAfter < r.wrongWingBefore));

  push(`--- Non-Parity Structural Fix 성공 사례 (${succeeded.length}건) ---`);
  for (const r of succeeded) {
    push(`  ${r.hash}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  Pair ${r.pairBefore}->${r.pairAfter}  Parity ${r.parityBefore}->${r.parityAfter}  time=${r.timeMs}ms`);
  }
  push();
  push(`--- Non-Parity Structural Fix 실패 사례 (${failed.length}건) ---`);
  for (const r of failed) {
    const reason = !r.activated ? "구조적 후보 없음 또는 Deferred Validation 거부" : "적용됐으나 WrongWing 개선 없음";
    push(`  ${r.hash}  활성화=${r.activated}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  이유=${reason}`);
  }

  return lines;
}

export function formatComparisonTable(summaries: readonly BenchmarkSummary[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- CycleChase vs BP-1(Bounded) vs BP-2(Parity-Aware) vs BP-3(Non-Parity Structural) ---");
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

// Spec section 7's exact required table shape:
// | Primitive | Hard Gap 개선 | Coverage | Regression | 실행시간 |
export function formatRequiredSummaryTable(
  cycleChaseGap: BenchmarkSummary,
  bp1Gap: BenchmarkSummary,
  bp2Gap: BenchmarkSummary,
  bp3Gap: BenchmarkSummary,
): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const row = (label: string, s: BenchmarkSummary) =>
    push(`| ${label} | ${s.improvedCount}/${s.totalTested} | ${(s.coverage * 100).toFixed(1)}% | ${(s.regressionRateAmongActivated * 100).toFixed(1)}% | ${s.avgTimeMs.toFixed(1)}ms |`);

  push("| Primitive  | Hard Gap 개선 | Coverage | Regression | 실행시간 |");
  push("| ---------- | ----------- | -------- | ---------- | ---- |");
  row("CycleChase", cycleChaseGap);
  row("BP-1", bp1Gap);
  row("BP-2", bp2Gap);
  row("BP-3", bp3Gap);
  return lines;
}
