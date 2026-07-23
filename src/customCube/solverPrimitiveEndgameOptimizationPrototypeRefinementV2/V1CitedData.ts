// --- V1CitedData (ENDGAME Optimization Prototype Refinement Sprint v2)
// -----------------------------------------------------------------------
// Verbatim, already-real numbers from Refinement Sprint v1's own report
// (endgame-optimization-prototype-refinement-v1-report.txt, STEP1/2 table,
// N=30 trials/75-snapshot subsample) for the 6 budget points this Sprint
// does NOT re-measure (400/375/350/325/300/275ms) -- cited, not estimated,
// for the combined 16-point Pareto Frontier (STEP3), matching this whole
// research arc's own established precedent of reusing already-real data
// for a synthesis step that doesn't itself require fresh measurement.
// 450ms and 250ms ARE re-measured fresh this Sprint (see BudgetSweep.ts) --
// only these middle 6 points are cited.
import type { BudgetPoint } from "./ParetoFrontierRevision";

export const V1_CITED_POINTS: readonly BudgetPoint[] = [
  { budgetMs: 400, avgImprovedCount: 57.2, avgWallMs: 1053.5, avgTrueRegressionRate: 0.0324 },
  { budgetMs: 375, avgImprovedCount: 57.33, avgWallMs: 1055.5, avgTrueRegressionRate: 0.0324 },
  { budgetMs: 350, avgImprovedCount: 57.33, avgWallMs: 1053.1, avgTrueRegressionRate: 0.0284 },
  { budgetMs: 325, avgImprovedCount: 57.67, avgWallMs: 1049.2, avgTrueRegressionRate: 0.032 },
  { budgetMs: 300, avgImprovedCount: 58.07, avgWallMs: 1046.2, avgTrueRegressionRate: 0.0316 },
  { budgetMs: 275, avgImprovedCount: 58.23, avgWallMs: 1045.4, avgTrueRegressionRate: 0.0293 },
];
