// --- RuntimeDistribution (Solver Long-term Reliability Validation
// Sprint v1, STEP3) -------------------------------------------------------
import type { ReplayRow } from "./PopulationReplay";

export interface RuntimeDistributionSummary {
  n: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  deadlineMissCount: number; // real solve() E2E's own deadlineMissed flag
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function summarizeRuntimeDistribution(rows: readonly ReplayRow[]): RuntimeDistributionSummary {
  const sorted = [...rows.map((r) => r.runtimeMs)].sort((a, b) => a - b);
  const n = sorted.length;
  const meanMs = n > 0 ? sorted.reduce((s, v) => s + v, 0) / n : 0;
  return {
    n,
    meanMs,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: sorted[n - 1] ?? 0,
    deadlineMissCount: rows.filter((r) => r.result.deadlineMissed).length,
  };
}

// Gate B(Runtime 허용 범위)의 disclosed default tolerance -- Release
// Framework의 evaluateGateB()가 이미 쓰는 규칙(+15% of p95)을 그대로
// 재사용한 판정, Framework 자체는 수정하지 않는다.
export function checkRuntimeToleranceAgainstBaseline(baselineP95Ms: number, currentP95Ms: number, toleranceFactor = 1.15): { withinTolerance: boolean; thresholdMs: number } {
  const thresholdMs = baselineP95Ms * toleranceFactor;
  return { withinTolerance: currentP95Ms <= thresholdMs, thresholdMs };
}
