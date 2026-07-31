// --- DoseResponse (Parity-Gated Cycle Integration Planning Refinement
// Sprint v1, STEP3) ----------------------------------------------------------
// Adjacent-pair analysis (matches this arc's own established convention,
// e.g. EndgameRefinementV2/AdjacentPairAnalysis.ts's "paired-diff, not
// simple avg comparison") over BudgetSweep.ts's own 7-point Capability
// Curve: for each adjacent budget pair, incremental gain (improvedCount
// delta), marginal improvement rate (delta per additional ms), and rescue
// efficiency (improvedCount / avgRuntimeMsAmongMatched, "how much rescue
// per ms spent") -- together these distinguish "still climbing" from
// "plateaued" without assuming a shape in advance.
import type { BudgetResult } from "./BudgetSweep";

export interface DoseResponsePoint {
  budgetMs: number;
  improvedCount: number;
  rescueRate: number;
  rescueEfficiency: number; // improvedCount / avgRuntimeMsAmongMatched (0 if runtime is 0)
}

export interface AdjacentPairDelta {
  fromBudgetMs: number;
  toBudgetMs: number;
  incrementalGain: number; // improvedCount(to) - improvedCount(from)
  marginalImprovementPerMs: number; // incrementalGain / (toBudgetMs - fromBudgetMs)
  plateaued: boolean; // incrementalGain <= 0
}

export function buildDoseResponseCurve(results: readonly BudgetResult[]): DoseResponsePoint[] {
  return results.map((r) => ({
    budgetMs: r.budgetMs,
    improvedCount: r.summary.improvedCount,
    rescueRate: r.summary.rescueRate,
    rescueEfficiency: r.summary.avgRuntimeMsAmongMatched > 0 ? r.summary.improvedCount / r.summary.avgRuntimeMsAmongMatched : 0,
  }));
}

export function analyzeAdjacentPairs(curve: readonly DoseResponsePoint[]): AdjacentPairDelta[] {
  const deltas: AdjacentPairDelta[] = [];
  for (let i = 1; i < curve.length; i++) {
    const from = curve[i - 1];
    const to = curve[i];
    const incrementalGain = to.improvedCount - from.improvedCount;
    const marginalImprovementPerMs = incrementalGain / (to.budgetMs - from.budgetMs);
    deltas.push({ fromBudgetMs: from.budgetMs, toBudgetMs: to.budgetMs, incrementalGain, marginalImprovementPerMs, plateaued: incrementalGain <= 0 });
  }
  return deltas;
}

export interface DoseResponseSummary {
  curve: DoseResponsePoint[];
  deltas: AdjacentPairDelta[];
  anyImprovementAcrossWholeRange: boolean; // curve[last].improvedCount > curve[0].improvedCount
  monotonicNonDecreasing: boolean; // no adjacent pair ever decreases
  plateauStartsAtBudgetMs: number | null; // first budget from which every subsequent delta is <=0, or null if never plateaus within tested range
}

export function summarizeDoseResponse(results: readonly BudgetResult[]): DoseResponseSummary {
  const curve = buildDoseResponseCurve(results);
  const deltas = analyzeAdjacentPairs(curve);
  const anyImprovementAcrossWholeRange = curve.length > 0 && curve[curve.length - 1].improvedCount > curve[0].improvedCount;
  const monotonicNonDecreasing = deltas.every((d) => d.incrementalGain >= 0);

  let plateauStartsAtBudgetMs: number | null = null;
  for (let i = 0; i < deltas.length; i++) {
    if (deltas.slice(i).every((d) => d.plateaued)) {
      plateauStartsAtBudgetMs = deltas[i].fromBudgetMs;
      break;
    }
  }

  return { curve, deltas, anyImprovementAcrossWholeRange, monotonicNonDecreasing, plateauStartsAtBudgetMs };
}
