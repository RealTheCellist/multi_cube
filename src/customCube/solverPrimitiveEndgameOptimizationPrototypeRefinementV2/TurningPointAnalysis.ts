// --- TurningPointAnalysis (ENDGAME Optimization Prototype Refinement
// Sprint v2, STEP2) ----------------------------------------------------------
// Classifies each adjacent-pair segment (from AdjacentPairAnalysis.ts's own
// paired-diff, not a raw threshold on the averages) as "increasing"
// (smaller budget statistically better -- the v1 trend continues),
// "plateau" (95% CI includes 0 -- statistically indistinguishable), or
// "decreasing" (smaller budget statistically WORSE -- the curve has turned
// over), then locates the first segment that isn't "increasing" scanning
// from 250ms downward.
import type { PairEvaluation } from "./AdjacentPairAnalysis";

export type SegmentClassification = "increasing" | "plateau" | "decreasing";

export interface SegmentVerdict {
  largerBudgetMs: number;
  smallerBudgetMs: number;
  classification: SegmentClassification;
}

export interface TurningPointResult {
  segments: SegmentVerdict[];
  turningPointAt: { largerBudgetMs: number; smallerBudgetMs: number; classification: SegmentClassification } | null; // null if still increasing throughout
  overallVerdict: string;
}

function classifySegment(pair: PairEvaluation): SegmentClassification {
  if (!pair.distinguishable) return "plateau";
  return pair.primary.stats.mean > 0 ? "increasing" : "decreasing";
}

export function analyzeTurningPoint(pairs: readonly PairEvaluation[]): TurningPointResult {
  const segments: SegmentVerdict[] = pairs.map((p) => ({
    largerBudgetMs: p.largerBudgetMs,
    smallerBudgetMs: p.smallerBudgetMs,
    classification: classifySegment(p),
  }));

  const firstNonIncreasing = segments.find((s) => s.classification !== "increasing");
  const turningPointAt = firstNonIncreasing ?? null;

  let overallVerdict: string;
  if (!turningPointAt) {
    overallVerdict = `Capability keeps INCREASING (statistically distinguishable) at every step from ${segments[0]?.largerBudgetMs}ms down to ${segments[segments.length - 1]?.smallerBudgetMs}ms -- no turning point found within this Sprint's own swept range.`;
  } else if (turningPointAt.classification === "plateau") {
    overallVerdict = `Capability PLATEAUS starting at the ${turningPointAt.largerBudgetMs}ms -> ${turningPointAt.smallerBudgetMs}ms step (95% CI includes 0, statistically indistinguishable) -- ${turningPointAt.largerBudgetMs}ms is the point past which further budget reduction stops helping, within measurement precision.`;
  } else {
    overallVerdict = `Capability starts DECREASING at the ${turningPointAt.largerBudgetMs}ms -> ${turningPointAt.smallerBudgetMs}ms step (statistically significant reversal) -- ${turningPointAt.largerBudgetMs}ms is the last budget on the improving side of the curve.`;
  }

  return { segments, turningPointAt, overallVerdict };
}
