// --- RegressionTrend (Solver Long-term Reliability Validation Sprint v1,
// STEP3) ----------------------------------------------------------------
// Compares the two independent real population replays (run1, run2) case
// by case. "Regression" here means the SAME case flips from
// improved/solved in one run to not-improved/not-solved in the other,
// under IDENTICAL code and identical production defaults -- i.e. pure
// run-to-run non-determinism, not a code change (there was none between
// the two runs).
import type { ReplayRow } from "./PopulationReplay";

export interface RegressionTrendRow {
  label: string;
  run1Improved: boolean;
  run2Improved: boolean;
  run1Solved: boolean;
  run2Solved: boolean;
  flips: boolean;
}

export interface RegressionTrendResult {
  rows: RegressionTrendRow[];
  run1ImprovedCount: number;
  run2ImprovedCount: number;
  run1SolvedCount: number;
  run2SolvedCount: number;
  flipCount: number;
  flipRate: number;
}

export function buildRegressionTrend(run1: readonly ReplayRow[], run2: readonly ReplayRow[]): RegressionTrendResult {
  const run2ByLabel = new Map(run2.map((r) => [r.label, r]));
  const rows: RegressionTrendRow[] = run1.map((r1) => {
    const r2 = run2ByLabel.get(r1.label);
    const run1Improved = r1.result.improved;
    const run2Improved = r2?.result.improved ?? false;
    const run1Solved = r1.result.solved;
    const run2Solved = r2?.result.solved ?? false;
    return { label: r1.label, run1Improved, run2Improved, run1Solved, run2Solved, flips: run1Improved !== run2Improved || run1Solved !== run2Solved };
  });

  const flipCount = rows.filter((r) => r.flips).length;

  return {
    rows,
    run1ImprovedCount: run1.filter((r) => r.result.improved).length,
    run2ImprovedCount: run2.filter((r) => r.result.improved).length,
    run1SolvedCount: run1.filter((r) => r.result.solved).length,
    run2SolvedCount: run2.filter((r) => r.result.solved).length,
    flipCount,
    flipRate: rows.length > 0 ? flipCount / rows.length : 0,
  };
}
