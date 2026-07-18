// --- ShapeReporter (Solver v2 Primitive Prototype Sprint v4) -------------
// Formats: (a) Shape Database descriptive stats -- how concentrated or
// scattered the 75 real Replays' Shape Keys actually are, since that
// directly bounds how much leave-one-out evidence BP-4 can ever have per
// Replay; (b) the required 5-Primitive comparison table (spec section 7);
// (c) BP-4's own success/failure breakdown.
import type { ShapeDatabaseRow } from "./ShapeDatabaseBuilder";
import type { BenchmarkSummary, SingleRunResult } from "../solverV2PrototypeBP3/ReplayBenchmark";

export function formatShapeDatabaseStats(rows: readonly ShapeDatabaseRow[], hardGapHashes: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  const byShape = new Map<string, ShapeDatabaseRow[]>();
  for (const row of rows) {
    const list = byShape.get(row.shapeKey) ?? [];
    list.push(row);
    byShape.set(row.shapeKey, list);
  }

  const groupSizes = [...byShape.values()].map((g) => g.length);
  const singletonShapes = groupSizes.filter((n) => n === 1).length;
  const multiMemberShapes = groupSizes.filter((n) => n >= 2).length;

  let hardGapInSingleton = 0;
  let hardGapInMultiMember = 0;
  for (const [, members] of byShape) {
    const isSingleton = members.length === 1;
    for (const m of members) {
      if (!hardGapHashes.has(m.hash)) continue;
      if (isSingleton) hardGapInSingleton++;
      else hardGapInMultiMember++;
    }
  }

  push("--- Shape Database 통계 ---");
  push(`전체 Replay: ${rows.length}건, 고유 Shape: ${byShape.size}개`);
  push(`  Singleton Shape (멤버 1개, leave-one-out 시 훈련 증거 0건): ${singletonShapes}개`);
  push(`  Multi-member Shape (멤버 2개+): ${multiMemberShapes}개`);
  push(`Hard Gap Replay 중 Singleton Shape에 속함 (BP-4가 구조적으로 절대 도울 수 없음): ${hardGapInSingleton}건`);
  push(`Hard Gap Replay 중 Multi-member Shape에 속함 (BP-4가 원리적으로 도울 가능성 있음): ${hardGapInMultiMember}건`);
  push();
  return lines;
}

export function formatShapeOutcomes(results: readonly SingleRunResult[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const succeeded = results.filter((r) => r.activated && r.wrongWingAfter < r.wrongWingBefore);
  const failed = results.filter((r) => !(r.activated && r.wrongWingAfter < r.wrongWingBefore));

  push(`--- BP-4 (Cycle-Shape Lookup) 성공 사례 (${succeeded.length}건) ---`);
  for (const r of succeeded) {
    push(`  ${r.hash}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  Pair ${r.pairBefore}->${r.pairAfter}  time=${r.timeMs}ms`);
  }
  push();
  push(`--- BP-4 (Cycle-Shape Lookup) 실패 사례 (${failed.length}건) ---`);
  for (const r of failed) {
    const reason = !r.activated ? "Shape Lookup 실패 (증거 없음 또는 추천 Primitive 자체 거부)" : "적용됐으나 WrongWing 개선 없음";
    push(`  ${r.hash}  활성화=${r.activated}  WrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}  이유=${reason}`);
  }

  return lines;
}

// Spec section 7's exact required table shape:
// | Primitive | Hard Gap 개선 | Coverage | Regression | 실행시간 |
export function formatRequiredSummaryTable(summaries: {
  cycleChase: BenchmarkSummary;
  bp1: BenchmarkSummary;
  bp2: BenchmarkSummary;
  bp3: BenchmarkSummary;
  bp4: BenchmarkSummary;
}): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  const row = (label: string, s: BenchmarkSummary) =>
    push(`| ${label} | ${s.improvedCount}/${s.totalTested} | ${(s.coverage * 100).toFixed(1)}% | ${(s.regressionRateAmongActivated * 100).toFixed(1)}% | ${s.avgTimeMs.toFixed(1)}ms |`);

  push("| Primitive  | Hard Gap 개선 | Coverage | Regression | 실행시간 |");
  push("| ---------- | ----------: | -------: | ---------: | ---: |");
  row("CycleChase", summaries.cycleChase);
  row("BP-1", summaries.bp1);
  row("BP-2", summaries.bp2);
  row("BP-3", summaries.bp3);
  row("**BP-4**", summaries.bp4);
  return lines;
}

export function formatComparisonTable(summaries: readonly BenchmarkSummary[]): string[] {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("--- CycleChase vs BP-1 vs BP-2 vs BP-3 vs BP-4(Cycle-Shape Lookup) ---");
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
