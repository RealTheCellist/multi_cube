// --- NoiseSourceDecomposition (Solver Primitive Evaluation Stabilization
// Sprint v2) -- STEP4: quantifies how much of the Gap Total's own
// run-to-run variance each of the 5 existing Primitives contributes, via
// a "freeze-one-out" counterfactual: for a given Primitive, recompute
// Gap Total per run using that Primitive's run-0 (first run's) success
// value FROZEN across every run, while every OTHER Primitive keeps its
// own real per-run value. If freezing a Primitive sharply reduces the
// resulting Gap Total variance vs the real (all-varying) Gap Total
// variance, that Primitive is a major contributor to the noise; if it
// barely changes anything, that Primitive wasn't contributing much
// variance to begin with. This is a purely POST-HOC recomputation over
// RunRecord's already-collected primitiveSuccess field (RawDataCollector.ts,
// UNMODIFIED) -- no new simulation of any Primitive's own internal
// behavior, no product code touched, "simulation 수준" exactly as the
// work order specifies. Not a rigorous ANOVA decomposition (contributions
// need not sum to 100%, since Primitives' variances can correlate or
// interact) -- disclosed as a simple, interpretable sensitivity analysis,
// consistent with this project's existing preference for simple, disclosed
// approximations over machinery this codebase doesn't otherwise use.
import type { RunRecord } from "./RawDataCollector";
import { computeStats, type SampleStats } from "./StatsUtil";
import type { AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const PRIMITIVES: AllowedPrimitive[] = ["BASE", "FLIP", "CASE", "PARITY", "BP1"];

function computeGapTotalsWithFrozen(runs: readonly RunRecord[], frozenPrimitive: AllowedPrimitive | null): number[] {
  const frozenSuccessByHash = frozenPrimitive ? new Map(runs[0].map((r) => [r.hash, r.primitiveSuccess[frozenPrimitive]])) : null;

  return runs.map((run) => {
    let count = 0;
    for (const r of run) {
      const allFail = PRIMITIVES.every((p) => {
        const success = frozenPrimitive === p ? (frozenSuccessByHash!.get(r.hash) ?? false) : r.primitiveSuccess[p];
        return !success;
      });
      if (allFail) count++;
    }
    return count;
  });
}

export interface PrimitiveContribution {
  primitive: AllowedPrimitive;
  frozenStats: SampleStats;
  varianceReductionRatio: number; // 1 - (frozenVariance / realVariance) -- fraction of Gap Total variance attributable to this Primitive
}

export interface NoiseDecompositionResult {
  realGapTotalStats: SampleStats; // actual per-run Gap Total, all 5 Primitives varying (the same figure GapClassificationMethods.ts's confidenceInterval reports)
  perPrimitiveContribution: PrimitiveContribution[]; // sorted descending by varianceReductionRatio
  dominantSource: AllowedPrimitive; // the single largest contributor
}

export function decomposeNoiseSources(runs: readonly RunRecord[]): NoiseDecompositionResult {
  const realGapTotals = computeGapTotalsWithFrozen(runs, null);
  const realStats = computeStats(realGapTotals);
  const realVariance = realStats.stddev ** 2;

  const perPrimitiveContribution: PrimitiveContribution[] = PRIMITIVES.map((p) => {
    const frozenTotals = computeGapTotalsWithFrozen(runs, p);
    const frozenStats = computeStats(frozenTotals);
    const frozenVariance = frozenStats.stddev ** 2;
    const varianceReductionRatio = realVariance !== 0 ? 1 - frozenVariance / realVariance : 0;
    return { primitive: p, frozenStats, varianceReductionRatio };
  }).sort((a, b) => b.varianceReductionRatio - a.varianceReductionRatio);

  return {
    realGapTotalStats: realStats,
    perPrimitiveContribution,
    dominantSource: perPrimitiveContribution[0].primitive,
  };
}
