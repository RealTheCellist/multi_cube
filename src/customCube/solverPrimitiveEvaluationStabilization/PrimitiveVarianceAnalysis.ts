// --- PrimitiveVarianceAnalysis (Solver Primitive Evaluation Stabilization
// Sprint v1) -- STEP2: for EACH of the 5 existing Primitives individually
// (not just the aggregate "all 5 fail" Gap flag), measures across the
// same N raw runs: mean/stddev/coefficient-of-variation of its own
// per-run success COUNT (out of 150), and flipRate -- the fraction of
// replays where that Primitive's own success/failure classification is
// NOT unanimous across all N runs. This directly identifies WHICH
// Primitive(s) are the real noise source (this project has repeatedly
// disclosed BASE/RECOVERY as Math.random()-seeded, but never measured it
// this precisely per-Primitive before) rather than treating "the Gap
// definition is noisy" as an undifferentiated fact.
import type { RunRecord } from "./RawDataCollector";
import { computeStats, type SampleStats } from "./StatsUtil";
import type { AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const PRIMITIVES: AllowedPrimitive[] = ["BASE", "FLIP", "CASE", "PARITY", "BP1"];

export interface PrimitiveVarianceEntry {
  primitive: AllowedPrimitive;
  stats: SampleStats; // over per-run success count (out of totalReplays) across N runs
  flipRate: number; // fraction of replays whose classification is NOT unanimous across all N runs
}

export function analyzePrimitiveVariance(runs: readonly RunRecord[]): PrimitiveVarianceEntry[] {
  const hashes = runs[0].map((r) => r.hash);

  return PRIMITIVES.map((p) => {
    const perRunCount = runs.map((run) => run.filter((r) => r.primitiveSuccess[p]).length);
    const stats = computeStats(perRunCount);

    let flips = 0;
    for (const h of hashes) {
      const values = runs.map((run) => run.find((r) => r.hash === h)!.primitiveSuccess[p]);
      const allTrue = values.every((v) => v);
      const allFalse = values.every((v) => !v);
      if (!allTrue && !allFalse) flips++;
    }
    const flipRate = hashes.length ? flips / hashes.length : 0;

    return { primitive: p, stats, flipRate };
  });
}
