// --- ExperimentReport (Algorithm Experiment Framework v1) -------------------
import type { BenchmarkResult } from "./BenchmarkRunner";
import type { DeterminismCheckResult } from "./ExperimentRunner";

export interface ExperimentSummary {
  name: string;
  totalRuns: number;
  solvedCount: number;
  avgWrongWingAfter: number;
  avgPairAfter: number;
  avgMoveCount: number;
  avgElapsedMs: number;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function summarizeBenchmark(benchmark: BenchmarkResult): ExperimentSummary[] {
  const byName = new Map<string, { solved: number; wrongWingAfter: number[]; pairAfter: number[]; moves: number[]; elapsed: number[] }>();

  for (const contextResult of benchmark.results) {
    for (const outcome of contextResult.outcomes) {
      const entry = byName.get(outcome.experimentName) ?? { solved: 0, wrongWingAfter: [], pairAfter: [], moves: [], elapsed: [] };
      if (outcome.result.solved) entry.solved++;
      entry.wrongWingAfter.push(outcome.result.wrongWingAfter);
      entry.pairAfter.push(outcome.result.pairAfter);
      entry.moves.push(outcome.result.moveCount);
      entry.elapsed.push(outcome.result.elapsedMs);
      byName.set(outcome.experimentName, entry);
    }
  }

  return [...byName.entries()].map(([name, entry]) => ({
    name,
    totalRuns: entry.wrongWingAfter.length,
    solvedCount: entry.solved,
    avgWrongWingAfter: avg(entry.wrongWingAfter),
    avgPairAfter: avg(entry.pairAfter),
    avgMoveCount: avg(entry.moves),
    avgElapsedMs: avg(entry.elapsed),
  }));
}

export function generateReport(benchmark: BenchmarkResult, determinismChecks: DeterminismCheckResult[] = []): string {
  const summaries = summarizeBenchmark(benchmark);
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push("========================================");
  push("Algorithm Experiment Report -- 5x5x5 Edge Solver");
  push("========================================");
  push();
  push(`Replay Dataset 크기: ${benchmark.datasetSize}`);
  push();

  for (const s of summaries) {
    push(`Experiment`);
    push(`  ${s.name}`);
    push(`Solved`);
    push(`  ${s.solvedCount} / ${s.totalRuns}`);
    push(`Average WrongWing`);
    push(`  ${s.avgWrongWingAfter.toFixed(1)}`);
    push(`Average Pair`);
    push(`  ${s.avgPairAfter.toFixed(2)}`);
    push(`Average Moves`);
    push(`  ${s.avgMoveCount.toFixed(1)}`);
    push(`Average Time`);
    push(`  ${s.avgElapsedMs.toFixed(1)}ms`);
    push();
  }

  if (determinismChecks.length > 0) {
    push("--- 결정성 검증 ---");
    for (const check of determinismChecks) {
      push(`${check.experimentName}: ${check.deterministic ? "PASS (3회 동일)" : "FAIL (3회 결과 불일치 -- Framework 오류로 간주)"}`);
      if (!check.deterministic) {
        check.runs.forEach((r, i) => push(`  run${i + 1}: solved=${r.solved} wrongWingAfter=${r.wrongWingAfter} pairAfter=${r.pairAfter} moveCount=${r.moveCount}`));
      }
    }
    push();
  }

  return lines.join("\n");
}
